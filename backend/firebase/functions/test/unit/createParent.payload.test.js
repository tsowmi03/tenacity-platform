"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const { ValidationError } = require("../../src/shared/validation");
const { validateCreateParentPayload } = require("../../src/users/createParent");

describe("validateCreateParentPayload", () => {
  it("forces role:'parent' regardless of input role", () => {
    const out = validateCreateParentPayload({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "0400",
      studentIds: ["s1"],
    });
    assert.equal(out.user.role, "parent");
    assert.deepEqual(out.studentIds, ["s1"]);
  });

  it("requires at least one studentId", () => {
    assert.throws(
      () =>
        validateCreateParentPayload({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          phone: "0400",
          studentIds: [],
        }),
      ValidationError
    );
  });

  it("rejects duplicate studentIds", () => {
    assert.throws(
      () =>
        validateCreateParentPayload({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
          phone: "0400",
          studentIds: ["s1", "s1"],
        }),
      ValidationError
    );
  });

  it("rejects missing payload", () => {
    assert.throws(
      () => validateCreateParentPayload(null),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });
});
