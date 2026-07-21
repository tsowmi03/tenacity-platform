"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  validateCreateUserInput,
  validateUpdateUserInput,
} = require("../../src/users/userSchemas");
const { buildUserDoc } = require("../../src/users/userFactory");
const { ValidationError } = require("../../src/shared/validation");

const fixedClock = () => new Date("2026-05-13T00:00:00Z");

describe("validateCreateUserInput", () => {
  it("normalises a valid parent payload", () => {
    const out = validateCreateUserInput({
      role: "parent",
      firstName: "  Jane ",
      lastName: " Doe ",
      email: " JANE@EXAMPLE.COM ",
      phone: " 0400000000 ",
      lessonTokens: 5,
    });
    assert.deepEqual(out, {
      role: "parent",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "0400000000",
      lessonTokens: 5,
    });
  });

  it("rejects unknown role", () => {
    assert.throws(
      () =>
        validateCreateUserInput({
          role: "hacker",
          firstName: "X",
          lastName: "Y",
          email: "x@y.com",
          phone: "1",
        }),
      ValidationError
    );
  });

  it("rejects lessonTokens for non-parent", () => {
    assert.throws(
      () =>
        validateCreateUserInput({
          role: "tutor",
          firstName: "X",
          lastName: "Y",
          email: "x@y.com",
          phone: "1",
          lessonTokens: 5,
        }),
      /lessonTokens/
    );
  });

  it("aggregates multiple field errors", () => {
    try {
      validateCreateUserInput({
        role: "parent",
        firstName: "",
        lastName: "",
        email: "bad",
        phone: "",
      });
      assert.fail("should throw");
    } catch (err) {
      assert.ok(err instanceof ValidationError);
      assert.ok(err.issues.length >= 3);
    }
  });
});

describe("validateUpdateUserInput", () => {
  it("returns only present fields", () => {
    const out = validateUpdateUserInput({ firstName: "  Z " });
    assert.deepEqual(out, { firstName: "Z" });
  });
  it("rejects negative lessonTokens", () => {
    assert.throws(
      () => validateUpdateUserInput({ lessonTokens: -1 }),
      ValidationError
    );
  });
});

describe("buildUserDoc", () => {
  const baseParent = {
    role: "parent",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "0400",
  };

  it("includes every app-required field for a parent", () => {
    const doc = buildUserDoc(baseParent, {
      actorUid: "admin-1",
      clock: fixedClock,
    });

    // Shared fields must all be present.
    assert.equal(doc.firstName, "Jane");
    assert.equal(doc.lastName, "Doe");
    assert.equal(doc.role, "parent");
    assert.equal(doc.email, "jane@example.com");
    assert.equal(doc.phone, "0400");
    assert.deepEqual(doc.fcmTokens, []);
    assert.deepEqual(doc.unreadChats, {});
    assert.deepEqual(doc.activeChats, []);
    assert.equal(doc.termsAccepted, false);
    assert.equal(doc.acceptedTermsVersion, null);
    assert.equal(doc.acceptedTermsAt, null);
    assert.deepEqual(doc.readAnnouncements, []);

    // Parent-only fields.
    assert.deepEqual(doc.students, []);
    assert.equal(doc.lessonTokens, 0);

    // Audit metadata.
    assert.ok(doc.createdAt instanceof admin.firestore.Timestamp);
    assert.equal(doc.createdAt.toMillis(), doc.updatedAt.toMillis());
    assert.equal(doc.createdBy, "admin-1");
    assert.equal(doc.updatedBy, "admin-1");
  });

  it("respects supplied lessonTokens", () => {
    const doc = buildUserDoc(
      { ...baseParent, lessonTokens: 7 },
      { actorUid: "admin-1", clock: fixedClock }
    );
    assert.equal(doc.lessonTokens, 7);
  });

  it("omits parent-only fields for tutors/admins", () => {
    const doc = buildUserDoc(
      {
        role: "tutor",
        firstName: "T",
        lastName: "U",
        email: "t@u.com",
        phone: "0",
      },
      { actorUid: "admin-1", clock: fixedClock }
    );
    assert.equal(doc.students, undefined);
    assert.equal(doc.lessonTokens, undefined);
  });

  it("requires actorUid", () => {
    assert.throws(() => buildUserDoc(baseParent, {}), TypeError);
  });
});
