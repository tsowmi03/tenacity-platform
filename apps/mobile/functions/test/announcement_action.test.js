const assert = require("node:assert/strict");
const test = require("node:test");

const {
  announcementNotificationBody,
  canCreateAnnouncement,
  normalizeAnnouncementAudience,
  shouldSuppressAnnouncementCreatedNotification,
} = require("../lib/notifications/announcement_action");

test("announcement audience normalizes supported audiences", () => {
  assert.equal(normalizeAnnouncementAudience("all"), "all");
  assert.equal(normalizeAnnouncementAudience(" Admin "), "admin");
  assert.equal(normalizeAnnouncementAudience("tutor"), "tutor");
  assert.equal(normalizeAnnouncementAudience("parent"), "parent");
});

test("announcement audience rejects unsupported audiences", () => {
  assert.throws(
    () => normalizeAnnouncementAudience("students"),
    /Invalid announcement audience/,
  );
  assert.throws(
    () => normalizeAnnouncementAudience(null),
    /Invalid announcement audience/,
  );
});

test("only admins can create announcements", () => {
  assert.equal(canCreateAnnouncement({ role: "admin" }), true);
  assert.equal(canCreateAnnouncement({ role: "tutor" }), false);
  assert.equal(canCreateAnnouncement({ role: "parent" }), false);
});

test("announcement create action suppresses fallback trigger", () => {
  assert.equal(
    shouldSuppressAnnouncementCreatedNotification({ type: "create_announcement" }),
    true,
  );
  assert.equal(
    shouldSuppressAnnouncementCreatedNotification({ type: "other" }),
    false,
  );
  assert.equal(shouldSuppressAnnouncementCreatedNotification(), false);
});

test("announcement notification body preserves existing fallback copy", () => {
  assert.equal(announcementNotificationBody("Schedule update"), "Schedule update");
  assert.equal(
    announcementNotificationBody(""),
    "A new announcement has been posted",
  );
  assert.equal(
    announcementNotificationBody(undefined),
    "A new announcement has been posted",
  );
});
