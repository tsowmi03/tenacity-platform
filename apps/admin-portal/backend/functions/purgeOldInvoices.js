"use strict";

/**
 * Shared implementation for invoice purging.
 *
 * This is used by:
 *  - Scheduled Cloud Function (real delete)
 *  - Node script (dry-run)
 */
async function purgeOldInvoicesImpl({
  db,
  admin,
  logger,
  dryRun,
  batchSize = 500,
  now = new Date(),
  logSample = 0,
}) {
  if (!db) throw new Error("Missing db");
  if (!admin?.firestore?.Timestamp) throw new Error("Missing admin.firestore.Timestamp");
  if (!logger?.info) throw new Error("Missing logger");

  const cutoffDate = new Date(now);
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);

  let totalMatched = 0;
  let totalDeleted = 0;
  let sampled = 0;

  logger.info("[purgeOldInvoices] Starting", {
    dryRun: !!dryRun,
    cutoffIso: cutoffDate.toISOString(),
    batchSize,
  });

  while (true) {
    const snap = await db
      .collection("invoices")
      .where("createdAt", "<", cutoffTimestamp)
      .orderBy("createdAt")
      .limit(batchSize)
      .get();

    if (snap.empty) break;

    totalMatched += snap.size;

    if (dryRun) {
      if (logSample > 0 && sampled < logSample) {
        for (const doc of snap.docs) {
          if (sampled >= logSample) break;
          const data = doc.data() || {};
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
          logger.info("[purgeOldInvoices] Sample match", {
            id: doc.id,
            createdAtIso: createdAt ? createdAt.toISOString() : null,
          });
          sampled += 1;
        }
      }

      logger.info("[purgeOldInvoices] Dry-run batch", {
        matched: snap.size,
        totalMatched,
      });

      if (snap.size < batchSize) break;
      continue;
    }

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    totalDeleted += snap.size;

    logger.info("[purgeOldInvoices] Deleted batch", {
      deleted: snap.size,
      totalDeleted,
    });

    if (snap.size < batchSize) break;
  }

  logger.info("[purgeOldInvoices] Completed", {
    dryRun: !!dryRun,
    totalMatched,
    totalDeleted,
    cutoffIso: cutoffDate.toISOString(),
  });

  return {
    dryRun: !!dryRun,
    cutoffDate,
    totalMatched,
    totalDeleted,
  };
}

module.exports = {
  purgeOldInvoicesImpl,
};
