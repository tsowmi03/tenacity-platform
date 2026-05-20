const assert = require("node:assert/strict");
const test = require("node:test");

const {
  futureAttendanceSyncDecision,
} = require("../lib/notifications/shared");

test("future attendance sync skips full attendance docs", () => {
  assert.equal(
    futureAttendanceSyncDecision({
      attendance: ["a", "b", "temporary"],
      capacity: 3,
      studentId: "newStudent",
    }),
    "full",
  );
});

test("future attendance sync adds when capacity remains", () => {
  assert.equal(
    futureAttendanceSyncDecision({
      attendance: ["a", "b"],
      capacity: 3,
      studentId: "newStudent",
    }),
    "add",
  );
});

test("future attendance sync ignores capacity after the two-week one-off window", () => {
  assert.equal(
    futureAttendanceSyncDecision({
      attendance: ["a", "b", "temporary"],
      capacity: 3,
      studentId: "newStudent",
      enforceCapacity: false,
    }),
    "add",
  );
});

test("future attendance sync does not duplicate existing attendance", () => {
  assert.equal(
    futureAttendanceSyncDecision({
      attendance: ["a", "newStudent"],
      capacity: 2,
      studentId: "newStudent",
    }),
    "already_present",
  );
});
