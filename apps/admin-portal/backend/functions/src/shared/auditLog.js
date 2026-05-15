"use strict";

const { now } = require("./timestamps");

/**
 * Append an entry to `adminAuditLogs/{logId}`.
 *
 * Best-effort by default: write failures are logged via `logger.warn` and the
 * caller continues. Set `throwOnError: true` for tests that need to assert
 * the write happened.
 *
 * Retention: six months (PLAN.md §7). A separate scheduled function will
 * purge older entries — analogous to `purgeOldInvoices`.
 *
 * Shape (matches PLAN.md §7):
 *   actorUid, actorEmail, action, targetType, targetId, createdAt,
 *   payloadSummary, before?, after?, requestId?
 *
 * Keep `payloadSummary`, `before`, `after` small; do not write secrets/PII
 * beyond what the corresponding business document already stores.
 */
async function writeAuditLog(
  db,
  {
    actorUid,
    actorEmail,
    action,
    targetType,
    targetId,
    payloadSummary,
    before,
    after,
    requestId,
  },
  { logger, clock, throwOnError = false } = {}
) {
  if (!db) throw new TypeError("writeAuditLog requires db");
  if (!actorUid) throw new TypeError("writeAuditLog requires actorUid");
  if (!action) throw new TypeError("writeAuditLog requires action");
  if (!targetType) throw new TypeError("writeAuditLog requires targetType");
  if (!targetId) throw new TypeError("writeAuditLog requires targetId");

  const entry = {
    actorUid,
    actorEmail: actorEmail || null,
    action,
    targetType,
    targetId,
    createdAt: now(clock),
  };
  if (payloadSummary !== undefined) entry.payloadSummary = payloadSummary;
  if (before !== undefined) entry.before = before;
  if (after !== undefined) entry.after = after;
  if (requestId !== undefined) entry.requestId = requestId;

  try {
    const ref = await db.collection("adminAuditLogs").add(entry);
    return { id: ref.id, entry };
  } catch (err) {
    if (logger?.warn) {
      logger.warn("[auditLog] write failed", {
        action,
        targetType,
        targetId,
        errorMessage: err?.message,
      });
    }
    if (throwOnError) throw err;
    return { id: null, entry, error: err };
  }
}

module.exports = { writeAuditLog };
