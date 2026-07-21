"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { DateTime } = require("luxon");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { className, writeAuditLog } = require("../shared/auditLog");
const { now } = require("../shared/timestamps");
const {
  assertArray,
  assertBoolean,
  assertString,
  validateShape,
} = require("../shared/validation");
const { normaliseTermDoc } = require("../terms/termSchemas");
const {
  buildAttendanceDoc,
  makeAttendanceDocId,
} = require("./attendanceFactory");

const SYDNEY_ZONE = "Australia/Sydney";
const DAY_INDEX = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

function parseDateInput(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new HttpsError("invalid-argument", `${field} must be a Date or ISO date string`);
}

function validateGenerateAttendanceForClassPayload(input) {
  return validateShape(input || {}, {
    classId: (v) => assertString(v, "classId", { max: 120 }),
    termIds: (v) =>
      v === undefined
        ? []
        : assertArray(v, "termIds", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    overwrite: (v) => (v === undefined ? false : assertBoolean(v, "overwrite")),
    fromDate: (v) => parseDateInput(v, "fromDate"),
  });
}

function validateRegenerateAttendanceForTermPayload(input) {
  return validateShape(input || {}, {
    termId: (v) => assertString(v, "termId", { max: 80 }),
    classIds: (v) =>
      v === undefined
        ? []
        : assertArray(v, "classIds", {
            itemAssert: (item, f) => assertString(item, f, { max: 120 }),
            unique: true,
          }),
    fromDate: (v) => parseDateInput(v, "fromDate"),
    overwrite: (v) => (v === undefined ? true : assertBoolean(v, "overwrite")),
  });
}

function validateAttendancePropagationPayload(input) {
  return validateShape(input || {}, {
    propagateAttendance: (v) =>
      v === undefined ? true : assertBoolean(v, "propagateAttendance"),
    attendanceFromDate: (v) => parseDateInput(v, "attendanceFromDate"),
  });
}

function validateClassDeletePayload(input) {
  return validateShape(input || {}, {
    classId: (v) => assertString(v, "classId", { max: 120 }),
    confirmClassId: (v) => assertString(v, "confirmClassId", { max: 120 }),
    deleteAttendance: (v) => assertBoolean(v, "deleteAttendance"),
  });
}

function startOfSydneyDay(date) {
  return DateTime.fromJSDate(date, { zone: SYDNEY_ZONE }).startOf("day");
}

function sessionDateForWeek(term, weekNum, classData) {
  const dayOffset = DAY_INDEX[classData.day];
  if (dayOffset === undefined) {
    throw new HttpsError("failed-precondition", `Invalid class day: ${classData.day}`);
  }
  const [hour, minute] = String(classData.startTime || "")
    .split(":")
    .map((n) => Number(n));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new HttpsError(
      "failed-precondition",
      `Invalid class startTime: ${classData.startTime}`
    );
  }

  const dt = startOfSydneyDay(term.startDate)
    .plus({ days: (weekNum - 1) * 7 + dayOffset })
    .set({ hour, minute, second: 0, millisecond: 0 });
  return dt.toJSDate();
}

async function loadTerms(db, termIds, clock) {
  const requested = Array.isArray(termIds) ? termIds : [];
  const snaps = requested.length
    ? await Promise.all(requested.map((id) => db.collection("terms").doc(id).get()))
    : (await db.collection("terms").get()).docs;

  const terms = snaps.map((snap) => {
    if (!snap.exists) {
      throw new HttpsError("not-found", `Term not found: ${snap.id}`);
    }
    return normaliseTermDoc(snap.data() || {}, snap.id);
  });

  if (requested.length) return terms;

  const cutoff = now(clock).toDate();
  return terms.filter((term) => term.active || term.endDate >= cutoff);
}

async function loadClasses(db, classIds) {
  const requested = Array.isArray(classIds) ? classIds : [];
  const snaps = requested.length
    ? await Promise.all(requested.map((id) => db.collection("classes").doc(id).get()))
    : (await db.collection("classes").get()).docs;

  return snaps.map((snap) => {
    if (!snap.exists) {
      throw new HttpsError("not-found", `Class not found: ${snap.id}`);
    }
    return { id: snap.id, ref: snap.ref, data: snap.data() || {} };
  });
}

