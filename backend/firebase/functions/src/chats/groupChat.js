"use strict";

const { createHash } = require("crypto");

/**
 * Group chats (MOB-54): the rules every group path shares, kept pure so they
 * are testable without Firestore and defined in one place.
 *
 * A group is a chat document with `isGroup: true`. It has no name of its own;
 * it is labelled by its members, from the viewer's side, the way iMessage
 * labels an unnamed group. Members' names live on the chat as
 * `participantNames`, because a parent cannot read another parent's user
 * document and would otherwise have no way to say who is in the group.
 *
 * The app mirrors `groupLabel` in `Chat.groupLabel` (chat_model.dart). The two
 * must agree, or a notification and the inbox row it opens name the same
 * group differently.
 */

/** iMessage's ceiling, creator included. */
const MAX_GROUP_MEMBERS = 32;

/** Fewest people that make a group rather than a one-to-one thread. */
const MIN_GROUP_MEMBERS = 3;

/** Who may start a group. Parents can be members but never creators. */
const GROUP_CREATOR_ROLES = new Set(["admin", "tutor"]);

const MEMBER_ROLES = new Set(["admin", "tutor", "parent"]);

function canCreateGroupChat(role) {
  return typeof role === "string" && GROUP_CREATOR_ROLES.has(role);
}

function isGroupMemberRole(role) {
  return typeof role === "string" && MEMBER_ROLES.has(role);
}

/**
 * The full member list for a new group: creator first, then the people picked,
 * in the order they were picked, with duplicates and the creator dropped from
 * the picks.
 *
 * Order matters only for the label, which names members in this order. Keeping
 * the picked order means the label reads the way the creator built the group.
 *
 * Throws a plain `RangeError`/`TypeError`; the callable maps it to an
 * `invalid-argument` for the client.
 */
function groupMembersFor({ creatorId, participantIds }) {
  if (typeof creatorId !== "string" || creatorId === "") {
    throw new TypeError("groupMembersFor requires creatorId");
  }
  if (!Array.isArray(participantIds)) {
    throw new TypeError("participantIds must be a list");
  }

  const members = [creatorId];
  for (const uid of participantIds) {
    if (typeof uid !== "string" || uid.trim() === "" || uid.includes("/")) {
      throw new TypeError("participantIds must be user ids");
    }
    if (!members.includes(uid)) members.push(uid);
  }

  if (members.length < MIN_GROUP_MEMBERS) {
    throw new RangeError("A group needs at least two other people");
  }
  if (members.length > MAX_GROUP_MEMBERS) {
    throw new RangeError(`A group can have at most ${MAX_GROUP_MEMBERS} people`);
  }
  return members;
}

/**
 * A stable key for a set of members, whatever order they were picked in.
 *
 * Starting a group with people who already share one opens that group rather
 * than a second, as in iMessage. Hashed so the key stays a fixed, indexable
 * length however many members there are.
 */
function groupMemberKey(uids) {
  const sorted = [...new Set(uids)].sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex");
}

/** The name fields a group stores for one member, from their user document. */
function memberNameFrom(userData) {
  const data = userData || {};
  return {
    firstName: typeof data.firstName === "string" ? data.firstName.trim() : "",
    lastName: typeof data.lastName === "string" ? data.lastName.trim() : "",
  };
}

/** What a member is called in a label or above a bubble. */
function memberFirstName(participantNames, uid) {
  const name = participantNames?.[uid];
  const first = typeof name?.firstName === "string" ? name.firstName.trim() : "";
  if (first) return first;
  const last = typeof name?.lastName === "string" ? name.lastName.trim() : "";
  return last || "Unknown";
}

/**
 * The group's label as [viewerId] sees it: everyone but them, by first name.
 *
 *   one other     `Sarah`
 *   two others    `Sarah & Tom`
 *   three others  `Sarah, Tom & Ana`
 *   four or more  `Sarah, Tom & 2 others`
 */
function groupLabel({ participants, participantNames, viewerId }) {
  const others = (Array.isArray(participants) ? participants : [])
    .filter((uid) => typeof uid === "string" && uid !== viewerId)
    .map((uid) => memberFirstName(participantNames, uid));

  if (others.length === 0) return "Just you";
  if (others.length === 1) return others[0];
  if (others.length === 2) return `${others[0]} & ${others[1]}`;
  if (others.length === 3) return `${others[0]}, ${others[1]} & ${others[2]}`;
  return `${others[0]}, ${others[1]} & ${others.length - 2} others`;
}

function isGroupChat(chatData) {
  return chatData?.isGroup === true;
}

module.exports = {
  MAX_GROUP_MEMBERS,
  MIN_GROUP_MEMBERS,
  canCreateGroupChat,
  groupLabel,
  groupMemberKey,
  groupMembersFor,
  isGroupChat,
  isGroupMemberRole,
  memberFirstName,
  memberNameFrom,
};
