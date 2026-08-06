"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  STUCK_AFTER_MS,
  triageOneOffPayment,
} = require("../../../src/payments/reconcileOneOffPayments");
const { FULFILMENT_STATE } = require("../../../src/payments/oneOffFulfilmentState");
const { encodeBookingMetadata } = require("../../../src/payments/oneOffBookingMetadata");

const NOW = new Date("2026-08-10T03:00:00Z");

const BOOKING_METADATA = {
  parentId: "parent-1",
  invoiceIds: "",
  paymentType: "one_off_booking",
  source: "tenacity_tutoring",
  ...encodeBookingMetadata({
    classId: "class-1",
    attendanceDocId: "2026-08-12",
    studentIds: ["student-1"],
    unitPriceCents: 7000,
  }),
};

/** A payment from an app build that predates the booking context. */
const LEGACY_METADATA = {
  parentId: "parent-1",
  invoiceIds: "",
  paymentType: "one_off_booking",
  source: "tenacity_tutoring",
};

const succeeded = (metadata) => ({ status: "succeeded", metadata });
const timestamp = (date) => ({ toMillis: () => date.getTime() });

describe("triageOneOffPayment", () => {
  it("leaves a completed booking alone", () => {
    assert.deepEqual(
      triageOneOffPayment({
        ledgerEntry: succeeded(BOOKING_METADATA),
        fulfilment: { state: FULFILMENT_STATE.COMPLETE },
        hasInvoice: true,
        now: NOW,
      }),
      { action: "skip" }
    );
  });

  it("leaves a refunded booking alone", () => {
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: succeeded(BOOKING_METADATA),
        fulfilment: { state: FULFILMENT_STATE.REFUNDED },
        hasInvoice: false,
        now: NOW,
      }).action,
      "skip"
    );
  });

  it("does not re-alert a booking already flagged for an admin", () => {
    // Alerting nightly about the same payment is how alerts get ignored.
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: succeeded(BOOKING_METADATA),
        fulfilment: { state: FULFILMENT_STATE.NEEDS_ADMIN },
        hasInvoice: false,
        now: NOW,
      }).action,
      "skip"
    );
  });

  it("ignores a payment that never succeeded", () => {
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: { status: "failed", metadata: BOOKING_METADATA },
        fulfilment: null,
        hasInvoice: false,
        now: NOW,
      }).action,
      "skip"
    );
  });

  it("fulfils a paid booking nothing ever completed", () => {
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: succeeded(BOOKING_METADATA),
        fulfilment: null,
        hasInvoice: false,
        now: NOW,
      }).action,
      "fulfil"
    );
  });

  it("gives a fulfilment still in flight time to finish", () => {
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: succeeded(BOOKING_METADATA),
        fulfilment: {
          state: FULFILMENT_STATE.PENDING,
          claimedAt: timestamp(new Date(NOW.getTime() - 60_000)),
        },
        hasInvoice: false,
        now: NOW,
      }).action,
      "skip"
    );
  });

  it("resumes a fulfilment that has been stuck", () => {
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: succeeded(BOOKING_METADATA),
        fulfilment: {
          state: FULFILMENT_STATE.PENDING,
          claimedAt: timestamp(new Date(NOW.getTime() - STUCK_AFTER_MS - 1)),
        },
        hasInvoice: false,
        now: NOW,
      }).action,
      "fulfil"
    );
  });

  it("alerts on a legacy payment with no booking and no invoice", () => {
    // The 6 August $70, and the three from 23 May. Nothing can complete these
    // automatically — the class and child were only ever known to the phone.
    const decision = triageOneOffPayment({
      ledgerEntry: succeeded(LEGACY_METADATA),
      fulfilment: null,
      hasInvoice: false,
      now: NOW,
    });
    assert.equal(decision.action, "alert");
    assert.equal(decision.reason, "legacy_orphan");
  });

  it("stays quiet about a legacy payment the client finished", () => {
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: succeeded(LEGACY_METADATA),
        fulfilment: null,
        hasInvoice: true,
        now: NOW,
      }).action,
      "skip"
    );
  });
});
