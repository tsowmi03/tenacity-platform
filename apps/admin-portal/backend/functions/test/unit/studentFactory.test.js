"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ValidationError } = require("../../src/shared/validation");
const {
  validateCreateStudentInput,
  validateUpdateStudentInput,
} = require("../../src/students/studentSchemas");
const { buildStudentDoc } = require("../../src/students/studentFactory");

const clock = () => new Date("2026-05-13T00:00:00Z");

describe("validateCreateStudentInput", () => {
  it("normalises required fields, defaults arrays", () => {
    const out = validateCreateStudentInput({
      firstName: " A ",
      lastName: " B ",
      grade: " 7 ",
    });
    assert.deepEqual(out, {
      firstName: "A",
      lastName: "B",
      grade: "7",
      subjects: [],
      parents: [],
    });
  });
  it("rejects duplicate subjects", () => {
    assert.throws(
      () =>
        validateCreateStudentInput({
          firstName: "A",
          lastName: "B",
          grade: "7",
          subjects: ["Maths", "Maths"],
        }),
      ValidationError
    );
  });
});

describe("validateUpdateStudentInput", () => {
  it("only returns provided fields", () => {
    const out = validateUpdateStudentInput({ grade: " 8 " });
    assert.deepEqual(out, { grade: "8" });
  });
});

describe("buildStudentDoc", () => {
  it("produces app-compatible shape", () => {
    const doc = buildStudentDoc(
      {
        firstName: "A",
        lastName: "B",
        grade: "7",
        subjects: ["Maths"],
        parents: ["uid-1"],
        primaryParentId: "uid-1",
      },
      { actorUid: "admin-1", clock }
    );
    assert.equal(doc.firstName, "A");
    assert.equal(doc.lastName, "B");
    assert.equal(doc.grade, "7");
    assert.deepEqual(doc.subjects, ["Maths"]);
    assert.deepEqual(doc.parents, ["uid-1"]);
    assert.equal(doc.primaryParentId, "uid-1");
    assert.equal(doc.createdBy, "admin-1");
    assert.equal(doc.createdAt.toMillis(), doc.updatedAt.toMillis());
  });

  it("omits primaryParentId when not provided", () => {
    const doc = buildStudentDoc(
      { firstName: "A", lastName: "B", grade: "7", subjects: [], parents: [] },
      { actorUid: "admin-1", clock }
    );
    assert.equal(doc.primaryParentId, undefined);
  });

  it("requires actorUid", () => {
    assert.throws(
      () =>
        buildStudentDoc(
          { firstName: "A", lastName: "B", grade: "7" },
          {}
        ),
      TypeError
    );
  });

  it("rejects unsupported subjects", () => {
    assert.throws(
      () =>
        validateCreateStudentInput({
          firstName: "A",
          lastName: "B",
          grade: "7",
          subjects: ["Math"],
        }),
      ValidationError
    );
  });
});