async function generateAttendanceForClass({
  db,
  classId,
  classData,
  terms,
  actor,
  clock,
  overwrite = false,
  fromDate,
}) {
  const classRef = db.collection("classes").doc(classId);
  const { candidates, writes } = await planAttendanceWrites({
    classRef,
    classData,
    terms,
    actor,
    clock,
    overwrite,
    fromDate,
  });

  if (writes.length) {
    const batch = db.batch();
    writes.forEach((item) => batch.set(item.ref, item.doc));
    await batch.commit();
  }

  return {
    considered: candidates.length,
    written: writes.length,
    skippedExisting: candidates.length - writes.length,
  };
}

async function planAttendanceWrites({
  classRef,
  classData,
  terms,
  actor,
  clock,
  overwrite = false,
  fromDate,
}) {
  const candidates = [];

  terms.forEach((term) => {
    for (let weekNum = 1; weekNum <= term.weeksNum; weekNum += 1) {
      const date = sessionDateForWeek(term, weekNum, classData);
      if (fromDate && date < fromDate) continue;
      const attendanceId = makeAttendanceDocId(term.id, weekNum);
      candidates.push({
        ref: classRef.collection("attendance").doc(attendanceId),
        attendanceId,
        term,
        weekNum,
        date,
      });
    }
  });

  const snaps = await Promise.all(candidates.map((c) => c.ref.get()));
  const writes = candidates.filter((c, i) => overwrite || !snaps[i].exists);
  if (writes.length > 450) {
    throw new HttpsError(
      "resource-exhausted",
      `Attendance generation would require ${writes.length} writes; reduce the scope.`
    );
  }

  return {
    candidates,
    writes: writes.map((item) => ({
      ...item,
      doc: buildAttendanceDoc(
        {
          date: item.date,
          termId: item.term.id,
          weekNum: item.weekNum,
          enrolledStudents: classData.enrolledStudents || [],
          tutors: classData.tutors || [],
        },
        { actorUid: actor.uid, clock }
      ),
    })),
  };
}

async function generateAttendanceForClassImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("generateAttendanceForClassImpl requires db");
  if (!actor?.uid) {
    throw new TypeError("generateAttendanceForClassImpl requires actor.uid");
  }

  const classSnap = await db.collection("classes").doc(payload.classId).get();
  if (!classSnap.exists) {
    throw new HttpsError("not-found", `Class not found: ${payload.classId}`);
  }

  const terms = await loadTerms(db, payload.termIds, clock);
  const result = await generateAttendanceForClass({
    db,
    classId: payload.classId,
    classData: classSnap.data() || {},
    terms,
    actor,
    clock,
    overwrite: payload.overwrite,
    fromDate: payload.fromDate,
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "class.attendance.generate",
      targetType: "class",
      targetId: payload.classId,
      targetName: className(classSnap.data() || {}, payload.classId),
      payloadSummary: {
        termIds: terms.map((t) => t.id),
        overwrite: payload.overwrite,
        ...result,
      },
    },
    { logger, clock }
  );

  return { classId: payload.classId, termIds: terms.map((t) => t.id), ...result };
}

async function regenerateAttendanceForTermImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("regenerateAttendanceForTermImpl requires db");
  if (!actor?.uid) {
    throw new TypeError("regenerateAttendanceForTermImpl requires actor.uid");
  }

  const terms = await loadTerms(db, [payload.termId], clock);
  const classes = await loadClasses(db, payload.classIds);
  let considered = 0;
  let written = 0;
  let skippedExisting = 0;

  for (const cls of classes) {
    const result = await generateAttendanceForClass({
      db,
      classId: cls.id,
      classData: cls.data,
      terms,
      actor,
      clock,
      overwrite: payload.overwrite,
      fromDate: payload.fromDate || now(clock).toDate(),
    });
    considered += result.considered;
    written += result.written;
    skippedExisting += result.skippedExisting;
  }

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "term.attendance.regenerate",
      targetType: "term",
      targetId: payload.termId,
      targetName: payload.termId,
      payloadSummary: {
        classIds: classes.map((c) => c.id),
        overwrite: payload.overwrite,
        considered,
        written,
        skippedExisting,
      },
    },
    { logger, clock }
  );

  return {
    termId: payload.termId,
    classIds: classes.map((c) => c.id),
    considered,
    written,
    skippedExisting,
  };
}

