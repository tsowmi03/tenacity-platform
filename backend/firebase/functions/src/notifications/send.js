"use strict";

const { randomUUID } = require("crypto");
const { recordNotification } = require("./ledger");
const { fromDate } = require("../shared/timestamps");

/**
 * How long a notification row is kept. Matches the six-month retention
 * adminAuditLogs uses. Written as `expiresAt` on every row from the first
 * one, so the Firestore TTL policy can be switched on later without a
 * backfill — the policy itself is a console/gcloud operation the deploy
 * pipeline only compares, never sets.
 */
const RETENTION_DAYS = 180;

/**
 * FCM error codes that mean the token is gone for good, not that the send
 * failed transiently. Anything else (quota, unavailable, internal) is a
 * temporary condition and the token must be left alone.
 *
 * `messaging/invalid-argument` is deliberately excluded even though it can
 * appear per-token: it means the request itself was malformed (e.g. a
 * non-string value in `data`), not that a specific token is bad. A payload
 * bug would make FCM report it for every token in the batch, and treating
 * that as "dead" would mass-delete every recipient's valid registration.
 */
const DEAD_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/**
 * Send one push to a set of recipients and record what happened.
 *
 * Every notification sender used to hand-roll the same
 * `{ notification, data, tokens }` multicast and throw the per-token response
 * away. That discarded two useful things: whether the notification actually
 * reached anyone, and which tokens are permanently dead. This wraps the send
 * so both are captured in one place.
 *
 * `recipients` is `[{ uid, role?, tokens: string[] }]` — grouped by user
 * rather than a flat token list, because the ledger records one row per
 * person and a single user commonly has several devices. The send itself is
 * still one multicast across every token, so this costs no extra FCM calls.
 *
 * `eventId` must be stable across retries of the same logical action, so a
 * re-run overwrites its own ledger rows instead of duplicating them. Firestore
 * triggers should pass the CloudEvent's `event.id`; callables can omit it and
 * take the generated uuid. When one action sends several distinct
 * notifications, pass a `dedupeKey` as well so they do not overwrite each
 * other — see `recordNotification`.
 *
 * Never throws: a notification failing is not a reason to fail the business
 * operation that triggered it, and throwing inside a trigger causes an
 * at-least-once retry that re-sends everything that already succeeded.
 */
