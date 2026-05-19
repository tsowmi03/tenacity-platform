const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isPreferenceEnabled,
} = require("../lib/notifications/preferences");

test("notification preferences default to enabled when settings are missing", () => {
  assert.equal(isPreferenceEnabled(undefined, "spotOpened"), true);
  assert.equal(isPreferenceEnabled(null, "lessonReminder"), true);
});

test("notification preferences respect explicit false values", () => {
  assert.equal(isPreferenceEnabled({ spotOpened: false }, "spotOpened"), false);
  assert.equal(isPreferenceEnabled({ lessonReminder: false }, "lessonReminder"), false);
});

test("notification preferences ignore non-boolean values", () => {
  assert.equal(isPreferenceEnabled({ spotOpened: "false" }, "spotOpened"), true);
  assert.equal(isPreferenceEnabled({ lessonReminder: 0 }, "lessonReminder"), true);
});