async function updateFutureAttendanceForClass({
  db,
  classId,
  classData,
  actor,
  clock,
  fromDate,
  updateDates,
  updateTutors,
  updateStudents,
}) {
  const writes = await planFutureAttendanceUpdates({
    db,
    classId,
    classData,
    actor,
    clock,
    fromDate,
    updateDates,
    updateTutors,
    updateStudents,
  });

  if (writes.length) {
    const batch = db.batch();
    writes.forEach(({ ref, patch }) => batch.update(ref, patch));
    await batch.commit();
  }
  return { futureAttendanceUpdated: writes.length };
}

async function planFutureAttendanceUpdates({
  db,
  classId,
  classData,
  actor,
  clock,
  fromDate,
  updateDates,
  updateTutors,
  updateStudents,
}) {
  const cutoff = fromDate || now(clock).toDate();
  const snap = await db
    .collection("classes")
    .doc(classId)
    .collection("attendance")
    .where("date", ">=", admin.firestore.Timestamp.fromDate(cutoff))
    .get();

  let termById = new Map();
  if (updateDates) {
    const termIds = [
      ...new Set(
        snap.docs
          .map((doc) => (doc.data() || {}).termId || doc.id.split("_W")[0])
          .filter(Boolean)
      ),
    ];
    const terms = await loadTerms(db, termIds, clock);
    termById = new Map(terms.map((term) => [term.id, term]));
  }

  const writes = [];
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const patch = {
      updatedAt: now(clock),
      updatedBy: actor.uid,
    };
    if (updateDates) {
      const termId = data.termId || doc.id.split("_W")[0];
      const weekNum = data.weekNum;
      const term = termById.get(termId);
      if (!term || !Number.isInteger(weekNum)) {
        throw new HttpsError(
          "failed-precondition",
          `Cannot update attendance date for ${doc.id}: missing termId or weekNum`
        );
      }
      patch.date = admin.firestore.Timestamp.fromDate(
        sessionDateForWeek(term, weekNum, classData)
      );
    }
    if (updateTutors) patch.tutors = [...(classData.tutors || [])];
    if (updateStudents) patch.attendance = [...(classData.enrolledStudents || [])];
    writes.push({ ref: doc.ref, patch });
  });

  if (writes.length > 450) {
    throw new HttpsError(
      "resource-exhausted",
      `Attendance propagation would require ${writes.length} writes; reduce the scope.`
    );
  }
  return writes;
}

async function deleteAttendanceSubcollection(classRef) {
  const snap = await classRef.collection("attendance").get();
  if (snap.size > 450) {
    throw new HttpsError(
      "resource-exhausted",
      `Class has ${snap.size} attendance docs; delete in a narrower maintenance flow.`
    );
  }
  if (snap.empty) return 0;
  const batch = classRef.firestore.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

const adminGenerateAttendanceForClass = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateGenerateAttendanceForClassPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await generateAttendanceForClassImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminGenerateAttendanceForClass] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

const adminRegenerateAttendanceForTerm = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateRegenerateAttendanceForTermPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await regenerateAttendanceForTermImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminRegenerateAttendanceForTerm] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  SYDNEY_ZONE,
  sessionDateForWeek,
  validateGenerateAttendanceForClassPayload,
  validateRegenerateAttendanceForTermPayload,
  validateAttendancePropagationPayload,
  validateClassDeletePayload,
  loadTerms,
  loadClasses,
  generateAttendanceForClass,
  planAttendanceWrites,
  generateAttendanceForClassImpl,
  regenerateAttendanceForTermImpl,
  planFutureAttendanceUpdates,
  updateFutureAttendanceForClass,
  deleteAttendanceSubcollection,
  adminGenerateAttendanceForClass,
  adminRegenerateAttendanceForTerm,
};
