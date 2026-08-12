"use strict";

const { classifyChat, buildPruneUpdate } = require("./orphanedChats");
const { buildDeactivateUpdate } = require("./chatCleanup");

/**
 * One-off remediation for chats left behind by user deletions.
 *
 * `deleteUserImpl` has never removed a deleted user's chats, so every account
 * removed to date has orphaned its threads. This sweeps the backlog; the
 * delete-time fix stops new ones appearing.
 *
 * Two modes, and the default is the cautious one:
 *
 *   - `deactivate` (default) hides the thread from every inbox but keeps it.
 *     This is the same policy `deleteUserImpl` applies to a real user, and it
 *     achieves the actual goal — getting dead threads out of people's inboxes —
 *     without destroying anything.
 *   - `hard-delete` removes the thread and its messages outright.
 *
 * The distinction matters because these orphans predate any record of *why*
 * each account was deleted. A production dry run turned up threads whose
 * departed party was the official `admin@tenacitytutoring.com` identity, not a
 * test account — one of them a real parent's conversation with the business.
 * Hard-deleting by default would have destroyed it.
 *
 * Dry-run by default in both modes. The caller decides whether to commit — see
 * `scripts/purgeOrphanedChats.js`, which additionally refuses to write without
 * an explicit `--yes`.
 */

/**
 * Every uid that still has a `users` doc.
 *
 * Read in full rather than checked per chat: the user base is small (hundreds),
 * while chats are many, so one pass here is far cheaper than a `get()` per
 * participant per chat. It also gives a consistent snapshot to classify
 * against, instead of a view that shifts mid-sweep.
 */
async function loadLiveUids(db) {
  const snap = await db.collection("users").select().get();
  return new Set(snap.docs.map((doc) => doc.id));
}

async function countMessages(chatRef) {
  const snap = await chatRef.collection("messages").count().get();
  return snap.data().count;
}

async function purgeOrphanedChatsImpl({
  db,
  fieldValue,
  timestamp,
  logger,
  dryRun = true,
  mode = "deactivate",
  batchSize = 200,
}) {
  if (!db) throw new TypeError("purgeOrphanedChatsImpl requires db");
  if (!fieldValue?.delete) {
    throw new TypeError("purgeOrphanedChatsImpl requires FieldValue");
  }
  if (!logger?.info) throw new TypeError("purgeOrphanedChatsImpl requires logger");
  if (!["deactivate", "hard-delete"].includes(mode)) {
    throw new TypeError(`Unknown mode: ${mode}`);
  }
  if (mode === "deactivate" && !timestamp) {
    throw new TypeError("deactivate mode requires timestamp");
  }

  const liveUids = await loadLiveUids(db);
  logger.info("[purgeOrphanedChats] Starting", {
    dryRun: !!dryRun,
    mode,
    liveUsers: liveUids.size,
    batchSize,
  });

  if (liveUids.size === 0) {
    // Every chat would classify as orphaned. Far more likely a wrong project
    // or a failed read than a genuinely empty user base.
    throw new Error(
      "Refusing to run: no users found. Check the target project and credentials."
    );
  }

  const stats = {
    scanned: 0,
    deleted: 0,
    deactivated: 0,
    alreadyInactive: 0,
    pruned: 0,
    unreachableLeft: 0,
    messagesDeleted: 0,
    byReason: {},
  };

  let cursor = null;
  for (;;) {
    // Paged on document id with a cursor. The comparable loop in
    // `purgeOldInvoices.js` re-runs an unchanged query in its dry-run branch
    // and never advances past the first page.
    let query = db.collection("chats").orderBy("__name__").limit(batchSize);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;
    cursor = snap.docs[snap.docs.length - 1];

    for (const doc of snap.docs) {
      stats.scanned += 1;
      const data = doc.data() || {};

      // Already retired by a previous run or by `deleteUserImpl`. Skipped
      // rather than re-planned: re-writing would push `inactiveAt` and the
      // `deletedFor` stamps forward on every run, and the run summary would
      // keep reporting work that was already done.
      if (data.inactive === true && mode !== "hard-delete") {
        stats.alreadyInactive += 1;
        continue;
      }

      const verdict = classifyChat({
        participants: data.participants,
        liveUids,
      });
      if (verdict.action === "none") continue;

      stats.byReason[verdict.reason] = (stats.byReason[verdict.reason] || 0) + 1;

      if (verdict.action === "delete") {
        const messageCount = await countMessages(doc.ref);

        // A doc with no usable participant list cannot be deactivated in any
        // meaningful sense — nobody can read it, so there is no inbox to hide
        // it from. Left alone unless explicitly hard-deleting.
        const unreachable = verdict.reason === "malformed-participants";
        const willHardDelete = mode === "hard-delete";

        logger.info("[purgeOrphanedChats] Orphaned chat", {
          chatId: doc.id,
          reason: verdict.reason,
          deadUids: verdict.deadUids,
          survivingUids: verdict.remainingParticipants,
          messageCount,
          action:
            willHardDelete ? "delete" : unreachable ? "leave" : "deactivate",
          willWrite: !dryRun && (willHardDelete || !unreachable),
        });

        if (willHardDelete) {
          if (!dryRun) {
            // Deleting the chat doc alone would strand the `messages`
            // subcollection — Firestore does not cascade. `deleteChatForUser`
            // in the app has this bug today; don't repeat it here.
            await db.recursiveDelete(doc.ref);
          }
          stats.deleted += 1;
          stats.messagesDeleted += messageCount;
          continue;
        }

        if (unreachable) {
          stats.unreachableLeft += 1;
          continue;
        }

        if (!dryRun) {
          await doc.ref.update(
            buildDeactivateUpdate({
              participants: [
                ...verdict.remainingParticipants,
                ...verdict.deadUids,
              ],
              deletedUids: verdict.deadUids,
              timestamp,
            })
          );
        }
        stats.deactivated += 1;
        continue;
      }

      logger.info("[purgeOrphanedChats] Pruning deleted members from group chat", {
        chatId: doc.id,
        deadUids: verdict.deadUids,
        survivingUids: verdict.remainingParticipants,
        willPrune: !dryRun,
      });

      if (!dryRun) {
        await doc.ref.update(
          buildPruneUpdate({
            deadUids: verdict.deadUids,
            remainingParticipants: verdict.remainingParticipants,
            fieldValue,
          })
        );
      }
      stats.pruned += 1;
    }

    if (snap.size < batchSize) break;
  }

  logger.info("[purgeOrphanedChats] Completed", {
    dryRun: !!dryRun,
    ...stats,
  });

  return { dryRun: !!dryRun, ...stats };
}

module.exports = {
  loadLiveUids,
  purgeOrphanedChatsImpl,
};
