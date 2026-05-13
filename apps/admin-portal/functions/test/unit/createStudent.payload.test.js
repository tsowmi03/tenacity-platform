"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const { ValidationError } = require("../../src/shared/validation");
const {
  validateCreateStudentPayload,
} = require("../../src/students/createStudent");

describe("validateCreateStudentPayload", () => {
  const base = { firstName: "Tom", lastName: "Doe", grade: "7" };

  it("defaults parentIds to []", () => {
    const out = validateCreateStudentPayload(base);
    assert.deepEqual(out.parentIds, []);
    assert.equal(out.student.firstName, "Tom");
  });

  it("accepts parentIds and primaryParentId", () => {
    const out = validateCreateStudentPayload({
      ...base,
      parentIds: ["p1", "p2"],
      primaryParentId: "p1",
    });
    assert.deepEqual(out.parentIds, ["p1", "p2"]);
    assert.equal(out.primaryParentId, "p1");
  });

  it("rejects primaryParentId not in parentIds", () => {
    assert.throws(
      () =>
        validateCreateStudentPayload({
          ...base,
          parentIds: ["p1"],
          primaryParentId: "p2",
        }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("rejects duplicate parentIds", () => {
    assert.throws(
      () =>
        validateCreateStudentPayload({ ...base, parentIds: ["p1", "p1"] }),
      ValidationError
    );
  });

  it("strips bare `parents` field from input", () => {
    const out = validateCreateStudentPayload({
      ...base,
      parents: ["sneaky"],
      parentIds: ["p1"],
    });
    assert.deepEqual(out.student.parents, []);
    assert.deepEqual(out.parentIds, ["p1"]);
  });
});
