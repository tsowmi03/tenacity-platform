"use strict";

const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { xeroInvoiceSync: xero } = require("../../lib/xero_functions");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const {
  assertArray,
  assertBoolean,
  assertNumber,
  assertString,
  validateShape,
} = require("../shared/validation");

const xeroClientId = defineSecret("XERO_CLIENT_ID");
const xeroClientSecret = defineSecret("XERO_CLIENT_SECRET");

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;
// A claim older than this is treated as abandoned (the callable timed out).
const CLAIM_TTL_MS = 10 * 60 * 1000;
// Xero allows 60 calls a minute. One invoice can cost six: the number lookup,
// two contact lookups, a contact create, the invoice create and the email. At
// seven seconds apiece a batch stays under the limit, and 30 invoices still
// finish inside the callable's nine-minute timeout.
const PAUSE_BETWEEN_INVOICES_MS = 7000;

/**
 * Recreates, in Xero, the unpaid invoices `onInvoiceCreated` never managed to
 * create (TP-39: every Xero call failed for a few days after the TP-37 change).
 *
 * Dry-run is the default, so calling it with no arguments only reports what it
 * would do. Emailing is a separate flag because Xero's email is how a parent
 * first receives an invoice, and these ones are already days late.
 */
function validateBackfillPayload(input) {
  const out = validateShape(input || {}, {
    dryRun: (v) => (v === undefined ? true : assertBoolean(v, "dryRun")),
    sendEmail: (v) => (v === undefined ? false : assertBoolean(v, "sendEmail")),
    limit: (v) =>
      v === undefined
        ? DEFAULT_LIMIT
        : assertNumber(v, "limit", { min: 1, max: MAX_LIMIT, integer: true }),
    invoiceIds: (v) =>
      v === undefined
        ? undefined
        : assertArray(v, "invoiceIds", {
            itemAssert: (id) => assertString(id, "invoiceIds[]", { max: 120 }),
            unique: true,
            min: 1,
            max: MAX_LIMIT,
          }),
  });
  return out;
}

function createdAtMillis(invoice) {
  const createdAt = invoice.createdAt;
  if (createdAt && typeof createdAt.toMillis === "function") {
    return createdAt.toMillis();
  }
  return 0;
}

function describeError(err) {
  return String(err?.message || err || "unknown error").slice(0, 200);
}

/**
 * An invoice this backfill created in Xero whose email has not gone out, so a
 * run with `sendEmail` can finish the job after a failed or skipped email.
 */
function needsEmail(invoice) {
  return Boolean(
    invoice.xeroInvoiceId &&
      invoice.xeroBackfillCreated &&
      !invoice.xeroBackfillEmailedAt
  );
}

async function claimInvoice({ db, ref, nowMs, FieldValue, mode }) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    if (mode === "create" && data.xeroInvoiceId) return "already-synced";
    if (mode === "email" && !needsEmail(data)) return "already-emailed";
    if (data.status !== "unpaid") return "not-unpaid";
    const claimedAt = data.xeroBackfillClaimedAt?.toMillis?.() ?? 0;
    if (claimedAt && nowMs - claimedAt < CLAIM_TTL_MS) return "claimed";
    tx.update(ref, { xeroBackfillClaimedAt: FieldValue.serverTimestamp() });
    return "claimed-by-us";
  });
}

