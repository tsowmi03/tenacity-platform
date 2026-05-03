const assert = require("node:assert/strict");
const test = require("node:test");

const {
  permanentSpotOpenedMessage,
  permanentSpotStudentIdsForNotification,
} = require("../lib/notifications/permanent_spot_action");

test("permanent spot notification detects removed students", () => {
  assert.deepEqual(
    permanentSpotStudentIdsForNotification(["a", "b"], ["b"]),
    ["a"],
  );
});

test("permanent spot notification suppresses direct unenrolment action", () => {
  assert.deepEqual(
    permanentSpotStudentIdsForNotification(["a", "b"], ["b"], {
      type: "direct_permanent_unenrollment",
      studentId: "a",
    }),
    [],
  );
});

test("permanent spot notification still fires for unrelated removals", () => {
  assert.deepEqual(
    permanentSpotStudentIdsForNotification(["a", "b", "c"], ["c"], {
      type: "direct_permanent_unenrollment",
      studentId: "a",
    }),
    ["b"],
  );
});

test("permanent spot message uses class day and formatted time", () => {
  const message = permanentSpotOpenedMessage({
    day: "Monday",
    startTime: "15:30",
  }, time => `formatted ${time}`);

  assert.equal(message.title, "Permanent Spot Opened!");
  assert.equal(message.body, "A permanent spot opened for Monday at formatted 15:30.");
});
