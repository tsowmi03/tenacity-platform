"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  attendanceAddedStudentIdsForNotification,
  attendanceRemovedStudentIdsForNotification,
} = require("../../lib/notifications/attendance_action");

describe("attendance notification action", () => {
  it("flags an added student with no notificationAction as a real change", () => {
    assert.deepEqual(
      attendanceAddedStudentIdsForNotification(["a"], ["a", "b"], undefined),
      ["b"]
    );
  });

  it("flags a removed student with no notificationAction as a real change", () => {
    assert.deepEqual(
      attendanceRemovedStudentIdsForNotification(["a", "b"], ["a"], undefined),
      ["b"]
    );
  });

  it("suppresses a bulk_attendance_sync write for the named student (single studentId)", () => {
    assert.deepEqual(
      attendanceAddedStudentIdsForNotification(["a"], ["a", "b"], {
        type: "bulk_attendance_sync",
        studentId: "b",
      }),
      []
    );
    assert.deepEqual(
      attendanceRemovedStudentIdsForNotification(["a", "b"], ["a"], {
        type: "bulk_attendance_sync",
        studentId: "b",
      }),
      []
    );
  });

  it("does not suppress an unrelated student's change on the same bulk_attendance_sync write", () => {
    // Guards against a swap/promotion loop accidentally suppressing a
    // different, genuinely unguarded change that lands on the same doc.
    assert.deepEqual(
      attendanceAddedStudentIdsForNotification(["a"], ["a", "b", "c"], {
        type: "bulk_attendance_sync",
        studentId: "b",
      }),
      ["c"]
    );
  });

  it("suppresses every listed student when notificationAction carries studentIds", () => {
    assert.deepEqual(
      attendanceAddedStudentIdsForNotification(["a"], ["a", "b", "c"], {
        type: "bulk_attendance_sync",
        studentIds: ["b", "c"],
      }),
      []
    );
  });

  it("suppresses the whole diff when notificationAction carries suppressAll", () => {
    // The admin-portal roster overwrite (attendanceGeneration.js) rewrites
    // the whole attendance[] array without knowing which students were
    // already on each future doc, so it can't name individual studentIds.
    assert.deepEqual(
      attendanceAddedStudentIdsForNotification(["a"], ["a", "b", "c"], {
        type: "bulk_attendance_sync",
        suppressAll: true,
      }),
      []
    );
    assert.deepEqual(
      attendanceRemovedStudentIdsForNotification(["a", "b", "c"], ["a"], {
        type: "bulk_attendance_sync",
        suppressAll: true,
      }),
      []
    );
  });

  it("does not let a bulk_attendance_sync action suppress the opposite direction of change", () => {
    // A student added via bulk sync shouldn't accidentally suppress some
    // other student being removed by an unrelated, unguarded write on the
    // same document.
    assert.deepEqual(
      attendanceRemovedStudentIdsForNotification(["a", "b"], ["b"], {
        type: "bulk_attendance_sync",
        studentId: "b",
      }),
      ["a"]
    );
  });

  it("still honours the existing single-write guard types", () => {
    assert.deepEqual(
      attendanceAddedStudentIdsForNotification(["a"], ["a", "b"], {
        type: "one_off_enrollment",
        studentId: "b",
      }),
      []
    );
    assert.deepEqual(
      attendanceRemovedStudentIdsForNotification(["a", "b"], ["a"], {
        type: "notify_absence",
        studentId: "b",
      }),
      []
    );
  });
});
