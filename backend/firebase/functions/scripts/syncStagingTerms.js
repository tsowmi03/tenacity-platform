"use strict";

// Copies only the production term calendar into the staging project. Run by
// the scheduled workflow with separate read and write identities.
const fs = require("node:fs");
// Firebase Admin v12 rejects GitHub's external_account credential file before
// Firestore can use it. The Firestore client uses Google Auth directly and
// supports the keyless workload identity credential supplied by the workflow.
const { Firestore, Timestamp, FieldValue } = require("@google-cloud/firestore");
const { generateAttendanceForClass } = require("../src/classes/attendanceGeneration");

const PRODUCTION = "tenacity-tutoring-b8eb2";
const STAGING = "tenacity-tutoring-staging";
const MAX_TERMS = 40;
const STATUSES = new Set(["active", "upcoming", "completed", "inactive"]);

function calendarTerm(id, data) {
  if (!/^\d{4}_T[1-4]$/.test(id)) throw new Error(`Invalid term ID: ${id}`);
  const year = String(data.year);
  const termNum = Number(data.termNum);
  const weeksNum = Number(data.weeksNum);
  const startDate = data.startDate?.toDate?.() || new Date(data.startDate);
  const endDate = data.endDate?.toDate?.() || new Date(data.endDate);
  if (id !== `${year}_T${termNum}` || !Number.isInteger(weeksNum) || weeksNum < 1 || weeksNum > 20 ||
      !STATUSES.has(data.status) || !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) || startDate >= endDate) {
    throw new Error(`Invalid term calendar data: ${id}`);
  }
  return {
    id, year, termNum, weeksNum, status: data.status,
    startDate: startDate.toISOString(), endDate: endDate.toISOString(),
  };
}

function validateCalendar(terms, { allowEmpty = false } = {}) {
  if (!Array.isArray(terms) || (!allowEmpty && terms.length === 0) || terms.length > MAX_TERMS) {
    throw new Error("Expected 1–40 terms");
  }
  const ids = new Set();
  let active = 0;
  const normalised = terms.map((term) => {
    const out = calendarTerm(term.id, term);
    if (ids.has(out.id)) throw new Error(`Duplicate term: ${out.id}`);
    ids.add(out.id);
    if (out.status === "active") active += 1;
    return out;
  });
  if (active > 1) throw new Error("Production has multiple active terms");
  return normalised.sort((a, b) => a.id.localeCompare(b.id));
}

function planCalendarSync(source, staging) {
  const wanted = validateCalendar(source);
  const existing = validateCalendar(staging, { allowEmpty: true });
  const wantedIds = new Set(wanted.map((term) => term.id));
  const changes = wanted.map((term) => ({ id: term.id, term }));
  // A staging-only active term must not remain active after the sync.
  for (const term of existing) {
    if (term.status === "active" && !wantedIds.has(term.id)) {
      changes.push({ id: term.id, term: { ...term, status: "inactive" } });
    }
  }
  return changes;
}

function parseArgs(argv) {
  const [mode, ...rest] = argv.slice(2);
  if (!["export", "sync"].includes(mode)) throw new Error("Use export or sync");
  const options = Object.fromEntries(rest.map((arg) => {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Invalid argument: ${arg}`);
    return [match[1], match[2]];
  }));
  const keys = Object.keys(options);
  if (keys.some((key) => !["out", "source"].includes(key)) ||
      (mode === "export" && (keys.length !== 1 || !options.out)) ||
      (mode === "sync" && (keys.length !== 1 || !options.source))) {
    throw new Error("export requires --out=FILE; sync requires --source=FILE");
  }
  return { mode, ...options };
}

async function ensureActiveTermAttendance(db, calendar) {
  const active = calendar.find((term) => term.status === "active");
  if (!active) return 0;
  const classes = await db.collection("classes").get();
  if (classes.size > 100) throw new Error("More than 100 staging classes; review attendance generation manually");
  let written = 0;
  for (const klass of classes.docs) {
    const result = await generateAttendanceForClass({
      db, classId: klass.id, classData: klass.data(),
      terms: [{ ...active, startDate: new Date(active.startDate), endDate: new Date(active.endDate) }],
      actor: { uid: "staging-term-calendar-sync" }, overwrite: false,
    });
    written += result.written;
  }
  return written;
}

async function main() {
  const args = parseArgs(process.argv);
  const expectedProject = args.mode === "export" ? PRODUCTION : STAGING;
  // Explicit target and ADC project checks prevent a staging credential from
  // accidentally writing to production, even if workflow variables drift.
  if (process.env.GOOGLE_CLOUD_PROJECT !== expectedProject ||
      process.env.GCLOUD_PROJECT !== expectedProject) {
    throw new Error(`Both project environment variables must be ${expectedProject}`);
  }
  const db = new Firestore({ projectId: expectedProject });
  const snapshot = await db.collection("terms").get();
  const live = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  if (args.mode === "export") {
    const calendar = validateCalendar(live);
    fs.writeFileSync(args.out, JSON.stringify({ projectId: PRODUCTION, calendar }, null, 2));
    console.log(`Exported ${calendar.length} production term calendars`);
    return;
  }
  const source = JSON.parse(fs.readFileSync(args.source, "utf8"));
  if (source.projectId !== PRODUCTION) throw new Error("Source is not production");
  const changes = planCalendarSync(source.calendar, live);
  const existingById = new Map(live.map((term) => [term.id, term]));
  const pending = changes.filter(({ id, term }) => {
    const old = existingById.get(id);
    return !old || ["year", "termNum", "weeksNum", "status", "startDate", "endDate"].some((field) => {
      const before = field.endsWith("Date") ? old[field]?.toDate?.()?.toISOString() : old[field];
      return before !== term[field];
    });
  });
  console.log(JSON.stringify({ target: STAGING, changes: pending.map(({ id, term }) => ({ id, status: term.status })) }));
  if (pending.length) {
    const batch = db.batch();
    for (const { id, term } of pending) {
      batch.set(db.collection("terms").doc(id), {
        year: term.year, termNum: term.termNum, weeksNum: term.weeksNum,
        status: term.status,
        startDate: Timestamp.fromDate(new Date(term.startDate)),
        endDate: Timestamp.fromDate(new Date(term.endDate)),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "staging-term-calendar-sync",
      }, { merge: true });
    }
    await batch.commit();
  }
  const after = await db.collection("terms").get();
  const afterById = new Map(after.docs.map((doc) => [doc.id, doc.data()]));
  for (const { id, term } of changes) {
    const actual = calendarTerm(id, afterById.get(id));
    if (JSON.stringify(actual) !== JSON.stringify(term)) {
      throw new Error(`Verification failed for ${id}`);
    }
  }
  const attendanceWritten = await ensureActiveTermAttendance(db, changes.map(({ term }) => term));
  console.log(`Verified ${changes.length} staging terms; created ${attendanceWritten} missing attendance sessions`);
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { calendarTerm, validateCalendar, planCalendarSync, parseArgs, ensureActiveTermAttendance };
