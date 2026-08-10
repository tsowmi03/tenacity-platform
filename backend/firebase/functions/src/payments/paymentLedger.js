"use strict";

/**
 * Classification and record-building for Stripe payments.
 *
 * Payments reach this account from two places, and only one of them was ever
 * handled:
 *
 *   - the Tenacity app, whose `createPaymentIntent` writes `invoiceIds` into
 *     the PaymentIntent metadata;
 *   - Xero's Stripe Connect app, when a parent clicks "Pay now" on a
 *     Xero-emailed invoice. Xero writes its own metadata shape and knows
 *     nothing about `invoiceIds`.
 *
 * A Xero payment carries the human invoice number instead:
 *
 *   { "EmailAddress": "...", "Invoice number": "INV-409",
 *     "OrgCode": "!!!QQ8", "OrgName": "Tenacity Tutoring Pty Ltd" }
 *
 * so it is matched back to Firestore through `invoices.invoiceNumber`, which
 * is stored bare ("406") while Xero sends it prefixed ("INV-406").
 *
 * Every payment also gets a `paymentLogs` entry regardless of whether an
 * invoice was found. That ledger is the point: before it, a payment the
 * handler could not interpret left no trace beyond a log line, which is how
 * four payments went missing for a term without anyone noticing.
 *
 * Everything here is pure so the matching rules can be tested without
 * Firestore or Stripe.
 */

const PAYMENT_SOURCE = Object.freeze({
  APP: "app",
  XERO: "xero",
  ONE_OFF: "one_off_booking",
  UNKNOWN: "unknown",
});

const MATCH_STATUS = Object.freeze({
  /** Exactly one invoice, and the amount agrees. Safe to mark paid. */
  MATCHED: "matched",
  /** A one-off booking; no invoice is expected to exist. */
  NO_INVOICE_EXPECTED: "no_invoice_expected",
  /** Nothing matched. Recorded for a human to look at. */
  UNMATCHED: "unmatched",
  /** More than one invoice carries this number. Never guess at money. */
  AMBIGUOUS: "ambiguous",
  /** One invoice, but the amount paid is not the amount due. */
  AMOUNT_MISMATCH: "amount_mismatch",
  /** The invoice was already settled by a different payment. */
  ALREADY_PAID: "already_paid",
});

/** The metadata key Xero writes the human invoice number under. */
const XERO_INVOICE_NUMBER_KEY = "Invoice number";

function trimmedString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Where a payment came from, decided by what its metadata actually contains
 * rather than by trusting `paymentType` alone — Xero never sets that field.
 */
function classifyPayment(metadata) {
  const meta = metadata || {};

  if (trimmedString(meta.invoiceIds)) return PAYMENT_SOURCE.APP;
  if (trimmedString(meta[XERO_INVOICE_NUMBER_KEY])) return PAYMENT_SOURCE.XERO;
  if (meta.paymentType === PAYMENT_SOURCE.ONE_OFF) return PAYMENT_SOURCE.ONE_OFF;

  return PAYMENT_SOURCE.UNKNOWN;
}

