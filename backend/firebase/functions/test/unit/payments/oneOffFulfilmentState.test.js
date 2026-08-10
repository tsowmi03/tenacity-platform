"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  CLAIM_DECISION,
  CLAIM_LEASE_MS,
  FULFILMENT_STATE,
  classifyFulfilmentOutcome,
  decideFulfilmentClaim,
} = require("../../../src/payments/oneOffFulfilmentState");

const NOW = new Date("2026-08-10T09:00:00Z");

/** A Firestore-style timestamp, which is what the claim actually holds. */
const timestamp = (date) => ({ toMillis: () => date.getTime() });

describe("decideFulfilmentClaim", () => {
  it("claims a payment nobody has touched", () => {
    assert.equal(decideFulfilmentClaim({ claim: null, now: NOW }), CLAIM_DECISION.CLAIM);
  });

  it("stands aside while another caller is working", () => {
    // The webhook and verifyPaymentStatus arrive within seconds of each other.
    const claim = {
      state: FULFILMENT_STATE.PENDING,
      claimedAt: timestamp(new Date(NOW.getTime() - 5_000)),
    };
    assert.equal(
      decideFulfilmentClaim({ claim, now: NOW }),
      CLAIM_DECISION.IN_PROGRESS
    );
  });

  it("takes over a claim whose holder died", () => {
    // Without this a crashed fulfilment would strand the booking forever —
    // the very failure the whole change exists to remove.
    const claim = {
      state: FULFILMENT_STATE.PENDING,
      claimedAt: timestamp(new Date(NOW.getTime() - CLAIM_LEASE_MS - 1)),
    };
    assert.equal(decideFulfilmentClaim({ claim, now: NOW }), CLAIM_DECISION.CLAIM);
  });

  it("reports a finished booking rather than redoing it", () => {
    for (const state of [
      FULFILMENT_STATE.COMPLETE,
      FULFILMENT_STATE.REFUNDED,
      FULFILMENT_STATE.NEEDS_ADMIN,
    ]) {
      assert.equal(
        decideFulfilmentClaim({ claim: { state }, now: NOW }),
        CLAIM_DECISION.SETTLED,
        `${state} is settled`
      );
    }
  });

  it("treats an undateable claim as dead rather than stranding the payment", () => {
    assert.equal(
      decideFulfilmentClaim({
        claim: { state: FULFILMENT_STATE.PENDING, claimedAt: null },
        now: NOW,
      }),
      CLAIM_DECISION.CLAIM
    );
  });

  it("reads a plain Date or millisecond claim time too", () => {
    const recent = new Date(NOW.getTime() - 1_000);
    assert.equal(
      decideFulfilmentClaim({
        claim: { state: FULFILMENT_STATE.PENDING, claimedAt: recent },
        now: NOW,
      }),
      CLAIM_DECISION.IN_PROGRESS
    );
    assert.equal(
      decideFulfilmentClaim({
        claim: { state: FULFILMENT_STATE.PENDING, claimedAt: recent.getTime() },
        now: NOW,
      }),
      CLAIM_DECISION.IN_PROGRESS
    );
  });
});

describe("classifyFulfilmentOutcome", () => {
  it("completes when everyone got a seat", () => {
    assert.deepEqual(
      classifyFulfilmentOutcome({ enrolledCount: 2, noCapacityCount: 0 }),
      { state: FULFILMENT_STATE.COMPLETE, refundStudentCount: 0 }
    );
  });

  it("completes a repeat delivery, where everyone was already enrolled", () => {
    assert.deepEqual(
      classifyFulfilmentOutcome({
        enrolledCount: 0,
        alreadyEnrolledCount: 2,
        noCapacityCount: 0,
      }),
      { state: FULFILMENT_STATE.COMPLETE, refundStudentCount: 0 }
    );
  });

  it("refunds in full when the session filled up before the payment landed", () => {
    const outcome = classifyFulfilmentOutcome({
      enrolledCount: 0,
      noCapacityCount: 2,
    });
    assert.equal(outcome.state, FULFILMENT_STATE.REFUNDED);
    assert.equal(outcome.refundStudentCount, 2);
    assert.equal(outcome.reason, "session_full");
  });

  it("keeps a partial booking and refunds only the seats that were not there", () => {
    const outcome = classifyFulfilmentOutcome({
      enrolledCount: 2,
      noCapacityCount: 1,
    });
    assert.equal(outcome.state, FULFILMENT_STATE.COMPLETE);
    assert.equal(outcome.refundStudentCount, 1);
    assert.equal(outcome.reason, "partial_fit");
  });

  it("never refunds a class that has already run", () => {
    // By then the class either happened or it did not, and only a human knows.
    const outcome = classifyFulfilmentOutcome({
      enrolledCount: 0,
      noCapacityCount: 1,
      classDateHasPassed: true,
    });
    assert.equal(outcome.state, FULFILMENT_STATE.NEEDS_ADMIN);
    assert.equal(outcome.refundStudentCount, 0);
    assert.equal(outcome.reason, "class_date_passed");
  });
});
