"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ValidationError } = require("../../src/shared/validation");
const {
  validateDeleteUserPayload,
} = require("../../src/users/deleteUser");

describe("validateDeleteUserPayload", () => {
  it("normalises confirmEmail (lowercases)", () => {
    const out = validateDeleteUserPayload({
      uid: " u1 ",
      confirmEmail: " Jane@Example.COM ",
    });
    assert.deepEqual(out, { uid: "u1", confirmEmail: "jane@example.com" });
  });

  it("requires both fields", () => {
    assert.throws(
      () => validateDeleteUserPayload({ uid: "u1" }),
      ValidationError
    );
    assert.throws(
      () => validateDeleteUserPayload({ confirmEmail: "a@b.com" }),
      ValidationError
    );
  });

  it("rejects malformed confirmEmail", () => {
    assert.throws(
      () => validateDeleteUserPayload({ uid: "u1", confirmEmail: "not-an-email" }),
      ValidationError
    );
  });
});
