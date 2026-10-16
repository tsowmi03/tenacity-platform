"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { toHttpsError } = require("../shared/errors");
const {
  canCreateGroupChat,
  groupMemberKey,
  groupMembersFor,
  isGroupMemberRole,
  memberNameFrom,
} = require("./groupChat");

/**
 * Starts a group chat, or returns the one these people already share (MOB-54).
 *
 * A callable rather than a client write because the rule that matters — only
 * staff start groups — is a check on the caller's role, and the rules are the
 * wrong place to also validate every member and denormalise their names. The
 * rules now refuse any client-created chat with more than two people, so this
 * is the only way a group comes into being.
 *
 * Role comes from the users document, not the auth claim, matching the other
 * role checks in this package: older accounts predate the `role` claim.
 *
 * The existing-group lookup runs inside the transaction, so two staff members
 * starting the same group at the same moment converge on one document.
 */
async function createGroupChatImpl({ uid, participantIds, deps }) {
  const { db, serverTimestamp } = deps;
  if (!db) throw new TypeError("createGroupChatImpl requires db");
  if (!serverTimestamp) {
    throw new TypeError("createGroupChatImpl requires serverTimestamp");
  }
  if (!uid) throw new TypeError("createGroupChatImpl requires uid");

  let members;
  try {
    members = groupMembersFor({ creatorId: uid, participantIds });
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }

  const userSnaps = await db.getAll(
    ...members.map((memberId) => db.collection("users").doc(memberId))
  );

  const creator = userSnaps[0];
  if (!creator.exists || !canCreateGroupChat((creator.data() || {}).role)) {
    throw new HttpsError(
      "permission-denied",
      "Only Tenacity staff can start a group."
    );
  }

  const participantNames = {};
  for (const snap of userSnaps) {
    const data = snap.data() || {};
    if (!snap.exists || !isGroupMemberRole(data.role)) {
      throw new HttpsError(
        "invalid-argument",
        "One of the people picked is not available to message."
      );
    }
    participantNames[snap.id] = memberNameFrom(data);
  }

  const memberKey = groupMemberKey(members);
  const chats = db.collection("chats");

  return db.runTransaction(async (txn) => {
    const existing = await txn.get(
      chats.where("memberKey", "==", memberKey).limit(10)
    );
    const reusable = existing.docs.find((doc) => {
      const data = doc.data() || {};
      return data.isGroup === true && data.inactive !== true;
    });
    if (reusable) return { chatId: reusable.id, created: false };

    const ref = chats.doc();
    const zeroes = Object.fromEntries(members.map((memberId) => [memberId, 0]));
    txn.set(ref, {
      isGroup: true,
      participants: members,
      participantNames,
      memberKey,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: "",
      unreadCounts: zeroes,
      deletedFor: {},
      typingStatus: {},
      typingHeartbeats: {},
      lastReadAt: {},
      inactive: false,
    });
    return { chatId: ref.id, created: true };
  });
}

const createGroupChat = onCall({ region: "us-central1" }, async (request) => {
  const uid = request?.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign-in required");
  }
  try {
    return await createGroupChatImpl({
      uid,
      participantIds: request.data?.participantIds,
      deps: {
        db: admin.firestore(),
        serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  } catch (err) {
    if (!(err instanceof HttpsError)) {
      logger.error("[createGroupChat] failed", {
        uid,
        errorMessage: err?.message,
      });
    }
    throw toHttpsError(err);
  }
});

module.exports = {
  createGroupChat,
  createGroupChatImpl,
};