async function sendAndRecord(
  { messaging, db, recipients, title, body, data, source, eventId, dedupeKey },
  { logger = console, clock, pruneDeadTokens = true, retentionDays = RETENTION_DAYS } = {}
) {
  if (!messaging) throw new TypeError("sendAndRecord requires messaging");
  if (!db) throw new TypeError("sendAndRecord requires db");
  if (!source) throw new TypeError("sendAndRecord requires source");

  const owners = normaliseRecipients(recipients);
  const sentAt = clock ? clock() : new Date();
  const expiresAt = fromDate(
    new Date(sentAt.getTime() + retentionDays * 24 * 60 * 60 * 1000)
  );
  const tokens = owners.flatMap((owner) => owner.tokens);
  const correlationId = eventId || randomUUID();

  if (!tokens.length) {
    return {
      eventId: correlationId,
      sent: false,
      successCount: 0,
      failureCount: 0,
      prunedTokens: [],
      records: [],
    };
  }

  let response;
  try {
    response = await messaging.sendEachForMulticast({
      notification: { title, body },
      data,
      tokens,
    });
  } catch (error) {
    // A multicast that fails outright (network, credentials) is worth a loud
    // log, but the caller's write has already committed and must stand.
    logger.error?.(`[${source}] notification send failed`, error);
    // Record the attempt anyway. Without this, a total outage leaves no
    // trace in the one place meant to catch a dropped push — the ledger
    // would show nothing rather than "this was tried and failed".
    const failureRecords = [];
    for (const owner of owners) {
      try {
        failureRecords.push(
          await recordNotification(
            db,
            {
              recipientId: owner.uid,
              recipientRole: owner.role,
              type: data?.type,
              title,
              body,
              data,
              source,
              eventId: correlationId,
              dedupeKey: dedupeKey || correlationId,
              expiresAt,
              delivery: {
                tokenCount: owner.tokens.length,
                successCount: 0,
                failureCount: owner.tokens.length,
              },
            },
            { logger, clock }
          )
        );
      } catch (ledgerError) {
        logger.warn?.(`[${source}] ledger write threw for ${owner.uid}`, ledgerError);
      }
    }
    return {
      eventId: correlationId,
      sent: false,
      successCount: 0,
      failureCount: tokens.length,
      prunedTokens: [],
      records: failureRecords,
      error,
    };
  }

  const perToken = response.responses || [];
  const deadTokens = [];
  let cursor = 0;
  const records = [];

  for (const owner of owners) {
    const slice = perToken.slice(cursor, cursor + owner.tokens.length);
    cursor += owner.tokens.length;

    let successCount = 0;
    slice.forEach((result, idx) => {
      if (result?.success) {
        successCount += 1;
        return;
      }
      const token = owner.tokens[idx];
      const code = result?.error?.code;
      logger.error?.(
        `[${source}] notification token failed for ${owner.uid}`,
        code || result?.error
      );
      if (DEAD_TOKEN_ERROR_CODES.has(code)) {
        deadTokens.push({ uid: owner.uid, token });
      }
    });

    // One recipient's ledger row failing must not stop the next one's.
    try {
      const record = await recordNotification(
        db,
        {
          recipientId: owner.uid,
          recipientRole: owner.role,
          type: data?.type,
          title,
          body,
          data,
          source,
          eventId: correlationId,
          dedupeKey: dedupeKey || correlationId,
          expiresAt,
          delivery: {
            tokenCount: owner.tokens.length,
            successCount,
            failureCount: owner.tokens.length - successCount,
          },
        },
        { logger, clock }
      );
      records.push(record);
    } catch (error) {
      logger.warn?.(`[${source}] ledger write threw for ${owner.uid}`, error);
    }
  }

  let prunedTokens = [];
  if (pruneDeadTokens && deadTokens.length) {
    prunedTokens = await pruneTokens(db, deadTokens, { logger, source });
  }

  return {
    eventId: correlationId,
    sent: true,
    successCount: response.successCount ?? 0,
    failureCount: response.failureCount ?? 0,
    prunedTokens,
    records,
  };
}

/**
 * Delete tokens FCM has told us are permanently unregistered. Without this
 * they accumulate on the user for good: every later send re-attempts them,
 * and the failure counts stay permanently non-zero, which makes a real
 * delivery problem impossible to distinguish from accumulated litter.
 */
async function pruneTokens(db, deadTokens, { logger = console, source } = {}) {
  const pruned = [];
  for (const { uid, token } of deadTokens) {
    if (!uid || !token) continue;
    try {
      await db
        .collection("userTokens")
        .doc(uid)
        .collection("tokens")
        .doc(token)
        .delete();
      pruned.push({ uid, token });
    } catch (error) {
      logger.warn?.(`[${source}] could not prune dead token for ${uid}`, error);
    }
  }
  return pruned;
}

/**
 * Recipients must be `{ uid, tokens }` — a uid is required, not optional.
 * Every sender knows who it is notifying, and a push with no attributable
 * recipient cannot be recorded, which would put it back in the silent
 * fire-and-forget category this module exists to end.
 *
 * Recipients holding no tokens are dropped rather than rejected: a user with
 * no registered device is a normal state, not an error, and they would
 * otherwise produce an empty ledger row claiming a notification they could
 * never have received.
 */
function normaliseRecipients(recipients) {
  if (!Array.isArray(recipients)) return [];
  return recipients.map((entry) => {
    if (!entry?.uid) {
      throw new TypeError("sendAndRecord recipients require a uid");
    }
    const tokens = Array.isArray(entry.tokens) ? entry.tokens.filter(Boolean) : [];
    return { uid: entry.uid, role: entry.role, tokens };
  })
  .filter((owner) => owner.tokens.length);
}

module.exports = {
  DEAD_TOKEN_ERROR_CODES,
  RETENTION_DAYS,
  normaliseRecipients,
  pruneTokens,
  sendAndRecord,
};
