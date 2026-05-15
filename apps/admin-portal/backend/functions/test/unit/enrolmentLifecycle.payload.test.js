"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const { ValidationError } = require("../../src/shared/validation");
const {
  validatePurgePayload,
} = require("../../src/enrolments/deleteEnrolment");
const {
  validateUpdateEnrolmentPayload,
} = require("../../src/enrolments/updateEnrolment");

describe("validatePurgePayload", () => {
  it("trims ids and optional reason", () => {
    const out = validatePurgePayload({
      enrolmentId: " e1 ",
      confirmId: " e1 ",
      reason: " test ",
    });
    assert.deepEqual(out, { enrolmentId: "e1", confirmId: "e1", reason: "test" });
  });
  it("rejects missing confirmId", () => {
    assert.throws(
      () => validatePurgePayload({ enrolmentId: "e1" }),
      ValidationError
    );
  });
});

describe("validateUpdateEnrolmentPayload", () => {
  it("accepts a single-field update", () => {
    const out = validateUpdateEnrolmentPayload({
      enrolmentId: "e1",
      allergies: " peanuts ",
    });
    assert.deepEqual(out, {
      enrolmentId: "e1",
      updates: { allergies: "peanuts" },
    });
  });

  it("normalises carerEmail", () => {
    const out = validateUpdateEnrolmentPayload({
      enrolmentId: "e1",
      carerEmail: " A@B.com ",
    });
    assert.equal(out.updates.carerEmail, "a@b.com");
  });

  it("validates classes[] entries", () => {
    const out = validateUpdateEnrolmentPayload({
      enrolmentId: "e1",
      classes: [{ id: "c1", day: "Monday", startTime: "16:00" }],
    });
    assert.equal(out.updates.classes.length, 1);
    assert.throws(
      () =>
        validateUpdateEnrolmentPayload({
          enrolmentId: "e1",
          classes: [{ day: "Monday" }],
        }),
      ValidationError
    );
  });

  it("rejects empty updates", () => {
    assert.throws(
      () => validateUpdateEnrolmentPayload({ enrolmentId: "e1" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("rejects unknown status field by ignoring it (out of updatable set)", () => {
    const out = validateUpdateEnrolmentPayload({
      enrolmentId: "e1",
      status: "accepted",
      allergies: "peanuts",
    });
    assert.equal("status" in out.updates, false);
    assert.equal(out.updates.allergies, "peanuts");
  });
});