/** The invoice ids an app-initiated payment names, in metadata order. */
function appInvoiceIds(metadata) {
  const raw = trimmedString((metadata || {}).invoiceIds);
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** The raw invoice number a Xero payment names, e.g. `INV-409`. */
function xeroInvoiceNumber(metadata) {
  return trimmedString((metadata || {})[XERO_INVOICE_NUMBER_KEY]);
}

/**
 * Both forms an invoice number might be stored as, for an `in` query.
 *
 * Live data stores it bare ("406"), and the mobile and portal consoles add the
 * `INV-` prefix for display. Querying both costs nothing and means a future
 * change of convention does not silently stop matching.
 */
function invoiceNumberCandidates(raw) {
  const value = trimmedString(raw);
  if (!value) return [];

  const bare = value.replace(/^INV-/i, "");
  const candidates = [value];
  if (bare !== value && bare !== "") candidates.push(bare);
  if (!/^INV-/i.test(value)) candidates.push(`INV-${value}`);

  return [...new Set(candidates)];
}

/**
 * Whether a Xero payment may mark its invoice paid.
 *
 * Deliberately strict: only one invoice, and only for the exact amount due. A
 * part payment or an overpayment is recorded and left for a human, because
 * clearing a $700 balance off a $50 payment is not a mistake that shows up
 * anywhere until the money is chased.
 */
function matchStatusFor({
  matches,
  amountPaidCents,
  invoiceAmountDueCents,
  paymentIntentId = null,
}) {
  const count = Array.isArray(matches) ? matches.length : 0;
  if (count === 0) return MATCH_STATUS.UNMATCHED;
  if (count > 1) return MATCH_STATUS.AMBIGUOUS;

  // A second payment against an invoice that is already settled is a real
  // event — a family paying twice — not something to absorb by overwriting
  // the first payment's record. Replaying the same PaymentIntent is fine.
  if (settledByAnotherPayment(matches[0], paymentIntentId)) {
    return MATCH_STATUS.ALREADY_PAID;
  }

  if (
    !Number.isFinite(amountPaidCents) ||
    !Number.isFinite(invoiceAmountDueCents) ||
    Math.round(amountPaidCents) !== Math.round(invoiceAmountDueCents)
  ) {
    return MATCH_STATUS.AMOUNT_MISMATCH;
  }

  return MATCH_STATUS.MATCHED;
}

/**
 * Whether this invoice is already paid, by some payment other than this one.
 *
 * `matches` entries are `{ id, data }`; a bare invoice object is accepted too
 * so the rule can be exercised directly.
 */
function settledByAnotherPayment(match, paymentIntentId) {
  const invoice = (match && match.data) || match || {};
  if (invoice.status !== "paid") return false;

  const settledBy = trimmedString(invoice.stripePaymentIntentId);
  // Paid with no payment recorded against it (a manual mark-off, or the
  // pre-ledger era): leave it alone rather than claim it.
  if (!settledBy) return true;

  return settledBy !== trimmedString(paymentIntentId);
}

/** Dollars from an `amountDue` field, in cents, for comparison against Stripe. */
function invoiceAmountDueCents(invoice) {
  const value = (invoice || {}).amountDue;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * The ledger document id: the PaymentIntent id itself.
 *
 * Deterministic on purpose. `handlePaymentSuccess` runs from both the webhook
 * and `verifyPaymentStatus`, and a replayed Stripe event runs it again, so an
 * auto-id `.add()` would record the same payment two or three times.
 */
function paymentLogId(paymentIntentId) {
  const id = trimmedString(paymentIntentId);
  if (!id) throw new TypeError("paymentLogId requires a paymentIntentId");
  return id;
}

/**
 * The `paymentLogs/{paymentIntentId}` document.
 *
 * `processedAt` is deliberately left to the caller so it can pass a server
 * timestamp; everything else here is plain data.
 */
function buildPaymentLogEntry({
  paymentIntentId,
  chargeId = null,
  source,
  status,
  matchStatus,
  invoiceIds = [],
  invoiceNumber = null,
  amount,
  currency,
  payerName = null,
  payerEmail = null,
  receiptEmail = null,
  paidAt = null,
  error = null,
  metadata = {},
}) {
  if (!trimmedString(paymentIntentId)) {
    throw new TypeError("buildPaymentLogEntry requires a paymentIntentId");
  }

  return {
    paymentIntentId,
    chargeId,
    source,
    status,
    matchStatus,
    invoiceIds,
    invoiceNumber,
    amount,
    currency: typeof currency === "string" ? currency.toLowerCase() : null,
    payerName,
    payerEmail,
    receiptEmail,
    paidAt,
    error,
    metadata,
  };
}

/**
 * Whether `verifyPaymentStatus` still needs to run the settlement handler.
 *
 * The handler exists in two places on purpose: the webhook is the normal path,
 * and `verifyPaymentStatus` is the fallback for when Stripe's delivery is slow
 * or fails. Running it a second time when there is provably nothing left to do
 * is not free — it costs another expanded Stripe retrieve inside the request a
 * parent is waiting on, which is what exhausted the memory limit and lost a
 * paid booking on 2026-08-06.
 *
 * A one-off booking settles no invoice, so the fallback can never achieve
 * anything the webhook has not already done. An invoice payment already
 * recorded as matched is likewise finished. Everything else keeps the
 * fallback, because an invoice left unpaid by a webhook that never arrived is
 * exactly the failure it is there to catch.
 */
function shouldRunVerifyFallback({ metadata, ledgerEntry } = {}) {
  const entry = ledgerEntry || null;
  const alreadyRecorded = Boolean(entry && entry.status === "succeeded");

  if (classifyPayment(metadata) === PAYMENT_SOURCE.ONE_OFF) {
    // A one-off settles no invoice, so once the webhook has recorded it there
    // is genuinely nothing left to do. But the ledger entry is the only record
    // that the payment happened, and the nightly sweep reads nothing else — so
    // when the webhook has not arrived, this has to write it.
    return !alreadyRecorded;
  }

  if (alreadyRecorded && entry.matchStatus === MATCH_STATUS.MATCHED) {
    return false;
  }

  return true;
}

/**
 * The moment the money actually moved.
 *
 * Taken from the charge rather than the wall clock, so a replayed event writes
 * the date the parent paid instead of the date it was reprocessed.
 */
function paidAtFromCharge(charge, fallback = new Date()) {
  const created = (charge || {}).created;
  if (typeof created === "number" && Number.isFinite(created) && created > 0) {
    return new Date(created * 1000);
  }
  return fallback;
}

module.exports = {
  MATCH_STATUS,
  PAYMENT_SOURCE,
  XERO_INVOICE_NUMBER_KEY,
  appInvoiceIds,
  buildPaymentLogEntry,
  classifyPayment,
  invoiceAmountDueCents,
  invoiceNumberCandidates,
  matchStatusFor,
  paidAtFromCharge,
  paymentLogId,
  settledByAnotherPayment,
  shouldRunVerifyFallback,
  xeroInvoiceNumber,
};
