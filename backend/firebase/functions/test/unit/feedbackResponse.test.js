"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  feedbackResponseNotificationBody,
  responsesToNotify,
} = require("../../lib/notifications/feedback_action");

// MOB-52: which parent responses notify the tutor who wrote the note.
describe("feedback response notifications", () => {
  const question = {
    type: "question",
    text: "  Fractions at home?  ",
    parentName: "Pat Lee",
  };

  it("notifies for a new question or comment", () => {
    assert.deepEqual(
      responsesToNotify(
        { parentResponses: {} },
        {
          parentResponses: {
            p1: question,
            p2: { type: "comment", text: "Loved it", parentName: "Quinn" },
          },
        }
      ),
      [
        { parentId: "p1", type: "question", text: "Fractions at home?", parentName: "Pat Lee" },
        { parentId: "p2", type: "comment", text: "Loved it", parentName: "Quinn" },
      ]
    );
  });

  it("stays quiet for a thanks", () => {
    assert.deepEqual(
      responsesToNotify({}, { parentResponses: { p1: { type: "thanks", text: "" } } }),
      []
    );
  });

  it("does not re-notify for a response that was already there", () => {
    assert.deepEqual(
      responsesToNotify(
        { parentResponses: { p1: question }, isUnread: true },
        { parentResponses: { p1: question }, isUnread: false }
      ),
      []
    );
  });

  it("ignores updates that carry no responses", () => {
    assert.deepEqual(responsesToNotify({ isUnread: true }, { isUnread: false }), []);
    assert.deepEqual(responsesToNotify(undefined, undefined), []);
  });

  it("falls back to a generic name", () => {
    const [response] = responsesToNotify(
      {},
      { parentResponses: { p1: { type: "comment", text: "Hi", parentName: " " } } }
    );
    assert.equal(response.parentName, "A parent");
  });

  it("shortens a long message for the push body", () => {
    const body = feedbackResponseNotificationBody("x".repeat(120));
    assert.equal(body.length, 80);
    assert.ok(body.endsWith("..."));
  });
});
