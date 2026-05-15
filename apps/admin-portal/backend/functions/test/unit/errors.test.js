"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { HttpsError } = require("firebase-functions/v2/https");
const { toHttpsError } = require("../../src/shared/errors");
const { ValidationError } = require("../../src/shared/validation");

describe("toHttpsError", () => {
  it("passes HttpsError through unchanged", () => {
    const err = new HttpsError("permission-denied", "no");
    assert.equal(toHttpsError(err), err);
  });

  it("maps ValidationError to invalid-argument with field/issues details", () => {
    const ve = new ValidationError("bad email", {
      field: "email",
      issues: [{ field: "email", message: "bad email" }],
    });
    const out = toHttpsError(ve);
    assert.ok(out instanceof HttpsError);
    assert.equal(out.code, "invalid-argument");
    assert.equal(out.message, "bad email");
    assert.deepEqual(out.details, {
      field: "email",
      issues: [{ field: "email", message: "bad email" }],
    });
  });

  it("maps unknown errors to internal", () => {
    const out = toHttpsError(new Error("boom"));
    assert.ok(out instanceof HttpsError);
    assert.equal(out.code, "internal");
    assert.equal(out.message, "boom");
  });
});
