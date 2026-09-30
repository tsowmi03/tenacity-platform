"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateCalendar,
  planCalendarSync,
  parseArgs,
  ensureActiveTermAttendance,
} = require("../../scripts/syncStagingTerms");

function term(id, status, start = "2026-07-20T00:00:00.000Z") {
  const termNum = Number(id.at(-1));
  return {
    id, year: id.slice(0, 4), termNum, weeksNum: 10, status,
    startDate: start, endDate: "2026-12-20T00:00:00.000Z",
  };
}

describe("staging term calendar sync", () => {
  it("copies production calendar and retires a staging-only active term", () => {
    const source = [term("2026_T3", "completed"), term("2026_T4", "active")];
    const staging = [term("2026_T2", "active")];
    const changes = planCalendarSync(source, staging);
    assert.deepEqual(changes.map(({ id, term: value }) => [id, value.status]), [
      ["2026_T3", "completed"], ["2026_T4", "active"], ["2026_T2", "inactive"],
    ]);
    assert.equal(changes[1].term.startDate, source[1].startDate);
  });

  it("rejects malformed and conflicting production calendars", () => {
    assert.throws(() => validateCalendar([]), /1–40/);
    assert.throws(() => validateCalendar([term("2026_T3", "active"), term("2026_T4", "active")]), /multiple active/);
    assert.throws(() => validateCalendar([term("2026_T3", "active"), term("2026_T3", "active")]), /Duplicate/);
    assert.throws(() => validateCalendar([term("2026_T5", "active")]), /Invalid term ID/);
    assert.throws(() => validateCalendar([term("2026_T3", "paused")]), /Invalid term calendar/);
  });

  it("only accepts the intended command shape", () => {
    assert.deepEqual(parseArgs(["node", "script", "export", "--out=/tmp/terms.json"]), {
      mode: "export", out: "/tmp/terms.json",
    });
    assert.throws(() => parseArgs(["node", "script", "sync", "--out=/tmp/terms.json"]), /requires/);
  });

  it("creates missing active-term sessions without replacing synthetic attendance", async () => {
    const saved = new Map([["2026_T4_W1", { attendance: ["already-marked"] }]]);
    const db = {
      collection(name) {
        assert.equal(name, "classes");
        return {
          get: async () => ({ size: 1, docs: [{
            id: "class-1",
            data: () => ({ day: "Monday", startTime: "16:00", enrolledStudents: ["student-1"], tutors: ["tutor-1"] }),
          }] }),
          doc: () => ({ collection: () => ({ doc: (id) => ({
            id, get: async () => ({ exists: saved.has(id) }),
          }) }) }),
        };
      },
      batch() {
        const writes = [];
        return {
          set: (ref, doc) => writes.push([ref.id, doc]),
          commit: async () => writes.forEach(([id, doc]) => saved.set(id, doc)),
        };
      },
    };
    const active = { ...term("2026_T4", "active"), weeksNum: 2 };
    assert.equal(await ensureActiveTermAttendance(db, [active]), 1);
    assert.deepEqual(saved.get("2026_T4_W1"), { attendance: ["already-marked"] });
    assert.equal(saved.get("2026_T4_W2").weekNum, 2);
    assert.deepEqual(saved.get("2026_T4_W2").attendance, ["student-1"]);
    assert.equal(await ensureActiveTermAttendance(db, [active]), 0);
  });
});
