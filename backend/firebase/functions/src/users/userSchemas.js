"use strict";

const {
  assertString,
  assertOptionalString,
  assertEmail,
  assertEnum,
  assertNumber,
  validateShape,
} = require("../shared/validation");

const USER_ROLES = ["admin", "tutor", "parent"];

/**
 * How an account behaves in the live app.
 *
 *   standard  a real person: visible to everyone who may see their role,
 *             and able to do everything that role allows.
 *   internal  an account we run ourselves to smoke-test production. Hidden
 *             from contact lists so no parent can message it, and refused
 *             writes on the collections that represent real business activity.
 *
 * Absent is treated as `standard` everywhere, so documents written before this
 * existed behave exactly as they did.
 */
const USER_VISIBILITIES = ["standard", "internal"];
const DEFAULT_VISIBILITY = "standard";

/**
 * Validates `adminCreateUser` input. Does NOT produce the Firestore document
 * — pair with `buildUserDoc()` for that. Two-step so the schema can be reused
 * for client-side form validation later.
 */
function validateCreateUserInput(input) {
  const base = validateShape(input, {
    role: (v) => assertEnum(v, "role", USER_ROLES),
    firstName: (v) => assertString(v, "firstName", { max: 80 }),
    lastName: (v) => assertString(v, "lastName", { max: 80 }),
    email: (v) => assertEmail(v),
    phone: (v) => assertString(v, "phone", { max: 40 }),
    temporaryPassword: (v) =>
      assertOptionalString(v, "temporaryPassword", { min: 8, max: 200 }),
    sendWelcomeEmail: (v) =>
      v === undefined ? undefined : Boolean(v),
    lessonTokens: (v) =>
      v === undefined ? undefined : assertNumber(v, "lessonTokens", { min: 0 }),
    visibility: (v) =>
      v === undefined ? undefined : assertEnum(v, "visibility", USER_VISIBILITIES),
  });

  // Parent-only fields aren't allowed on tutor/admin.
  if (base.role !== "parent" && base.lessonTokens !== undefined) {
    const e = new Error("lessonTokens is only valid for parent users");
    e.code = "invalid-argument";
    e.field = "lessonTokens";
    throw e;
  }
  return base;
}

function validateUpdateUserInput(input) {
  return validateShape(input, {
    firstName: (v) =>
      assertOptionalString(v, "firstName", { max: 80 }),
    lastName: (v) =>
      assertOptionalString(v, "lastName", { max: 80 }),
    phone: (v) => assertOptionalString(v, "phone", { max: 40 }),
    lessonTokens: (v) =>
      v === undefined ? undefined : assertNumber(v, "lessonTokens", { min: 0 }),
    visibility: (v) =>
      v === undefined ? undefined : assertEnum(v, "visibility", USER_VISIBILITIES),
  });
}

/** Absent means standard — see USER_VISIBILITIES. */
function isInternalAccount(userData) {
  return (userData || {}).visibility === "internal";
}

module.exports = {
  DEFAULT_VISIBILITY,
  USER_ROLES,
  USER_VISIBILITIES,
  isInternalAccount,
  validateCreateUserInput,
  validateUpdateUserInput,
};
