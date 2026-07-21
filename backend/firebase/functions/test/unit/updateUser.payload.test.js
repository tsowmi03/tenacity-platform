"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const { ValidationError } = require("../../src/shared/validation");
const {
  validateUpdateUserPayload,
} = require("../../src/users/updateUser");
const {
  validateUpdateStudentPayload,
} = require("../../src/students/updateStudent");

describe("validateUpdateUserPayload", () => {
  it("returns uid + updates", () => {
    const out = validateUpdateUserPayload({ uid: "u1", firstName: " A " });
    assert.deepEqual(out, { uid: "u1", updates: { firstName: "A" } });
  });
  it("requires uid", () => {
    assert.throws(
      () => validateUpdateUserPayload({ firstName: "A" }),
      ValidationError
    );
  });
  it("rejects empty updates", () => {
    assert.throws(
      () => validateUpdateUserPayload({ uid: "u1" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });
});

describe("validateUpdateStudentPayload", () => {
  it("returns studentId + updates", () => {
    const out = validateUpdateStudentPayload({ studentId: "s1", grade: "8" });
    assert.deepEqual(out, { studentId: "s1", updates: { grade: "8" } });
  });
  it("rejects empty updates", () => {
    assert.throws(
      () => validateUpdateStudentPayload({ studentId: "s1" }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });
});
