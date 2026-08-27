"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  isValidClientMessageId,
} = require("../../lib/notifications/chat_action");

describe("isValidClientMessageId", () => {
  it("accepts the UUID the app sends", () => {
    assert.equal(
      isValidClientMessageId("550e8400-e29b-41d4-a716-446655440000"),
      true
    );
  });

  it("rejects values Firestore cannot use as a document id", () => {
    // A `/` would silently address a different collection; `.` and `..` are
    // path segments; `__x__` is reserved.
    for (const value of ["", ".", "..", "chats/other", "__proto__", "a".repeat(129)]) {
      assert.equal(isValidClientMessageId(value), false, `expected ${JSON.stringify(value)} to be rejected`);
    }
  });

  it("rejects untrimmed values, so one message cannot be sent under two ids", () => {
    assert.equal(isValidClientMessageId(" abc"), false);
    assert.equal(isValidClientMessageId("abc "), false);
  });

  it("rejects anything that is not a string", () => {
    for (const value of [undefined, null, 5, {}, ["abc"]]) {
      assert.equal(isValidClientMessageId(value), false);
    }
  });
});
