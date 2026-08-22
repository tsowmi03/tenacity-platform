"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  STUCK_AFTER_MS,
  buildAlertNotification,
  notifyAdmins,
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

describe("triageOneOffPayment without a ledger entry", () => {
  it("uses the claim's own booking when the ledger entry never landed", () => {
    // A fulfilment that crashed before `recordPaymentLog` ran leaves a claim
    // and no ledger entry. Reading only the ledger would call this a legacy
    // orphan and merely alert, when it can actually be completed.
    const decision = triageOneOffPayment({
      ledgerEntry: { status: "succeeded" },
      fulfilment: {
        state: FULFILMENT_STATE.PENDING,
        claimedAt: timestamp(new Date(NOW.getTime() - STUCK_AFTER_MS - 1)),
        booking: {
          classId: "class-1",
          attendanceDocId: "2026-08-12",
          studentIds: ["student-1"],
          unitPriceCents: 7000,
        },
      },
      hasInvoice: false,
      now: NOW,
    });

    assert.equal(decision.action, "fulfil");
  });

  it("still alerts on a claimless, contextless payment", () => {
    assert.equal(
      triageOneOffPayment({
        ledgerEntry: succeeded(LEGACY_METADATA),
        fulfilment: null,
        hasInvoice: false,
        now: NOW,
      }).reason,
      "legacy_orphan"
    );
  });
});

describe("buildAlertNotification", () => {
  it("names the problem when there is only one", () => {
    const notification = buildAlertNotification([
      { paymentIntentId: "pi_1", reason: "legacy_orphan", amount: 70 },
    ]);

    assert.match(notification.body, /\$70\.00/);
    assert.match(notification.body, /nothing recorded a booking/);
    assert.equal(notification.paymentIntentIds, "pi_1");
  });

  it("totals them when there are several", () => {
    const notification = buildAlertNotification([
      { paymentIntentId: "pi_1", reason: "legacy_orphan", amount: 70 },
      { paymentIntentId: "pi_2", reason: "refund_failed", amount: 140 },
    ]);

    assert.match(notification.body, /2 one-off payments/);
    assert.match(notification.body, /\$210\.00/);
    assert.equal(notification.paymentIntentIds, "pi_1,pi_2");
  });

  it("still says something useful when the amount is unknown", () => {
    const notification = buildAlertNotification([
      { paymentIntentId: "pi_1", reason: "session_full" },
    ]);

    assert.ok(notification.title.length > 0);
    assert.ok(!notification.body.includes("$NaN"));
  });
});

describe("notifyAdmins", () => {
  const alerts = [{ paymentIntentId: "pi_1", reason: "legacy_orphan", amount: 70 }];
  const silent = { warn() {}, error() {}, info() {} };

  it("sends to every admin device", async () => {
    const sent = [];
    await notifyAdmins({
      alerts,
      log: silent,
      deps: {
        getAdminTokenOwners: async () => [
          { uid: "admin-1", role: "admin", tokens: ["token-a"] },
          { uid: "admin-2", role: "admin", tokens: ["token-b"] },
        ],
        sendAndRecord: async (message) => sent.push(message),
      },
    });

    assert.equal(sent.length, 1);
    assert.deepEqual(
      sent[0].recipients.flatMap((r) => r.tokens),
      ["token-a", "token-b"]
    );
    assert.equal(sent[0].data.type, "one_off_payment_alert");
    assert.equal(sent[0].data.paymentIntentIds, "pi_1");
  });

  it("says so rather than sending into the void when nobody is registered", async () => {
    const sent = [];
    const warnings = [];
    await notifyAdmins({
      alerts,
      log: { ...silent, warn: (message) => warnings.push(message) },
      deps: {
        getAdminTokenOwners: async () => [],
        sendAndRecord: async (message) => sent.push(message),
      },
    });

    assert.equal(sent.length, 0);
    assert.equal(warnings.length, 1);
  });

  it("never fails the sweep because a notification failed", async () => {
    // The fulfilment work already done is worth keeping either way.
    await notifyAdmins({
      alerts,
      log: silent,
      deps: {
        getAdminTokens: async () => {
          throw new Error("messaging is down");
        },
      },
    });
  });
});
