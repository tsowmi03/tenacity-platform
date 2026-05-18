"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const { ValidationError } = require("../../src/shared/validation");
const { validateCreateUserPayload } = require("../../src/users/createUser");

describe("validateCreateUserPayload", () => {
  it("returns { user, students:[] } when no students provided", () => {
    const out = validateCreateUserPayload({
      role: "parent",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "0400",
    });
    assert.equal(out.user.role, "parent");
    assert.deepEqual(out.students, []);
  });

  it("validates and normalises bundled students for parents", () => {
    const out = validateCreateUserPayload({
      role: "parent",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "0400",
      students: [
        { firstName: " Tom ", lastName: " Doe ", grade: "7", subjects: ["Maths"] },
      ],
    });
    assert.equal(out.students.length, 1);
    assert.equal(out.students[0].firstName, "Tom");
    assert.deepEqual(out.students[0].subjects, ["Maths"]);
  });

  it("rejects bundled students for non-parent roles", () => {
    assert.throws(
      () =>
        validateCreateUserPayload({
          role: "tutor",
          firstName: "T",
          lastName: "U",
          email: "t@u.com",
          phone: "0",
          students: [
            { firstName: "Tom", lastName: "Doe", grade: "7" },
          ],
        }),
      (err) => err instanceof HttpsError && err.code === "invalid-argument"
    );
  });

  it("propagates per-student validation failures with index context", () => {
    try {
      validateCreateUserPayload({
        role: "parent",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "0400",
        students: [
          { firstName: "Tom", lastName: "Doe", grade: "7" },
          { firstName: "", lastName: "", grade: "" },
        ],
      });
      assert.fail("should throw");
    } catch (err) {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /students\[1\]/);
    }
  });

  it("rejects invalid base user fields", () => {
    assert.throws(
      () => validateCreateUserPayload({ role: "hacker" }),
      ValidationError
    );
  });
});
