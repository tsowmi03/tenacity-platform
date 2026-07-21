"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { describeResourceFailure } = require("../../src/resources/failure");

describe("describeResourceFailure", () => {
  it("explains a truncated (max_tokens) response with an actionable next step", () => {
    const err = new Error("AI response was truncated at the 24000 token output limit.");
    err.stopReason = "max_tokens";
    const out = describeResourceFailure(err);
    assert.match(out.message, /too large|cut off/i);
    assert.match(out.message, /fewer questions|shorter|split/i);
    assert.equal(out.detail, "AI response was truncated at the 24000 token output limit.");
  });

  it("explains a required-diagram render failure", () => {
    const err = new Error("could not render");
    err.code = "DIAGRAM_RENDER_ERROR";
    err.diagramRequired = true;
    err.diagramLabel = "question 3";
    const out = describeResourceFailure(err);
    assert.match(out.message, /diagram/i);
    assert.match(out.message, /question 3/);
    assert.match(out.message, /retry/i);
  });

  it("treats a rate limit / overloaded AI service as temporary", () => {
    const err = new Error("Overloaded");
    err.status = 529;
    const out = describeResourceFailure(err);
    assert.match(out.message, /busy/i);
    assert.match(out.message, /retry/i);
  });

  it("flags auth/config problems as an administrator issue", () => {
    const err = new Error("invalid x-api-key");
    err.status = 401;
    const out = describeResourceFailure(err);
    assert.match(out.message, /configuration|administrator/i);
  });

  it("explains an unreadable reference file", () => {
    const err = new Error("No such object: resources/uploads/u/x.pdf");
    const out = describeResourceFailure(err);
    assert.match(out.message, /reference file|re-upload/i);
  });

  it("explains malformed JSON output", () => {
    const err = new Error("AI response was not valid JSON. Raw response: <html>");
    const out = describeResourceFailure(err);
    assert.match(out.message, /couldn't read|temporary|retry/i);
  });

  it("explains a schema validation failure", () => {
    const err = new Error("Invalid resource JSON: questions must be an array");
    err.name = "ResourceValidationError";
    const out = describeResourceFailure(err);
    assert.match(out.message, /format/i);
  });

  it("falls back to a clear generic message and keeps the detail", () => {
    const out = describeResourceFailure(new Error("kaboom unexpected"));
    assert.match(out.message, /failed unexpectedly|contact an administrator/i);
    assert.equal(out.detail, "kaboom unexpected");
  });

  it("accepts a bare string error", () => {
    const out = describeResourceFailure("something broke");
    assert.ok(out.message);
    assert.equal(out.detail, "something broke");
  });
});
