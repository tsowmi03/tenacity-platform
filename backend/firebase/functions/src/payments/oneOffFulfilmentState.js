"use strict";

/**
 * The state machine behind completing a paid one-off booking.
 *
 * Fulfilment can be attempted by three callers — the Stripe webhook, the app's
 * `verifyPaymentStatus`, and the nightly sweep — potentially at the same
 * moment. A claim in `oneOffFulfilments/{paymentIntentId}` decides who does the
 * work, and this module holds the rules for reading that claim.
 *
 * Pure, so the concurrency rules can be tested without Firestore.
 */

const FULFILMENT_STATE = Object.freeze({
  /** Someone is working on it, or crashed while working on it. */
  PENDING: "pending",
  /** Enrolled and invoiced. Nothing left to do. */
  COMPLETE: "complete",
  /** The session could not take them; the money went back. */
  REFUNDED: "refunded",
  /** A human has to look. Never retried automatically. */
  NEEDS_ADMIN: "needs_admin",
});

/**
 * How long a claim is honoured before another caller may take it over.
 *
 * A process that dies mid-fulfilment leaves `pending` behind. Without a lease,
 * that booking would never be completed by anything — which is the failure this
 * whole change exists to remove, reintroduced by its own lock.
 */
const CLAIM_LEASE_MS = 60_000;

const CLAIM_DECISION = Object.freeze({
  /** No claim, or a dead one. Take it and do the work. */
  CLAIM: "claim",
  /** Someone else is actively on it. Leave them to it. */
  IN_PROGRESS: "in_progress",
  /** Already finished. Report what happened. */
  SETTLED: "settled",
});

function claimedAtMillis(claim) {
  const value = claim?.claimedAt;
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/**
 * What a caller should do, given the claim it found.
 *
 * `now` is passed in rather than read so the lease can be tested.
 */
function decideFulfilmentClaim({ claim, now, leaseMs = CLAIM_LEASE_MS }) {
  if (!claim) return CLAIM_DECISION.CLAIM;

  if (
    claim.state === FULFILMENT_STATE.COMPLETE ||
    claim.state === FULFILMENT_STATE.REFUNDED ||
    claim.state === FULFILMENT_STATE.NEEDS_ADMIN
  ) {
    return CLAIM_DECISION.SETTLED;
  }

  const claimedAt = claimedAtMillis(claim);
  const currentMillis = now instanceof Date ? now.getTime() : Number(now);

  // A claim we cannot date is treated as dead. Being unable to read a timestamp
  // must not strand a payment forever.
  if (claimedAt === null) return CLAIM_DECISION.CLAIM;

  return currentMillis - claimedAt >= leaseMs
    ? CLAIM_DECISION.CLAIM
    : CLAIM_DECISION.IN_PROGRESS;
}

/**
 * How a fulfilment attempt ended, given what the session could take.
 *
 * A booking nobody could be enrolled into is refunded in full; a partial fit
 * enrols who fits and refunds the difference. A session whose date has already
 * passed is never refunded automatically — by then the class either ran or did
 * not, and only a human knows which.
 */
function classifyFulfilmentOutcome({
  enrolledCount,
  alreadyEnrolledCount = 0,
  noCapacityCount,
  classDateHasPassed = false,
}) {
  const settledCount = enrolledCount + alreadyEnrolledCount;

  if (noCapacityCount === 0) {
    return { state: FULFILMENT_STATE.COMPLETE, refundStudentCount: 0 };
  }

  if (classDateHasPassed) {
    return {
      state: FULFILMENT_STATE.NEEDS_ADMIN,
      refundStudentCount: 0,
      reason: "class_date_passed",
    };
  }

  if (settledCount === 0) {
    return {
      state: FULFILMENT_STATE.REFUNDED,
      refundStudentCount: noCapacityCount,
      reason: "session_full",
    };
  }

  return {
    state: FULFILMENT_STATE.COMPLETE,
    refundStudentCount: noCapacityCount,
    reason: "partial_fit",
  };
}

module.exports = {
  CLAIM_DECISION,
  CLAIM_LEASE_MS,
  FULFILMENT_STATE,
  classifyFulfilmentOutcome,
  decideFulfilmentClaim,
};
