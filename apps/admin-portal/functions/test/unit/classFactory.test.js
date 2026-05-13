"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ValidationError } = require("../../src/shared/validation");
const {
  validateCreateClassInput,
  validateUpdateClassInput,
} = require("../../src/classes/classSchemas");
const { buildClassDoc } = require("../../src/classes/classFactory");
const {
  makeAttendanceDocId,
  buildAttendanceDoc,
} = require("../../src/classes/attendanceFactory");

const clock = () => new Date("2026-05-13T00:00:00Z");

describe("validateCreateClassInput", () => {
  const valid = {
    type: "Year 7 English",
    day: "Monday",
    startTime: "16:00",
    endTime: "17:00",
    capacity: 8,
  };

  it("accepts a valid class", () => {
    const out = validateCreateClassInput(valid);
    assert.equal(out.type, "Year 7 English");
    assert.deepEqual(out.tutors, []);
    assert.deepEqual(out.enrolledStudents, []);
  });

  it("rejects endTime <= startTime", () => {
    assert.throws(
      () => validateCreateClassInput({ ...valid, endTime: "16:00" }),
      /endTime must be after/
    );
  });

  it("rejects non-integer capacity", () => {
    assert.throws(
      () => validateCreateClassInput({ ...valid, capacity: 1.5 }),
      ValidationError
    );
  });

  it("rejects lowercase day", () => {
    assert.throws(
      () => validateCreateClassInput({ ...valid, day: "monday" }),
      ValidationError
    );
  });
});

describe("validateUpdateClassInput", () => {
  it("returns only provided fields", () => {
    const out = validateUpdateClassInput({ capacity: 10 });
    assert.deepEqual(out, { capacity: 10 });
  });
});

describe("buildClassDoc", () => {
  it("uses Firestore field name `day` and writes meta", () => {
    const doc = buildClassDoc(
      {
        type: "Year 7 English",
        day: "Monday",
        startTime: "16:00",
        endTime: "17:00",
        capacity: 8,
        tutors: ["t1"],
        enrolledStudents: ["s1"],
      },
      { actorUid: "admin-1", clock }
    );
    assert.equal(doc.day, "Monday");
    assert.equal(doc.startTime, "16:00");
    assert.equal(doc.endTime, "17:00");
    assert.equal(doc.capacity, 8);
    assert.deepEqual(doc.tutors, ["t1"]);
    assert.deepEqual(doc.enrolledStudents, ["s1"]);
    assert.equal(doc.createdBy, "admin-1");
    assert.equal(doc.createdAt.toMillis(), doc.updatedAt.toMillis());
  });
});

describe("makeAttendanceDocId", () => {
  it("formats {termId}_W{weekNum}", () => {
    assert.equal(makeAttendanceDocId("2026_T2", 3), "2026_T2_W3");
  });
  it("rejects invalid termId / weekNum", () => {
    assert.throws(() => makeAttendanceDocId("", 3), ValidationError);
    assert.throws(() => makeAttendanceDocId("2026_T2", 0), ValidationError);
    assert.throws(() => makeAttendanceDocId("2026_T2", 1.5), ValidationError);
  });
});

describe("buildAttendanceDoc", () => {
  it("seeds attendance from enrolledStudents and writes weekNum (not weekNumber)", () => {
    const sessionStart = new Date("2026-07-13T06:00:00Z"); // class startTime applied
    const doc = buildAttendanceDoc(
      {
        date: sessionStart,
        termId: "2026_T2",
        weekNum: 3,
        enrolledStudents: ["s1", "s2"],
        tutors: ["t1"],
      },
      { actorUid: "admin-1", clock }
    );
    assert.equal(doc.weekNum, 3);
    assert.equal("weekNumber" in doc, false);
    assert.equal(doc.cancelled, false);
    assert.equal(doc.termId, "2026_T2");
    assert.equal(doc.date.toDate().toISOString(), sessionStart.toISOString());
    assert.deepEqual(doc.attendance, ["s1", "s2"]);
    assert.deepEqual(doc.tutors, ["t1"]);
    assert.equal(doc.updatedBy, "admin-1");
  });

  it("copies arrays defensively", () => {
    const enrolled = ["s1"];
    const doc = buildAttendanceDoc(
      {
        date: new Date(),
        termId: "2026_T2",
        weekNum: 1,
        enrolledStudents: enrolled,
        tutors: [],
      },
      { actorUid: "admin-1", clock }
    );
    enrolled.push("s2");
    assert.deepEqual(doc.attendance, ["s1"]);
  });

  it("requires a Date for `date`", () => {
    assert.throws(
      () =>
        buildAttendanceDoc(
          { date: "2026-07-13", termId: "2026_T2", weekNum: 1 },
          { actorUid: "admin-1", clock }
        ),
      TypeError
    );
  });
});
