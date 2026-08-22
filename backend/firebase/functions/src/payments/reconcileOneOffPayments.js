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
const { getMessaging } = require("firebase-admin/messaging");
const { getAdminTokenOwners } = require("../../lib/notifications/shared");
const { sendAndRecord } = require("../notifications/send");

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
 * What to tell an admin about payments that need a person.
 *
 * Pure, so the wording can be tested without Firebase Messaging.
 */
function buildAlertNotification(alerts) {
  const total = alerts.reduce((sum, alert) => sum + (Number(alert.amount) || 0), 0);
  const amount = total > 0 ? ` totalling $${total.toFixed(2)}` : "";
  const body =
    alerts.length === 1
      ? `A one-off payment${amount} needs attention: ${describeAlertReason(alerts[0].reason)}.`
      : `${alerts.length} one-off payments${amount} need attention.`;

  return {
    title: "One-off payments need attention",
    body,
    paymentIntentIds: alerts.map((alert) => alert.paymentIntentId).join(","),
  };
}

function describeAlertReason(reason) {
  switch (reason) {
    case "legacy_orphan":
      return "paid, but nothing recorded a booking for it";
    case "session_full":
      return "the session was full and it could not be refunded automatically";
    case "refund_failed":
      return "a refund could not be issued";
    case "class_date_passed":
      return "the class has already run";
    default:
      return reason || "it could not be completed";
  }
}

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

  // The claim keeps its own copy of the booking, which is what a payment whose
  // ledger entry never landed still has to go on.
  const booking =
    decodeBookingMetadata(ledgerEntry.metadata) || fulfilment?.booking || null;

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

  // A fulfilment that crashed before its ledger entry was written would be
  // invisible to a ledger-only sweep. The claim is the other half of the
  // record, so stale ones are swept too — a payment must be reachable from
  // either side.
  const stuckClaims = await db
    .collection(FULFILMENT_COLLECTION)
    .where("state", "==", FULFILMENT_STATE.PENDING)
    .get();

  const paymentIntentIds = new Set(snapshot.docs.map((doc) => doc.id));
  const ledgerById = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
  for (const doc of stuckClaims.docs) {
    paymentIntentIds.add(doc.id);
  }

  const summary = { examined: 0, fulfilled: 0, alerted: 0, failed: 0 };
  const alerts = [];

  for (const paymentIntentId of paymentIntentIds) {
    // A claim with no ledger entry is exactly the case above: assume the
    // payment succeeded, because the claim is only ever written after Stripe
    // told us it did.
    const ledgerEntry = ledgerById.get(paymentIntentId) ?? { status: "succeeded" };
    const paidAt = ledgerEntry.paidAt?.toDate?.() ?? null;
    if (paidAt && paidAt < since) continue;

    summary.examined += 1;

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
    // A log line is where money already goes to die unnoticed — see open item
    // 7. A sweep nobody hears from is not a sweep.
    await notifyAdmins({ alerts, log });
  }

  return { ...summary, alerts };
}

/**
 * Push the alert to whoever can act on it.
 *
 * Best-effort: failing to notify must not fail the sweep, because the
 * fulfilment work it just did is worth keeping either way.
 */
async function notifyAdmins({ alerts, log, deps = {} }) {
  const recipientsFor = deps.getAdminTokenOwners || getAdminTokenOwners;
  // The Firebase handles are resolved inside the default sender, not
  // alongside the payload: a test injecting `sendAndRecord` has no
  // initialised app, and building them eagerly would throw into the catch
  // below and silently send nothing.
  const send =
    deps.sendAndRecord ||
    ((args) =>
      sendAndRecord(
        { ...args, messaging: getMessaging(), db: admin.firestore() },
        { logger: log }
      ));

  try {
    const recipients = await recipientsFor();
    if (!recipients.length) {
      log.warn?.("No admin devices to alert about one-off payments", {
        alertCount: alerts.length,
      });
      return;
    }

    const notification = buildAlertNotification(alerts);
    await send({
        recipients,
        title: notification.title,
        body: notification.body,
        data: {
          type: "one_off_payment_alert",
          paymentIntentIds: notification.paymentIntentIds,
        },
        source: "schedule:reconcileOneOffPayments",
        // One alert per sweep; the ids it covers make a same-day re-run that
        // found the same payments record the same row.
        eventId: `oneOffPaymentAlert:${notification.paymentIntentIds}`,
    });
  } catch (error) {
    log.error?.("Could not alert admins about one-off payments", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
  buildAlertNotification,
  notifyAdmins,
  STUCK_AFTER_MS,
  reconcileOneOffPayments,
  reconcileOneOffPaymentsImpl,
  triageOneOffPayment,
};