async function backfillXeroInvoicesImpl({ payload, actor, deps }) {
  const {
    db,
    xero,
    FieldValue,
    clock = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    pauseMs = PAUSE_BETWEEN_INVOICES_MS,
  } = deps;
  if (!db) throw new TypeError("backfillXeroInvoicesImpl requires db");
  if (!xero) throw new TypeError("backfillXeroInvoicesImpl requires xero");
  if (!FieldValue) throw new TypeError("backfillXeroInvoicesImpl requires FieldValue");
  if (!actor?.uid) throw new TypeError("backfillXeroInvoicesImpl requires actor.uid");

  const { dryRun, sendEmail, limit, invoiceIds } = payload;

  const snapshot = await db.collection("invoices").where("status", "==", "unpaid").get();
  let candidates = snapshot.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() || {} }))
    .map((invoice) => ({
      ...invoice,
      // Either never reached Xero, or reached it but still owes its email.
      mode: !invoice.data.xeroInvoiceId
        ? "create"
        : sendEmail && needsEmail(invoice.data)
          ? "email"
          : null,
    }))
    .filter((invoice) => invoice.mode);
  if (invoiceIds) {
    const wanted = new Set(invoiceIds);
    candidates = candidates.filter((invoice) => wanted.has(invoice.id));
  }
  candidates.sort((a, b) => createdAtMillis(a.data) - createdAtMillis(b.data));
  const batch = candidates.slice(0, limit);

  const results = [];
  for (const [index, invoice] of batch.entries()) {
    const xeroNumber = xero.xeroInvoiceNumber(invoice.id, invoice.data);
    const base = {
      invoiceId: invoice.id,
      xeroInvoiceNumber: xeroNumber,
      amountDue: invoice.data.amountDue ?? null,
    };

    if (dryRun) {
      results.push(
        invoice.mode === "email"
          ? { ...base, outcome: "would-email" }
          : { ...base, outcome: "would-create", wouldEmail: sendEmail }
      );
      continue;
    }

    if (index > 0 && pauseMs) await sleep(pauseMs);

    let claim;
    try {
      claim = await claimInvoice({
        db,
        ref: invoice.ref,
        nowMs: clock(),
        FieldValue,
        mode: invoice.mode,
      });
    } catch (err) {
      results.push({ ...base, outcome: "failed", error: describeError(err) });
      continue;
    }
    if (claim !== "claimed-by-us") {
      results.push({ ...base, outcome: "skipped", reason: claim });
      continue;
    }

    if (invoice.mode === "email") {
      try {
        await xero.emailXeroInvoice(invoice.data.xeroInvoiceId);
        await invoice.ref.update({
          xeroBackfillEmailedAt: FieldValue.serverTimestamp(),
          xeroBackfillClaimedAt: FieldValue.delete(),
        });
        results.push({ ...base, outcome: "emailed", emailed: true });
      } catch (err) {
        try {
          await invoice.ref.update({ xeroBackfillClaimedAt: FieldValue.delete() });
        } catch (_) {
          // The claim expires on its own.
        }
        results.push({ ...base, outcome: "failed", emailError: describeError(err) });
      }
      continue;
    }

    try {
      const existingId = await xero.findXeroInvoiceByNumber(xeroNumber);
      const xeroInvoiceId = existingId || (await xero.createXeroInvoice(invoice.id));
      const linkedExisting = Boolean(existingId);
      await invoice.ref.update({
        xeroInvoiceId,
        xeroBackfilledAt: FieldValue.serverTimestamp(),
        xeroBackfillClaimedAt: FieldValue.delete(),
        // Marks an invoice this run created, so a later run can still send
        // its email if that failed. One that already existed is left alone.
        ...(linkedExisting ? {} : { xeroBackfillCreated: true }),
      });

      const result = {
        ...base,
        outcome: linkedExisting ? "linked-existing" : "created",
        emailed: false,
      };
      // A Xero invoice that already existed may well have been emailed, so
      // only a freshly created one is sent.
      if (sendEmail && !linkedExisting) {
        try {
          await xero.emailXeroInvoice(xeroInvoiceId);
          await invoice.ref.update({ xeroBackfillEmailedAt: FieldValue.serverTimestamp() });
          result.emailed = true;
        } catch (err) {
          result.emailError = describeError(err);
        }
      }
      results.push(result);
    } catch (err) {
      try {
        await invoice.ref.update({ xeroBackfillClaimedAt: FieldValue.delete() });
      } catch (_) {
        // The claim expires on its own.
      }
      results.push({ ...base, outcome: "failed", error: describeError(err) });
    }
  }

  const summary = {
    dryRun,
    sendEmail,
    matching: candidates.length,
    processed: batch.length,
    remaining: candidates.length - batch.length,
    created: results.filter((r) => r.outcome === "created").length,
    emailRetried: results.filter((r) => r.outcome === "emailed").length,
    linkedExisting: results.filter((r) => r.outcome === "linked-existing").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    emailed: results.filter((r) => r.emailed).length,
    results,
  };

  if (!dryRun) {
    await writeAuditLog(
      db,
      {
        actorUid: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.claims?.role || actor.role || null,
        action: "invoice.xero.backfill",
        targetType: "invoice",
        targetId: "xero-backfill",
        targetName: "Xero invoice backfill",
        payloadSummary: {
          sendEmail,
          processed: summary.processed,
          created: summary.created,
          emailRetried: summary.emailRetried,
          linkedExisting: summary.linkedExisting,
          failed: summary.failed,
          emailed: summary.emailed,
        },
      },
      { logger, clock: deps.auditClock }
    );
  }

  return summary;
}

const adminBackfillXeroInvoices = onCall(
  {
    region: "us-central1",
    secrets: [xeroClientId, xeroClientSecret],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateBackfillPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await backfillXeroInvoicesImpl({
        payload,
        actor,
        deps: {
          db: admin.firestore(),
          FieldValue: admin.firestore.FieldValue,
          xero,
        },
      });
    } catch (err) {
      logger.error("[adminBackfillXeroInvoices] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateBackfillPayload,
  backfillXeroInvoicesImpl,
  adminBackfillXeroInvoices,
};
