"use strict";

const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Stripe = require("stripe");
const { defineSecret } = require("firebase-functions/params");

const { PAYMENT_SOURCE } = require("./paymentLedger");
const { decodeBookingMetadata } = require("./oneOffBookingMetadata");
const {
  FULFILMENT_COLLECTION,
  fulfilOneOffBookingImpl,
} = require("./fulfilOneOffBooking");
const { FULFILMENT_STATE } = require("./oneOffFulfilmentState");

const stripeSecretKey = defineSecret("STRIPE_KEY");
const SYDNEY_ZONE = "Australia/Sydney";

/** How far back to look. Beyond this a payment is a bookkeeping matter. */
const LOOKBACK_DAYS = 30;

/**
 * How long to leave a fulfilment alone before treating it as stuck. Longer than
 * the claim lease, so a booking still being worked on is never picked up here.
 */
const STUCK_AFTER_MS = 15 * 60 * 1000;

/**
 * Decide what a one-off payment still needs.
 *
 * Pure, so the triage can be tested without Firestore or Stripe.
 *
 * `ledgerEntry` is the `paymentLogs` record; `fulfilment` the
 * `oneOffFulfilments` claim, if any; `hasInvoice` whether any invoice already
 * carries this PaymentIntent id.
 */
function triageOneOffPayment({ ledgerEntry, fulfilment, hasInvoice, now }) {
  if (ledgerEntry?.status !== "succeeded") return { action: "skip" };

  const settled =
    fulfilment?.state === FULFILMENT_STATE.COMPLETE ||
    fulfilment?.state === FULFILMENT_STATE.REFUNDED;
  if (settled) return { action: "skip" };

  if (fulfilment?.state === FULFILMENT_STATE.NEEDS_ADMIN) {
    // Already flagged. Alerting nightly about the same payment is how alerts
    // get ignored.
    return { action: "skip" };
  }

  const booking = decodeBookingMetadata(ledgerEntry.metadata);

  if (!booking) {
    // A payment from an app build with no booking context. Nothing can complete
    // it automatically: which class and which child were only ever known to the
    // phone. If it produced an invoice the client path finished the job.
    return hasInvoice
      ? { action: "skip" }
      : { action: "alert", reason: "legacy_orphan" };
  }

  const claimedAt = fulfilment?.claimedAt;
  const claimedMillis =
    claimedAt && typeof claimedAt.toMillis === "function"
      ? claimedAt.toMillis()
      : null;
  const currentMillis = now instanceof Date ? now.getTime() : Number(now);

  if (claimedMillis !== null && currentMillis - claimedMillis < STUCK_AFTER_MS) {
    // Still within the window where the normal path may yet finish it.
    return { action: "skip" };
  }

  return { action: "fulfil" };
}

async function reconcileOneOffPaymentsImpl({
  db,
  stripe,
  now = new Date(),
  log = logger,
}) {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const snapshot = await db
    .collection("paymentLogs")
    .where("source", "==", PAYMENT_SOURCE.ONE_OFF)
    .where("status", "==", "succeeded")
    .get();

  const summary = { examined: 0, fulfilled: 0, alerted: 0, failed: 0 };
  const alerts = [];

  for (const doc of snapshot.docs) {
    const ledgerEntry = doc.data();
    const paidAt = ledgerEntry.paidAt?.toDate?.() ?? null;
    if (paidAt && paidAt < since) continue;

    summary.examined += 1;
    const paymentIntentId = doc.id;

    const [fulfilmentSnap, invoiceSnap] = await Promise.all([
      db.collection(FULFILMENT_COLLECTION).doc(paymentIntentId).get(),
      db
        .collection("invoices")
        .where("stripePaymentIntentId", "==", paymentIntentId)
        .limit(1)
        .get(),
    ]);

    const decision = triageOneOffPayment({
      ledgerEntry,
      fulfilment: fulfilmentSnap.exists ? fulfilmentSnap.data() : null,
      hasInvoice: !invoiceSnap.empty,
      now,
    });

    if (decision.action === "skip") continue;

    if (decision.action === "alert") {
      alerts.push({
        paymentIntentId,
        reason: decision.reason,
        amount: ledgerEntry.amount,
        parentId: ledgerEntry.metadata?.parentId ?? null,
      });
      summary.alerted += 1;
      continue;
    }

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const result = await fulfilOneOffBookingImpl({
        db,
        stripe,
        paymentIntent,
        logger: log,
      });
      summary.fulfilled += 1;
      if (result.state === FULFILMENT_STATE.NEEDS_ADMIN) {
        alerts.push({
          paymentIntentId,
          reason: result.reason || "needs_admin",
          amount: ledgerEntry.amount,
          parentId: ledgerEntry.metadata?.parentId ?? null,
        });
        summary.alerted += 1;
      }
    } catch (error) {
      summary.failed += 1;
      log.error?.("Sweep could not fulfil a one-off payment", {
        paymentIntentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (alerts.length > 0) {
    log.warn?.("One-off payments need attention", { alerts });
  }

  return { ...summary, alerts };
}

const reconcileOneOffPayments = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: SYDNEY_ZONE,
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
    concurrency: 1,
    secrets: [stripeSecretKey],
  },
  async () => {
    const stripe = new Stripe(stripeSecretKey.value(), {
      apiVersion: "2025-02-24.acacia",
    });
    const result = await reconcileOneOffPaymentsImpl({
      db: admin.firestore(),
      stripe,
    });
    logger.info("One-off payment reconciliation complete", result);
  }
);

module.exports = {
  LOOKBACK_DAYS,
  STUCK_AFTER_MS,
  reconcileOneOffPayments,
  reconcileOneOffPaymentsImpl,
  triageOneOffPayment,
};
