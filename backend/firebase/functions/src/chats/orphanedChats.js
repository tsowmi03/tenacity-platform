"use strict";

/**
 * Decides what to do with a chat whose participants may no longer exist.
 *
 * Deleting a user has never touched `chats` (see `users/deleteUser.js`), so
 * every account removed to date has left its threads behind. The remaining
 * participant still sees the thread in their inbox — rendered as
 * "Unknown User", because the name lookup finds no `users` doc — and can still
 * send into it, since `sendChatMessage` only checks that the sender is a
 * participant.
 *
 * Kept pure and separate from the Firestore work so the policy below can be
 * tested directly, and so the one-off remediation script and the delete-time
 * cleanup can share one definition of "orphaned".
 *
 * @param {object} params
 * @param {unknown} params.participants  Raw `participants` field off the chat doc.
 * @param {Set<string>} params.liveUids  Uids that still have a `users` doc.
 * @returns {{action: 'none'|'delete'|'prune', reason: string, deadUids: string[], remainingParticipants: string[]}}
 */
function classifyChat({ participants, liveUids }) {
  if (!(liveUids instanceof Set)) {
    throw new TypeError("classifyChat requires liveUids to be a Set");
  }

  // A chat with no usable participant list can't be opened by anyone — the
  // rules gate every read on `uid in resource.data.participants`. Treated as
  // deletable, but reported under its own reason so a dry run surfaces it
  // rather than folding it in with ordinary orphans.
  if (!Array.isArray(participants)) {
    return {
      action: "delete",
      reason: "malformed-participants",
      deadUids: [],
      remainingParticipants: [],
    };
  }

  const uids = participants.filter(
    (uid) => typeof uid === "string" && uid.trim() !== ""
  );
  if (uids.length !== participants.length) {
    return {
      action: "delete",
      reason: "malformed-participants",
      deadUids: [],
      remainingParticipants: [],
    };
  }

  const deadUids = uids.filter((uid) => !liveUids.has(uid));
  if (deadUids.length === 0) {
    return {
      action: "none",
      reason: "all-participants-live",
      deadUids: [],
      remainingParticipants: uids,
    };
  }

  const remainingParticipants = uids.filter((uid) => liveUids.has(uid));

  // A one-to-one thread whose other party is gone has no future: nobody can
  // reply, and the surviving side only sees a dead row. Group threads keep
  // going, so they lose the dead uid and survive — until too few live members
  // remain for it to be a conversation at all.
  if (uids.length <= 2 || remainingParticipants.length < 2) {
    return {
      action: "delete",
      reason:
        remainingParticipants.length === 0
          ? "no-live-participants"
          : "one-to-one-with-deleted-user",
      deadUids,
      remainingParticipants,
    };
  }

  return {
    action: "prune",
    reason: "group-with-deleted-member",
    deadUids,
    remainingParticipants,
  };
}

/**
 * Per-participant maps on a chat doc are keyed by uid, so pruning a member has
 * to clear their entries too or they linger forever — `unreadCounts` in
 * particular is summed for the inbox badge in `fetchUnreadMessagesCount`.
 */
const PARTICIPANT_KEYED_FIELDS = ["unreadCounts", "typingStatus", "deletedFor"];

/**
 * Builds the update that removes [deadUids] from a group chat.
 *
 * @param {object} params
 * @param {string[]} params.deadUids
 * @param {string[]} params.remainingParticipants
 * @param {object} params.fieldValue  `admin.firestore.FieldValue`, injected so
 *   this stays unit-testable.
 */
function buildPruneUpdate({ deadUids, remainingParticipants, fieldValue }) {
  if (!fieldValue?.delete) {
    throw new TypeError("buildPruneUpdate requires FieldValue");
  }

  const update = { participants: remainingParticipants };
  for (const uid of deadUids) {
    for (const field of PARTICIPANT_KEYED_FIELDS) {
      update[`${field}.${uid}`] = fieldValue.delete();
    }
  }
  return update;
}

module.exports = {
  PARTICIPANT_KEYED_FIELDS,
  buildPruneUpdate,
  classifyChat,
};
