"use strict";

const { HttpsError } = require("firebase-functions/v2/https");
const { ValidationError } = require("./validation");

/**
 * Map ValidationError → HttpsError("invalid-argument") so callable functions
 * surface a stable error shape to the portal client.
 *
 * Any other error is re-thrown unchanged so unexpected failures surface as
 * "internal" via Firebase's default behaviour.
 */
function toHttpsError(err) {
  if (err instanceof HttpsError) return err;
  if (err instanceof ValidationError) {
    return new HttpsError("invalid-argument", err.message, {
      field: err.field,
      issues: err.issues,
    });
  }
  return new HttpsError("internal", err?.message || "internal error");
}

module.exports = { toHttpsError };
