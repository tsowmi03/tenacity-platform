"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { toHttpsError } = require("../shared/errors");
const {
  GROUP_ACTIVITY_MESSAGE_TYPE,
  MAX_GROUP_MEMBERS,
  canManageGroupMembers,
  canRenameGroupChat,
  groupMemberKey,
  isGroupMemberRole,
  joinNames,
  memberFirstName,
  memberNameFrom,
  normaliseGroupName,
} = require("./groupChat");
const { buildPruneUpdate } = require("./orphanedChats");

/**
 * Renames a group and changes its members (MOB-70).
 *
 * Callables rather than client writes, because the rules cannot check who
 * holds control of a group: that depends on the current role of every member.
 *
 * Each change also writes a line into the thread. The line is an ordinary
 * message document with `senderId` set to whoever made the change, so builds
 * released before this show it as a normal bubble from that person.
 */

const DUPLICATE_GROUP_MESSAGE =
  "These people already have a group together.";

function validId(value, label) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("/")) {
    throw new HttpsError("invalid-argument", `Missing or invalid ${label}`);
  }
  return value;
}

function activeGroupFor(chatSnap, uid) {
  const chat = chatSnap.exists ? chatSnap.data() || {} : null;
  if (!chat || chat.isGroup !== true) {
    throw new HttpsError("not-found", "Group not found.");
  }
  if (!Array.isArray(chat.participants) || !chat.participants.includes(uid)) {
    throw new HttpsError("permission-denied", "You are not in this group.");
  }
  if (chat.inactive === true) {
    throw new HttpsError(
      "failed-precondition",
      "This conversation is no longer available."
    );
  }
  return chat;
}

function usersFrom(snaps) {
  return new Map(snaps.map((snap) => [snap.id, snap.exists ? snap.data() || {} : null]));
}

function roleOf(users, uid) {
  return (users.get(uid) || {}).role;
}

function accessFor(users, chat, uid) {
  const actorRole = roleOf(users, uid);
  return {
    canRename: canRenameGroupChat(actorRole),
    canManageMembers: canManageGroupMembers({
      actorRole,
      memberRoles: chat.participants.map((id) => roleOf(users, id)),
    }),
  };
}

function requireMemberManagement(users, chat, uid) {
  if (!accessFor(users, chat, uid).canManageMembers) {
    throw new HttpsError(
      "permission-denied",
      "You cannot change who is in this group."
    );
  }
}

/** Refuses a change that would give [memberKey] a second active group. */
async function refuseDuplicate({ txn, db, chatId, memberKey }) {
  const matches = await txn.get(
    db.collection("chats").where("memberKey", "==", memberKey).limit(10)
  );
  const duplicate = matches.docs.some((doc) => {
    const data = doc.data() || {};
    return doc.id !== chatId && data.isGroup === true && data.inactive !== true;
  });
  if (duplicate) {
    throw new HttpsError("failed-precondition", DUPLICATE_GROUP_MESSAGE);
  }
}

async function usersForTxn({ txn, db, uids }) {
  const refs = uids.map((uid) => db.collection("users").doc(uid));
  return usersFrom(await txn.getAll(...refs));
}

async function planRename({ txn, db, chat, uid, data, fieldValue }) {
  let name;
  try {
    name = normaliseGroupName(data.name);
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }

  const users = await usersForTxn({ txn, db, uids: [uid] });
  if (!canRenameGroupChat(roleOf(users, uid))) {
    throw new HttpsError(
      "permission-denied",
      "Only Tenacity staff can rename a group."
    );
  }

  if (name === (typeof chat.name === "string" ? chat.name : "")) return null;

  const actor = memberFirstName(chat.participantNames, uid);
  return {
    update: { name: name === "" ? fieldValue.delete() : name },
    text: name === ""
      ? `${actor} removed the group's name`
      : `${actor} renamed the group to ${name}`,
  };
}

async function planAdd({ txn, db, chat, chatId, uid, data, fieldValue }) {
  if (!Array.isArray(data.userIds)) {
    throw new HttpsError("invalid-argument", "Missing or invalid userIds");
  }
  const added = [
    ...new Set(data.userIds.map((id) => validId(id, "userIds"))),
  ].filter((id) => !chat.participants.includes(id));
  if (added.length === 0) return null;

  const participants = [...chat.participants, ...added];
  if (participants.length > MAX_GROUP_MEMBERS) {
    throw new HttpsError(
      "invalid-argument",
      `A group can have at most ${MAX_GROUP_MEMBERS} people.`
    );
  }

  const users = await usersForTxn({ txn, db, uids: participants });
  requireMemberManagement(users, chat, uid);

  const names = {};
  for (const id of added) {
    const user = users.get(id);
    if (!user || !isGroupMemberRole(user.role)) {
      throw new HttpsError(
        "invalid-argument",
        "One of the people picked is not available to message."
      );
    }
    names[id] = memberNameFrom(user);
  }

  const memberKey = groupMemberKey(participants);
  await refuseDuplicate({ txn, db, chatId, memberKey });

  const update = { participants, memberKey };
  for (const id of added) {
    update[`participantNames.${id}`] = names[id];
    update[`unreadCounts.${id}`] = 0;
    update[`deletedFor.${id}`] = fieldValue.delete();
  }

  const actor = memberFirstName(chat.participantNames, uid);
  const nameList = joinNames(added.map((id) => memberFirstName(names, id)));
  return { update, text: `${actor} added ${nameList}` };
}

