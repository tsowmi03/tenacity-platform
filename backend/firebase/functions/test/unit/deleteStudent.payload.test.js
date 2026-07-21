"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ValidationError } = require("../../src/shared/validation");
const {
  validateDeleteStudentPayload,
} = require("../../src/students/deleteStudent");

describe("validateDeleteStudentPayload", () => {
  it("trims studentId and confirmFullName", () => {
    const out = validateDeleteStudentPayload({
      studentId: " s1 ",
      confirmFullName: " Tom  Doe ",
    });
    assert.equal(out.studentId, "s1");
    assert.equal(out.confirmFullName, "Tom  Doe");
  });
  it("requires both fields", () => {
    assert.throws(
      () => validateDeleteStudentPayload({ studentId: "s1" }),
      ValidationError
    );
    assert.throws(
      () => validateDeleteStudentPayload({ confirmFullName: "Tom Doe" }),
      ValidationError
    );
  });
});
