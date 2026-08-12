"use strict";

/**
 * What to do with a chat when one of its participants is being deleted.
 *
 * Deleting a user has never touched `chats`, which is why parents ended up with
 * "Unknown User" rows they could still type into. The fix is not simply "delete
 * the thread": whose conversation it was matters.
 *
 *   - A test/internal account's threads carry nothing worth keeping, so they go
 *     entirely, messages included.
 *   - A real user's threads are a record of what was said to a family. Those are
 *     deactivated rather than destroyed: hidden from every inbox, still in
 *     Firestore.
 *   - Group threads outlive any one member either way.
 *
 * Pure, so the policy is testable without Firestore and reads in one place.
 */

/**
 * @param {object} params
 * @param {unknown} params.participants   Raw `participants` off the chat doc.
 * @param {string} params.deletedUid      The account being removed.
 * @param {boolean} params.deleteHistory  True for internal/test accounts.
 * @returns {{action: 'skip'|'delete'|'deactivate'|'prune', remainingParticipants: string[]}}
 */
function planChatCleanup({ participants, deletedUid, deleteHistory }) {
  if (typeof deletedUid !== "string" || deletedUid === "") {
    throw new TypeError("planChatCleanup requires deletedUid");
  }

  if (!Array.isArray(participants)) {
    return { action: "skip", remainingParticipants: [] };
  }

  const uids = participants.filter(
    (uid) => typeof uid === "string" && uid.trim() !== ""
  );
  if (!uids.includes(deletedUid)) {
    // The query that produced this chat matched on the uid, so this means the
    // doc changed underneath us. Leaving it alone is the safe response.
    return { action: "skip", remainingParticipants: uids };
  }

  const remainingParticipants = uids.filter((uid) => uid !== deletedUid);

  // Two or more live members still have a conversation to continue.
  if (remainingParticipants.length >= 2) {
    return { action: "prune", remainingParticipants };
  }

  return {
    action: deleteHistory ? "delete" : "deactivate",
    remainingParticipants,
  };
}

/**
 * Update that retires a thread without destroying it.
 *
 * `inactive` is the durable flag and what `getUserChats` filters on. The
 * `deletedFor` stamps are deliberate redundancy: app builds already installed
 * on parents' phones know nothing about `inactive`, and they do honour
 * `deletedFor`. Without them this fix would only reach users who update.
 *
 * Takes a list of departed uids rather than one: a thread remediated long after
 * the fact may have lost several participants across separate deletions.
 *
 * @param {object} params
 * @param {string[]} params.participants   Every participant, including the departed ones.
 * @param {string[]} params.deletedUids    Who is gone.
 * @param {object} params.timestamp        Firestore Timestamp for the stamps.
 */
function buildDeactivateUpdate({ participants, deletedUids, timestamp }) {
  if (!timestamp) throw new TypeError("buildDeactivateUpdate requires timestamp");
  if (!Array.isArray(deletedUids) || deletedUids.length === 0) {
    throw new TypeError("buildDeactivateUpdate requires a non-empty deletedUids");
  }

  const update = {
    inactive: true,
    inactiveAt: timestamp,
    inactiveReason: "participant-deleted",
    inactiveParticipants: deletedUids,
  };
  for (const uid of participants) {
    update[`deletedFor.${uid}`] = timestamp;
    // Zeroed as well: the inbox badge sums `unreadCounts` across every chat the
    // user participates in, so unread messages on a now-hidden thread would
    // leave a count the user has no way to clear.
    update[`unreadCounts.${uid}`] = 0;
  }
  return update;
}

module.exports = {
  buildDeactivateUpdate,
  planChatCleanup,
};