async function planRemove({ txn, db, chat, chatId, uid, data, fieldValue }) {
  const target = validId(data.userId, "userId");
  if (target === uid) {
    throw new HttpsError("invalid-argument", "Leave the group instead.");
  }
  if (!chat.participants.includes(target)) return null;

  const users = await usersForTxn({ txn, db, uids: chat.participants });
  requireMemberManagement(users, chat, uid);

  const remainingParticipants = chat.participants.filter((id) => id !== target);
  if (remainingParticipants.length < 2) {
    throw new HttpsError(
      "failed-precondition",
      "A group needs at least two people."
    );
  }

  const update = buildPruneUpdate({
    deadUids: [target],
    remainingParticipants,
    fieldValue,
  });
  await refuseDuplicate({ txn, db, chatId, memberKey: update.memberKey });

  const actor = memberFirstName(chat.participantNames, uid);
  const removed = memberFirstName(chat.participantNames, target);
  return { update, text: `${actor} removed ${removed}` };
}

/**
 * Nobody can be kept in a group against their wishes, so leaving skips the
 * duplicate check that adding and removing go through. A group left with one
 * person is retired, as it has nobody to talk to.
 */
function planLeave({ chat, uid, fieldValue }) {
  const remainingParticipants = chat.participants.filter((id) => id !== uid);
  const update = buildPruneUpdate({
    deadUids: [uid],
    remainingParticipants,
    fieldValue,
  });
  if (remainingParticipants.length < 2) update.inactive = true;

  const actor = memberFirstName(chat.participantNames, uid);
  return { update, text: `${actor} left the group` };
}

const PLANS = {
  rename: planRename,
  add: planAdd,
  remove: planRemove,
  leave: planLeave,
};

async function updateGroupChatImpl({ uid, data, deps }) {
  const { db, serverTimestamp, fieldValue } = deps;
  if (!db) throw new TypeError("updateGroupChatImpl requires db");
  if (!serverTimestamp) {
    throw new TypeError("updateGroupChatImpl requires serverTimestamp");
  }
  if (!fieldValue) {
    throw new TypeError("updateGroupChatImpl requires fieldValue");
  }
  if (!uid) throw new TypeError("updateGroupChatImpl requires uid");

  const request = data && typeof data === "object" ? data : {};
  const chatId = validId(request.chatId, "chatId");
  const plan = Object.prototype.hasOwnProperty.call(PLANS, request.action)
    ? PLANS[request.action]
    : null;
  if (!plan) {
    throw new HttpsError("invalid-argument", "Missing or invalid action");
  }

  const chatRef = db.collection("chats").doc(chatId);
  return db.runTransaction(async (txn) => {
    const chat = activeGroupFor(await txn.get(chatRef), uid);
    const change = await plan({
      txn,
      db,
      chat,
      chatId,
      uid,
      data: request,
      fieldValue,
    });
    // Already in the requested state, so a repeat adds no line to the thread.
    if (!change) return { changed: false };

    txn.set(chatRef.collection("messages").doc(), {
      senderId: uid,
      text: change.text,
      type: GROUP_ACTIVITY_MESSAGE_TYPE,
      timestamp: serverTimestamp(),
      readBy: {},
      isPending: false,
    });
    txn.update(chatRef, {
      ...change.update,
      updatedAt: serverTimestamp(),
      // A group nobody has written in stays out of inboxes until its first
      // real message, so activity does not count as starting the conversation.
      ...(chat.lastMessage ? { lastMessage: change.text } : {}),
    });
    return { changed: true };
  });
}

/** What the caller can do in a group, so the app only offers what will work. */
async function getGroupChatAccessImpl({ uid, chatId, deps }) {
  const { db } = deps;
  if (!db) throw new TypeError("getGroupChatAccessImpl requires db");
  if (!uid) throw new TypeError("getGroupChatAccessImpl requires uid");

  const chatSnap = await db
    .collection("chats")
    .doc(validId(chatId, "chatId"))
    .get();
  const chat = activeGroupFor(chatSnap, uid);
  const snaps = await db.getAll(
    ...chat.participants.map((id) => db.collection("users").doc(id))
  );
  return accessFor(usersFrom(snaps), chat, uid);
}

function callable(name, handler) {
  return onCall({ region: "us-central1" }, async (request) => {
    const uid = request?.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign-in required");
    }
    try {
      return await handler(uid, request.data);
    } catch (err) {
      if (!(err instanceof HttpsError)) {
        logger.error(`[${name}] failed`, { uid, errorMessage: err?.message });
      }
      throw toHttpsError(err);
    }
  });
}

const updateGroupChat = callable("updateGroupChat", (uid, data) =>
  updateGroupChatImpl({
    uid,
    data,
    deps: {
      db: admin.firestore(),
      serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      fieldValue: admin.firestore.FieldValue,
    },
  })
);

const getGroupChatAccess = callable("getGroupChatAccess", (uid, data) =>
  getGroupChatAccessImpl({
    uid,
    chatId: data?.chatId,
    deps: { db: admin.firestore() },
  })
);

module.exports = {
  getGroupChatAccess,
  getGroupChatAccessImpl,
  updateGroupChat,
  updateGroupChatImpl,
};
