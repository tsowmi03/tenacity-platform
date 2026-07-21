"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ValidationError } = require("../../src/shared/validation");
const {
  validateAcceptEnrolmentInput,
  validateDeleteEnrolmentInput,
  validateEnrolmentStatus,
  ENROLMENT_STATUSES,
} = require("../../src/enrolments/enrolmentSchemas");
const {
  acceptedFields,
  archivedFields,
  unarchivedFields,
  softDeletedFields,
} = require("../../src/enrolments/enrolmentFactory");

const clock = () => new Date("2026-05-13T00:00:00Z");

describe("enrolment schemas", () => {
  it("validateAcceptEnrolmentInput requires enrolmentId", () => {
    assert.throws(() => validateAcceptEnrolmentInput({}), ValidationError);
    assert.deepEqual(
      validateAcceptEnrolmentInput({ enrolmentId: " abc " }),
      { enrolmentId: "abc" }
    );
  });

  it("validateDeleteEnrolmentInput accepts optional reason", () => {
    const out = validateDeleteEnrolmentInput({
      enrolmentId: "abc",
      reason: " spam ",
    });
    assert.deepEqual(out, { enrolmentId: "abc", reason: "spam" });
  });

  it("validateEnrolmentStatus enforces the lifecycle vocabulary", () => {
    for (const s of ENROLMENT_STATUSES) {
      assert.equal(validateEnrolmentStatus(s), s);
    }
    assert.throws(() => validateEnrolmentStatus("nope"), ValidationError);
  });
});

describe("acceptedFields", () => {
  it("writes lifecycle fields and audit metadata", () => {
    const out = acceptedFields({
      actorUid: "admin-1",
      createdParentId: "p1",
      createdStudentId: "s1",
      clock,
    });
    assert.equal(out.status, "accepted");
    assert.equal(out.archived, true);
    assert.equal(out.acceptedBy, "admin-1");
    assert.equal(out.createdParentId, "p1");
    assert.equal(out.createdStudentId, "s1");
    assert.equal(out.acceptedAt.toMillis(), out.updatedAt.toMillis());
  });

  it("requires actorUid", () => {
    assert.throws(() => acceptedFields({}), TypeError);
  });
});

describe("archivedFields / unarchivedFields", () => {
  it("archivedFields sets status:archived, archived:true", () => {
    const out = archivedFields({ actorUid: "admin-1", clock });
    assert.equal(out.status, "archived");
    assert.equal(out.archived, true);
    assert.equal(out.archivedBy, "admin-1");
  });

  it("unarchivedFields nulls archived metadata and resets to pending", () => {
    const out = unarchivedFields({ actorUid: "admin-1", clock });
    assert.equal(out.status, "pending");
    assert.equal(out.archived, false);
    assert.equal(out.archivedAt, null);
    assert.equal(out.archivedBy, null);
  });
});

describe("softDeletedFields", () => {
  it("writes deleted lifecycle fields", () => {
    const out = softDeletedFields({
      actorUid: "admin-1",
      reason: "duplicate",
      clock,
    });
    assert.equal(out.status, "deleted");
    assert.equal(out.archived, true);
    assert.equal(out.deletedBy, "admin-1");
    assert.equal(out.deleteReason, "duplicate");
  });

  it("falls back to null when reason missing", () => {
    const out = softDeletedFields({ actorUid: "admin-1", clock });
    assert.equal(out.deleteReason, null);
  });
});
