"use strict";

const { createHash } = require("crypto");
const { now } = require("../shared/timestamps");

/**
 * Append an entry to `notifications/{notificationId}`.
 *
 * A push notification is fire-and-forget: once FCM has it, nothing in this
 * system knows whether it arrived, and nothing can show a parent what they
 * were told last week. This collection is the durable record of every push we
 * send — one row per recipient per business action.
 *
 * Best-effort, like `writeAuditLog`: a ledger failure is logged and swallowed
 * so it can never turn a delivered notification into a failed request. Set
 * `throwOnError: true` in tests that need to assert the write happened.
 *
 * The document id is derived rather than auto-generated, which is what makes
 * the ledger safe under retries. Firestore triggers are at-least-once, so the
 * same logical notification can be processed more than once; a deterministic
 * id means the replay lands on the row it already wrote instead of adding a
 * duplicate. Callers must pass an `eventId` that is stable across retries of
 * the same action — for a trigger that is the CloudEvent's own `event.id`,
 * for a callable a per-invocation uuid.
 *
 * `dedupeKey` exists because one action does not always mean one
 * notification: a single attendance write can add two students and send two
 * distinct pushes to the same admin. Those share an `eventId` (they came from
 * one action and should correlate) but need different document ids, or the
 * second would be discarded as a replay of the first. Callers sending more
 * than one notification per event must pass a `dedupeKey` that distinguishes
 * them — typically the event id plus the subject it concerns. It defaults to
 * `eventId` for the common one-notification-per-action case.
 *
 * Shape:
 *   recipientId, recipientRole, type, title, body, data, source, eventId,
 *   createdAt, readAt, expiresAt, delivery { tokenCount, successCount,
 *   failureCount }
 *
 * `data` is the FCM payload as sent, so the record and the push always agree
 * about where a tap should land. Do not put anything in here that the
 * corresponding business document does not already store.
 */
async function recordNotification(
  db,
  {
    recipientId,
    recipientRole,
    type,
    title,
    body,
    data,
    source,
    eventId,
    dedupeKey,
    delivery,
    expiresAt,
  },
  { logger, clock, throwOnError = false } = {}
) {
  if (!db) throw new TypeError("recordNotification requires db");
  if (!recipientId) throw new TypeError("recordNotification requires recipientId");
  if (!type) throw new TypeError("recordNotification requires type");
  if (!eventId) throw new TypeError("recordNotification requires eventId");
  if (!source) throw new TypeError("recordNotification requires source");

  const entry = {
    recipientId,
    recipientRole: recipientRole || null,
    type,
    title: title || null,
    body: body || null,
    data: data || {},
    source,
    eventId,
    createdAt: now(clock),
    readAt: null,
  };
  if (expiresAt !== undefined) entry.expiresAt = expiresAt;
  if (delivery !== undefined) entry.delivery = delivery;

  const docId = notificationIdFor(dedupeKey || eventId, recipientId);

  try {
    const ref = db.collection("notifications").doc(docId);
    try {
      await ref.create(entry);
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        return { id: docId, entry, duplicate: true };
      }
      throw err;
    }
    return { id: docId, entry };
  } catch (err) {
    if (logger?.warn) {
      logger.warn("[notificationLedger] write failed", {
        type,
        recipientId,
        eventId,
        errorMessage: err?.message,
      });
    }
    if (throwOnError) throw err;
    return { id: null, entry, error: err };
  }
}

function notificationIdFor(dedupeKey, recipientId) {
  return createHash("sha256")
    .update(`${String(dedupeKey)}:${String(recipientId)}`)
    .digest("hex");
}

function isAlreadyExistsError(err) {
  return err?.code === 6 || err?.code === "already-exists";
}

module.exports = {
  isAlreadyExistsError,
  notificationIdFor,
  recordNotification,
};
