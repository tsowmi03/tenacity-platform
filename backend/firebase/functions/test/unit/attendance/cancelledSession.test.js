"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { sessionIsCancelled } = require("../../../src/attendance/cancelledSession");

describe("sessionIsCancelled", () => {
  it("is true for a week an admin cancelled", () => {
    assert.equal(sessionIsCancelled({ cancelled: true, attendance: ["s1"] }), true);
  });

  it("is false for a week that is running", () => {
    assert.equal(sessionIsCancelled({ cancelled: false }), false);
  });

  it("treats a document from before the flag existed as running", () => {
    assert.equal(sessionIsCancelled({ attendance: ["s1"] }), false);
  });

  it("does not read a truthy non-boolean as cancelled", () => {
    // Matches the app, which reads the field as a bool and defaults to false.
    assert.equal(sessionIsCancelled({ cancelled: "true" }), false);
  });

  it("is false for a missing document", () => {
    assert.equal(sessionIsCancelled(undefined), false);
    assert.equal(sessionIsCancelled(null), false);
  });
});
