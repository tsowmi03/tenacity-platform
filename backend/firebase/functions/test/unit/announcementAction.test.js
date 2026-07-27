"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldSendAnnouncementCreatedNotification,
} = require("../../lib/notifications/announcement_action");

describe("announcement notification action", () => {
  it("does not notify an audience about an archived draft", () => {
    assert.equal(
      shouldSendAnnouncementCreatedNotification({ archived: true }),
      false
    );
  });

  it("notifies for published and legacy announcements", () => {
    assert.equal(
      shouldSendAnnouncementCreatedNotification({ archived: false }),
      true
    );
    assert.equal(shouldSendAnnouncementCreatedNotification({}), true);
  });
});
