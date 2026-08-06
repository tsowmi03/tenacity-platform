"use strict";

const { FieldValue } = require("firebase-admin/firestore");

const { enrolOneOffStudentsImpl } = require("../attendance/enrolOneOffStudents");
const { HOLD_COLLECTION } = require("../attendance/oneOffSeatHolds");
const { readSeatHoldsEnabled } = require("./oneOffPricing");
const {
  createInvoiceOnce,
  fingerprintInvoiceCreatePayload,
} = require("../invoices/invoiceCreateIdempotency");
const { decodeBookingMetadata } = require("./oneOffBookingMetadata");
const {
  CLAIM_DECISION,
  CLAIM_LEASE_MS,
  FULFILMENT_STATE,
  classifyFulfilmentOutcome,
  decideFulfilmentClaim,
} = require("./oneOffFulfilmentState");

const FULFILMENT_COLLECTION = "oneOffFulfilments";

/**
 * Complete a one-off booking whose payment has succeeded.
 *
 * This is the whole point of Phase 2: the enrolment and the invoice are written
 * by the server from the PaymentIntent, so a booking no longer depends on the
 * parent's phone surviving the seconds after the card is charged.
 *
 * Called by the Stripe webhook, by `verifyPaymentStatus` (as a fast path so the
 * parent sees an immediate confirmation), and by the nightly sweep. All three
 * run the same code and all three are safe to run concurrently or repeatedly.
 *
 * Returns `{ state, ... }`. Never throws for an outcome the caller should treat
 * as normal — a full session, a repeat delivery — because Stripe retries
 * anything that looks like a failure.
 */
