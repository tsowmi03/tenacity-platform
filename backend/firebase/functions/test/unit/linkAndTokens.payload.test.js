"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const { ValidationError } = require("../../src/shared/validation");
const { validateLinkPayload } = require("../../src/users/linkStudent");
const {
  validateAdjustPayload,
} = require("../../src/users/adjustLessonTokens");

describe("validateLinkPayload", () => {
  it("returns trimmed ids", () => {
    assert.deepEqual(
      validateLinkPayload({ parentId: " p1 ", studentId: " s1 " }),
      { parentId: "p1", studentId: "s1" }
    );
  });
  it("requires both ids", () => {
    assert.throws(
      () => validateLinkPayload({ parentId: "p1" }),
      ValidationError
    );
  });
});

describe("validateAdjustPayload", () => {
  it("accepts a delta", () => {
    const out = validateAdjustPayload({ uid: "u1", delta: 3 });
    assert.deepEqual(out, { uid: "u1", reason: undefined, mode: "delta", value: 3 });
  });
  it("accepts a negative delta", () => {
    const out = validateAdjustPayload({ uid: "u1", delta: -2 });
    assert.equal(out.value, -2);
  });
  it("accepts a set", () => {
    const out = validateAdjustPayload({ uid: "u1", set: 10 });
    assert.equal(out.mode, "set");
    assert.equal(out.value, 10);
  });
  it("rejects when both delta and set provided", () => {
    assert.throws(
      () => validateAdjustPayload({ uid: "u1", delta: 1, set: 5 }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });
  it("rejects when neither provided", () => {
    assert.throws(
      () => validateAdjustPayload({ uid: "u1" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });
  it("rejects non-integer delta", () => {
    assert.throws(
      () => validateAdjustPayload({ uid: "u1", delta: 1.5 }),
      ValidationError
    );
  });
  it("rejects negative set", () => {
    assert.throws(
      () => validateAdjustPayload({ uid: "u1", set: -1 }),
      ValidationError
    );
  });
});
