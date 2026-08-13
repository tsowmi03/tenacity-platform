"use strict";

const { buildPruneUpdate } = require("./orphanedChats");

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

/**
 * Plan and apply chat cleanup for a user who is being (or has just been)
 * deleted. Standalone: it owns its own batching and commits immediately.
 *
 * `deleteUserImpl` deliberately does NOT use this. There, the chat writes ride
 * in the same atomic batch as the `users/{uid}` delete, which is strictly
 * better — either the user and their chats both go, or neither does. This
 * exists for callers that cannot offer that, notably `deleteUserByUidV2`,
 * where the client has already deleted the user document before calling.
 *
 * Both paths share `planChatCleanup` / `buildDeactivateUpdate` /
 * `buildPruneUpdate`, so the policy itself is defined and tested once. Only
 * the batching differs. Change the policy in this file and both follow.
 *
 * Call this AFTER the user is gone, never before. If it fails partway, the
 * result is orphaned threads — the pre-existing condition, repairable with
 * `scripts/purgeOrphanedChats.js`. Running it first and then failing to delete
 * the user would instead hide a live user's real conversations.
 *
 * @returns {Promise<{chatsDeleted: number, chatsDeactivated: number, chatsPruned: number}>}
 */
async function applyChatCleanupForUser({
  db,
  fieldValue,
  uid,
  deleteHistory = false,
  timestamp,
  logger = console,
}) {
  if (!db) throw new TypeError("applyChatCleanupForUser requires db");
  if (!fieldValue?.delete) {
    throw new TypeError("applyChatCleanupForUser requires FieldValue");
  }
  if (typeof uid !== "string" || uid === "") {
    throw new TypeError("applyChatCleanupForUser requires uid");
  }
  if (!timestamp) {
    throw new TypeError("applyChatCleanupForUser requires timestamp");
  }

  const chatSnap = await db
    .collection("chats")
    .where("participants", "array-contains", uid)
    .get();

  const stats = { chatsDeleted: 0, chatsDeactivated: 0, chatsPruned: 0 };
  const pendingDeletes = [];

  // Chunked well under Firestore's 500-op batch limit. `deleteUserImpl` can
  // refuse an oversized cleanup outright; this path cannot, because it also
  // serves a user deleting their own account.
  const BATCH_LIMIT = 400;
  let batch = db.batch();
  let batched = 0;

  for (const chat of chatSnap.docs) {
    const plan = planChatCleanup({
      participants: (chat.data() || {}).participants,
      deletedUid: uid,
      deleteHistory,
    });

    if (plan.action === "skip") continue;
    if (plan.action === "delete") {
      pendingDeletes.push(chat.ref);
      continue;
    }

    if (plan.action === "prune") {
      batch.update(
        chat.ref,
        buildPruneUpdate({
          deadUids: [uid],
          remainingParticipants: plan.remainingParticipants,
          fieldValue,
        })
      );
      stats.chatsPruned += 1;
    } else {
      batch.update(
        chat.ref,
        buildDeactivateUpdate({
          participants: [...plan.remainingParticipants, uid],
          deletedUids: [uid],
          timestamp,
        })
      );
      stats.chatsDeactivated += 1;
    }

    batched += 1;
    if (batched >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      batched = 0;
    }
  }

  if (batched > 0) await batch.commit();

  for (const ref of pendingDeletes) {
    try {
      // Firestore does not cascade; the messages subcollection must go too.
      await db.recursiveDelete(ref);
      stats.chatsDeleted += 1;
    } catch (err) {
      // Best-effort: the user is already gone, and a stranded thread is
      // recoverable with scripts/purgeOrphanedChats.js.
      logger.warn?.("[applyChatCleanupForUser] chat deletion failed", {
        uid,
        chatId: ref.id,
        errorMessage: err?.message,
      });
    }
  }

  return stats;
}

module.exports = {
  applyChatCleanupForUser,
  buildDeactivateUpdate,
  planChatCleanup,
};
