"use strict";

const { createHash } = require("crypto");
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
 *   actorUid, actorEmail, actorRole, action, targetType, targetId,
 *   targetName, createdAt, payloadSummary, before?, after?, requestId?
 *
 * Keep `payloadSummary`, `before`, `after` small; do not write secrets/PII
 * beyond what the corresponding business document already stores.
 */
async function writeAuditLog(
  db,
  {
    actorUid,
    actorEmail,
    actorRole,
    action,
    targetType,
    targetId,
    targetName,
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
    actorRole: actorRole || null,
    action,
    targetType,
    targetId,
    targetName: targetName || null,
    createdAt: now(clock),
  };
  if (payloadSummary !== undefined) entry.payloadSummary = payloadSummary;
  if (before !== undefined) entry.before = before;
  if (after !== undefined) entry.after = after;
  if (requestId !== undefined) entry.requestId = requestId;

  try {
    const collection = db.collection("adminAuditLogs");
    if (requestId) {
      const docId = auditLogIdForRequest(requestId);
      const ref = collection.doc(docId);
      try {
        await ref.create(entry);
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return { id: docId, entry, duplicate: true };
        }
        throw err;
      }
      return { id: docId, entry };
    }

    const ref = await collection.add(entry);
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

function auditLogIdForRequest(requestId) {
  return createHash("sha256").update(String(requestId)).digest("hex");
}

function isAlreadyExistsError(err) {
  return err?.code === 6 || err?.code === "already-exists";
}

function displayName(data, fallback = "") {
  if (!data || typeof data !== "object") return fallback;
  const fullName = [data.firstName, data.lastName]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return fullName || data.displayName || data.name || data.email || fallback;
}

function className(data, fallback = "") {
  if (!data || typeof data !== "object") return fallback;
  const pieces = [data.type, data.day, data.startTime].filter(Boolean);
  return pieces.length ? pieces.join(" · ") : fallback;
}

function invoiceName(data, fallback = "") {
  if (!data || typeof data !== "object") return fallback;
  if (data.invoiceNumber !== undefined && data.invoiceNumber !== null) {
    return `Invoice ${data.invoiceNumber}`;
  }
  return fallback;
}

module.exports = {
  auditLogIdForRequest,
  className,
  displayName,
  invoiceName,
  writeAuditLog,
};
