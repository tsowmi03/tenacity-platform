const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canCreateFeedback,
  feedbackNotificationBody,
  shouldSuppressFeedbackCreatedNotification,
} = require("../lib/notifications/feedback_action");

test("feedback creation is limited to admins and tutors", () => {
  assert.equal(canCreateFeedback({ role: "admin" }), true);
  assert.equal(canCreateFeedback({ role: "tutor" }), true);
  assert.equal(canCreateFeedback({ role: "parent" }), false);
  assert.equal(canCreateFeedback({}), false);
});

test("feedback create action suppresses fallback trigger", () => {
  assert.equal(
    shouldSuppressFeedbackCreatedNotification({ type: "create_feedback" }),
    true,
  );
  assert.equal(
    shouldSuppressFeedbackCreatedNotification({ type: "other" }),
    false,
  );
  assert.equal(shouldSuppressFeedbackCreatedNotification(), false);
});

test("feedback notification body preserves existing subject behavior", () => {
  assert.equal(feedbackNotificationBody("Great progress"), "Great progress");
  assert.equal(
    feedbackNotificationBody(""),
    "You have new feedback for your child.",
  );
  assert.equal(
    feedbackNotificationBody(undefined),
    "You have new feedback for your child.",
  );

  const longSubject = "x".repeat(81);
  assert.equal(feedbackNotificationBody(longSubject), `${"x".repeat(77)}...`);
});
