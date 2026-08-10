"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  activeHoldSeats,
  capacityAfterHolds,
} = require("../../../src/attendance/oneOffSeatHolds");

const NOW = new Date("2026-08-10T09:00:00Z");
const expiresAt = (date) => ({ toMillis: () => date.getTime() });

const hold = ({ paymentIntentId = "pi_other", studentCount = 1, minutesLeft = 10 }) => ({
  paymentIntentId,
  studentCount,
  expiresAt: expiresAt(new Date(NOW.getTime() + minutesLeft * 60_000)),
});

describe("activeHoldSeats", () => {
  it("counts seats reserved by payments still in flight", () => {
    assert.equal(
      activeHoldSeats({
        holds: [hold({ studentCount: 2 }), hold({ paymentIntentId: "pi_b" })],
        now: NOW,
      }),
      3
    );
  });

  it("ignores holds that have expired", () => {
    // An abandoned card sheet must not keep a seat out of circulation.
    assert.equal(
      activeHoldSeats({ holds: [hold({ minutesLeft: -1 })], now: NOW }),
      0
    );
  });

  it("does not let a booking block itself", () => {
    assert.equal(
      activeHoldSeats({
        holds: [hold({ paymentIntentId: "pi_mine", studentCount: 2 })],
        now: NOW,
        excludePaymentIntentId: "pi_mine",
      }),
      0
    );
  });

  it("releases a hold it cannot read rather than honouring it forever", () => {
    assert.equal(
      activeHoldSeats({
        holds: [{ paymentIntentId: "pi_x", studentCount: 1, expiresAt: null }],
        now: NOW,
      }),
      0
    );
  });

  it("survives missing or malformed holds", () => {
    assert.equal(activeHoldSeats({ holds: null, now: NOW }), 0);
    assert.equal(activeHoldSeats({ holds: [null, undefined], now: NOW }), 0);
    assert.equal(
      activeHoldSeats({ holds: [hold({ studentCount: -3 })], now: NOW }),
      0
    );
  });
});

describe("capacityAfterHolds", () => {
  it("takes held seats out of the capacity a booking may use", () => {
    assert.equal(
      capacityAfterHolds({ capacity: 6, holds: [hold({ studentCount: 2 })], now: NOW }),
      4
    );
  });

  it("never goes below zero, however many seats are held", () => {
    assert.equal(
      capacityAfterHolds({ capacity: 2, holds: [hold({ studentCount: 5 })], now: NOW }),
      0
    );
  });

  it("leaves capacity alone when nothing is held", () => {
    assert.equal(capacityAfterHolds({ capacity: 6, holds: [], now: NOW }), 6);
  });
});