async function fulfilOneOffBookingImpl({
  db,
  stripe,
  paymentIntent,
  clock = () => new Date(),
  logger = console,
}) {
  if (!db) throw new TypeError("fulfilOneOffBookingImpl requires db");
  if (!paymentIntent?.id) {
    throw new TypeError("fulfilOneOffBookingImpl requires a paymentIntent");
  }

  const metadata = paymentIntent.metadata || {};
  const booking = decodeBookingMetadata(metadata);

  // A payment from an app build that predates the booking context. There is
  // nothing here to act on; the old client-driven path still owns it.
  if (!booking) {
    return { state: "not_applicable", reason: "no_booking_context" };
  }

  const parentId = typeof metadata.parentId === "string" ? metadata.parentId : null;
  if (!parentId) {
    return { state: FULFILMENT_STATE.NEEDS_ADMIN, reason: "no_parent_id" };
  }

  const claimRef = db.collection(FULFILMENT_COLLECTION).doc(paymentIntent.id);
  const now = clock();

  const claimResult = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(claimRef);
    const claim = snapshot.exists ? snapshot.data() : null;
    const decision = decideFulfilmentClaim({ claim, now, leaseMs: CLAIM_LEASE_MS });

    if (decision !== CLAIM_DECISION.CLAIM) {
      return { decision, claim };
    }

    transaction.set(
      claimRef,
      {
        paymentIntentId: paymentIntent.id,
        parentId,
        state: FULFILMENT_STATE.PENDING,
        claimedAt: FieldValue.serverTimestamp(),
        attempts: FieldValue.increment(1),
        booking,
      },
      { merge: true }
    );
    return { decision, claim };
  });

  if (claimResult.decision === CLAIM_DECISION.SETTLED) {
    return { ...claimResult.claim, alreadySettled: true };
  }
  if (claimResult.decision === CLAIM_DECISION.IN_PROGRESS) {
    return { state: FULFILMENT_STATE.PENDING, inProgress: true };
  }

  try {
    return await runFulfilment({
      db,
      stripe,
      paymentIntent,
      booking,
      parentId,
      claimRef,
      logger,
    });
  } catch (error) {
    // Leave the claim `pending` with its attempt counted. The lease expires and
    // the next caller — a Stripe retry, or tonight's sweep — resumes. Every
    // step is individually idempotent, so resuming is safe.
    await claimRef
      .set(
        {
          lastError: error instanceof Error ? error.message : String(error),
          lastErrorAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
    throw error;
  }
}

async function runFulfilment({
  db,
  stripe,
  paymentIntent,
  booking,
  parentId,
  claimRef,
  logger,
}) {
  const enrolment = await enrolOneOffStudentsImpl({
    db,
    classId: booking.classId,
    attendanceDocId: booking.attendanceDocId,
    studentIds: booking.studentIds,
    actor: { uid: "system" },
    // Other parents' in-flight payments hold seats too; this booking's own
    // hold is excluded so it cannot block itself.
    respectHolds: await readSeatHoldsEnabled(db),
    paymentIntentId: paymentIntent.id,
  });

  // The seats are either taken or were never available. Either way this
  // payment has no further claim on them.
  await db
    .collection(HOLD_COLLECTION)
    .doc(paymentIntent.id)
    .delete()
    .catch(() => {});

  if (!enrolment.ok) {
    // The class or the session is gone. Never guess with someone's money.
    await claimRef.set(
      {
        state: FULFILMENT_STATE.NEEDS_ADMIN,
        reason: enrolment.reason,
        settledAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    logger.warn?.("One-off fulfilment needs an admin", {
      paymentIntentId: paymentIntent.id,
      reason: enrolment.reason,
    });
    return { state: FULFILMENT_STATE.NEEDS_ADMIN, reason: enrolment.reason };
  }

  const outcome = classifyFulfilmentOutcome({
    enrolledCount: enrolment.enrolled.length,
    alreadyEnrolledCount: enrolment.alreadyEnrolled.length,
    noCapacityCount: enrolment.noCapacity.length,
    classDateHasPassed: attendanceDateHasPassed(enrolment.attendanceData),
  });

  const chargeableIds = [...enrolment.enrolled, ...enrolment.alreadyEnrolled];

  let invoiceId = null;
  if (chargeableIds.length > 0) {
    invoiceId = await createFulfilmentInvoice({
      db,
      paymentIntent,
      parentId,
      booking,
      studentIds: chargeableIds,
    });
  }

  let refundId = null;
  if (outcome.refundStudentCount > 0 && stripe) {
    refundId = await refundUnfilledSeats({
      stripe,
      paymentIntent,
      amountCents: outcome.refundStudentCount * booking.unitPriceCents,
      logger,
    });
    if (!refundId) {
      // The money could not be sent back. That is a person's problem now, not
      // something to retry silently forever.
      await claimRef.set(
        {
          state: FULFILMENT_STATE.NEEDS_ADMIN,
          reason: "refund_failed",
          invoiceId,
          enrolledStudentIds: enrolment.enrolled,
          settledAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { state: FULFILMENT_STATE.NEEDS_ADMIN, reason: "refund_failed", invoiceId };
    }
  }

  await claimRef.set(
    {
      state: outcome.state,
      reason: outcome.reason ?? null,
      invoiceId,
      refundId,
      enrolledStudentIds: enrolment.enrolled,
      alreadyEnrolledStudentIds: enrolment.alreadyEnrolled,
      unfilledStudentIds: enrolment.noCapacity,
      settledAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info?.("One-off booking fulfilled", {
    paymentIntentId: paymentIntent.id,
    state: outcome.state,
    enrolled: enrolment.enrolled.length,
    unfilled: enrolment.noCapacity.length,
    invoiceId,
    refundId,
  });

  return {
    state: outcome.state,
    reason: outcome.reason ?? null,
    invoiceId,
    refundId,
    enrolledStudentIds: enrolment.enrolled,
    alreadyEnrolledStudentIds: enrolment.alreadyEnrolled,
    unfilledStudentIds: enrolment.noCapacity,
  };
}

/**
 * Whether the session has already run.
 *
 * A refund for a class that has been and gone is a judgement call — the student
 * may simply not have turned up — so this only ever routes to a human.
 */
function attendanceDateHasPassed(attendanceData, now = new Date()) {
  const raw = attendanceData?.date;
  if (!raw) return false;
  const date = typeof raw.toDate === "function" ? raw.toDate() : new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < now.getTime();
}

/**
 * Write the invoice for the seats that were actually filled.
 *
 * `requesterId` is pinned to the parent, not to the calling path. The dedupe
 * key is `sha256(requesterId + "\0" + createRequestId)`, so a webhook using
 * "stripe" and a client using the parent uid would produce two invoices for one
 * payment on every single booking.
 */
async function createFulfilmentInvoice({
  db,
  paymentIntent,
  parentId,
  booking,
  studentIds,
}) {
  // An invoice already linked to this payment means a client on an older build
  // got there first. Do not write a second one.
  const existing = await db
    .collection("invoices")
    .where("stripePaymentIntentId", "==", paymentIntent.id)
    .limit(1)
    .get();
  if (!existing.empty) return existing.docs[0].id;

  const parentSnap = await db.collection("users").doc(parentId).get();
  const parent = parentSnap.exists ? parentSnap.data() || {} : {};
  const parentName =
    `${parent.firstName ?? ""} ${parent.lastName ?? ""}`.trim() ||
    (typeof paymentIntent.metadata?.parentName === "string"
      ? paymentIntent.metadata.parentName
      : "");
  const parentEmail =
    (typeof parent.email === "string" && parent.email) ||
    paymentIntent.receipt_email ||
    paymentIntent.metadata?.parentEmail ||
    "";

  const unitAmount = booking.unitPriceCents / 100;
  const studentNames = await Promise.all(
    studentIds.map(async (id) => {
      const snap = await db.collection("students").doc(id).get();
      const data = snap.exists ? snap.data() || {} : {};
      return `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || id;
    })
  );

  const lineItems = studentNames.map((name) => ({
    description: `${name} (one-off class)`,
    quantity: 1,
    unitAmount,
    lineTotal: unitAmount,
  }));
  const amountDue = Math.round(unitAmount * studentIds.length * 100) / 100;

  const dueDate = new Date();
  const createRequestId = `one-off:${paymentIntent.id}`;
  const payload = {
    parentId,
    parentName,
    parentEmail,
    lineItems,
    weeks: 1,
    amountDue,
    amountDueComputed: amountDue,
    amountDueOverride: null,
    dueDateMillis: dueDate.getTime(),
    studentIds,
    adminNotes: null,
    stripePaymentIntentId: paymentIntent.id,
  };

  const result = await createInvoiceOnce({
    db,
    requesterId: parentId,
    createRequestId,
    payloadFingerprint: fingerprintInvoiceCreatePayload(payload),
    buildInvoice: (invoiceNumber) => ({
      parentId,
      parentName,
      parentEmail,
      lineItems,
      weeks: 1,
      amountDue,
      amountDueComputed: amountDue,
      amountDueOverride: null,
      status: "paid",
      dueDate: dueDate,
      createdAt: FieldValue.serverTimestamp(),
      studentIds,
      invoiceNumber,
      xeroInvoiceId: null,
      stripePaymentIntentId: paymentIntent.id,
      paidAt: FieldValue.serverTimestamp(),
      adminNotes: null,
      createdByAdminId: null,
      createRequestId,
      notificationAction: {
        type: "create_invoice",
        actorId: parentId,
      },
    }),
  });

  return result.invoiceId;
}

/**
 * Send back the part of a payment that bought nothing.
 *
 * Returns null on failure rather than throwing, so the caller can route the
 * booking to an admin instead of leaving a retry loop to keep trying to move
 * money.
 */
async function refundUnfilledSeats({ stripe, paymentIntent, amountCents, logger }) {
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntent.id,
        amount: amountCents,
        reason: "requested_by_customer",
      },
      { idempotencyKey: `oneoff-refund:${paymentIntent.id}` }
    );
    return refund.id;
  } catch (error) {
    logger.error?.("One-off partial refund failed", {
      paymentIntentId: paymentIntent.id,
      amountCents,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

module.exports = {
  FULFILMENT_COLLECTION,
  attendanceDateHasPassed,
  fulfilOneOffBookingImpl,
};
