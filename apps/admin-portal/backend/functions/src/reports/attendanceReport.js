"use strict";

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { validateAttendanceReportInput } = require("./reportSchemas");
const { reportRowCount, writeReportAuditLog } = require("./reportAudit");
const { toDate, dayKey, weekKey } = require("./reportUtils");

async function loadClassMap(db) {
  const snap = await db.collection("classes").get();
  const map = new Map();
  snap.docs.forEach((doc) => map.set(doc.id, { id: doc.id, ...doc.data() }));
  return map;
}

async function loadAttendanceDocs(db, { fromDate, toDate, classIds }) {
  const query = db
    .collectionGroup("attendance")
    .where("date", ">=", admin.firestore.Timestamp.fromDate(fromDate))
    .where("date", "<=", admin.firestore.Timestamp.fromDate(toDate));
  const snap = await query.get();
  const docs = snap.docs.map((doc) => {
    const parts = doc.ref.path.split("/");
    return { classId: parts[1], id: doc.id, ...doc.data() };
  });
  if (classIds && classIds.length > 0) {
    return docs.filter((doc) => classIds.includes(doc.classId));
  }
  return docs;
}

function getAttendanceArray(doc) {
  return Array.isArray(doc.attendance) ? doc.attendance : [];
}

function getTutorsArray(doc) {
  return Array.isArray(doc.tutors) ? doc.tutors : [];
}

function makeEmptyGroup(key) {
  return {
    key,
    sessionsScheduled: 0,
    sessionsCancelled: 0,
    sessionsHeld: 0,
    totalStudentAttendances: 0,
    studentsNotPresent: 0,
    oneOffBookings: 0,
    _classInfo: null,
    _distinctClasses: new Set(),
  };
}

function buildAttendanceReport({ classes, attendanceDocs, payload, generatedAt = new Date() }) {
  const { groupBy, includeCancelled, tutorIds, studentIds } = payload;
  let docs = attendanceDocs;

  if (tutorIds && tutorIds.length > 0) {
    docs = docs.filter((doc) =>
      getTutorsArray(doc).some((id) => tutorIds.includes(id))
    );
  }

  if (studentIds && studentIds.length > 0) {
    docs = docs.filter((doc) => {
      const attendance = getAttendanceArray(doc);
      if (attendance.some((id) => studentIds.includes(id))) return true;
      const cls = classes.get(doc.classId);
      const enrolled = cls && Array.isArray(cls.enrolledStudents) ? cls.enrolledStudents : [];
      return enrolled.some((id) => studentIds.includes(id));
    });
  }

  const groups = new Map();
  let totalScheduled = 0;
  let totalCancelled = 0;
  let totalHeld = 0;
  let totalAttendances = 0;
  const allClassIds = new Set();

  docs.forEach((doc) => {
    const isCancelled = Boolean(doc.cancelled);
    const date = toDate(doc.date);
    const cls = classes.get(doc.classId);
    const enrolled = cls && Array.isArray(cls.enrolledStudents) ? cls.enrolledStudents : [];
    const attendance = getAttendanceArray(doc);
    const tutors = getTutorsArray(doc);

    totalScheduled += 1;
    allClassIds.add(doc.classId);
    if (isCancelled) {
      totalCancelled += 1;
    } else {
      totalHeld += 1;
      totalAttendances += attendance.length;
    }

    let keys;
    if (groupBy === "student") {
      if (isCancelled) return;
      keys = attendance.length > 0 ? attendance : [];
    } else if (groupBy === "tutor") {
      keys = tutors.length > 0 ? tutors : ["unknown"];
    } else if (groupBy === "day") {
      keys = date ? [dayKey(date)] : ["unknown"];
    } else if (groupBy === "week") {
      keys = date ? [weekKey(date)] : ["unknown"];
    } else {
      keys = [doc.classId];
    }

    if (keys.length === 0) return;

    keys.forEach((key) => {
      if (!groups.has(key)) groups.set(key, makeEmptyGroup(key));
      const g = groups.get(key);
      g._distinctClasses.add(doc.classId);

      if (groupBy === "student") {
        g.sessionsScheduled += 1;
        g.sessionsHeld += 1;
        g.totalStudentAttendances += 1;
      } else if (groupBy === "tutor") {
        g.sessionsScheduled += 1;
        if (isCancelled) {
          g.sessionsCancelled += 1;
        } else {
          g.sessionsHeld += 1;
        }
      } else {
        g.sessionsScheduled += 1;
        if (isCancelled) {
          g.sessionsCancelled += 1;
        } else {
          g.sessionsHeld += 1;
          g.totalStudentAttendances += attendance.length;
          if (groupBy === "class") {
            g.studentsNotPresent += enrolled.filter((id) => !attendance.includes(id)).length;
            g.oneOffBookings += attendance.filter((id) => !enrolled.includes(id)).length;
            if (!g._classInfo && cls) {
              g._classInfo = {
                classType: cls.type || "",
                day: cls.day || "",
                startTime: cls.startTime || "",
                endTime: cls.endTime || "",
                capacity: typeof cls.capacity === "number" ? cls.capacity : 0,
                permanentEnrolments: enrolled.length,
              };
            }
          }
        }
      }
    });
  });

  const rows = [...groups.values()]
    .map((g) => {
      const row = {
        key: g.key,
        sessionsScheduled: g.sessionsScheduled,
        sessionsCancelled: groupBy !== "student" ? g.sessionsCancelled : undefined,
        sessionsHeld: g.sessionsHeld,
      };
      if (groupBy === "student") {
        delete row.sessionsCancelled;
        row.sessionsAttended = g.sessionsHeld;
        row.distinctClasses = g._distinctClasses.size;
      } else if (groupBy === "tutor") {
        row.distinctClasses = g._distinctClasses.size;
      } else if (groupBy === "class") {
        const info = g._classInfo || {};
        row.classType = info.classType || "";
        row.day = info.day || "";
        row.startTime = info.startTime || "";
        row.endTime = info.endTime || "";
        row.capacity = info.capacity || 0;
        row.permanentEnrolments = info.permanentEnrolments || 0;
        row.totalStudentAttendances = g.totalStudentAttendances;
        row.studentsNotPresent = g.studentsNotPresent;
        row.oneOffBookings = g.oneOffBookings;
        row.averageAttendance =
          g.sessionsHeld === 0
            ? 0
            : Math.round((g.totalStudentAttendances / g.sessionsHeld) * 100) / 100;
        row.utilisationRate =
          info.capacity > 0 && g.sessionsHeld > 0
            ? Math.round((row.averageAttendance / info.capacity) * 1000) / 1000
            : null;
      } else {
        row.totalStudentAttendances = g.totalStudentAttendances;
        row.classCount = g._distinctClasses.size;
      }
      return row;
    })
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  return {
    reportType: "attendance",
    generatedAt: generatedAt.toISOString(),
    filters: {
      fromDate: payload.fromDate.toISOString(),
      toDate: payload.toDate.toISOString(),
      groupBy,
      includeCancelled,
      ...(payload.classIds && payload.classIds.length > 0 && { classIds: payload.classIds }),
      ...(payload.tutorIds && payload.tutorIds.length > 0 && { tutorIds: payload.tutorIds }),
      ...(payload.studentIds && payload.studentIds.length > 0 && { studentIds: payload.studentIds }),
    },
    summary: {
      sessionsScheduled: totalScheduled,
      sessionsCancelled: totalCancelled,
      sessionsHeld: totalHeld,
      totalStudentAttendances: totalAttendances,
      uniqueClassCount: allClassIds.size,
    },
    rows,
  };
}

async function attendanceReportImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("attendanceReportImpl requires db");
  if (!actor?.uid) throw new TypeError("attendanceReportImpl requires actor.uid");

  const generatedAt = clock ? clock() : new Date();
  const [classes, attendanceDocs] = await Promise.all([
    loadClassMap(db),
    loadAttendanceDocs(db, payload),
  ]);
  return buildAttendanceReport({ classes, attendanceDocs, payload, generatedAt });
}

const adminAttendanceReport = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  let payload;
  try {
    payload = validateAttendanceReportInput(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
  try {
    const db = admin.firestore();
    const report = await attendanceReportImpl({
      payload,
      actor,
      deps: { db },
    });
    await writeReportAuditLog(
      db,
      {
        actor,
        action: "report.generate",
        reportType: report.reportType,
        filters: report.filters,
        rowCount: reportRowCount(report),
      },
      { logger }
    );
    return report;
  } catch (err) {
    logger.error("[adminAttendanceReport] failed", {
      errorMessage: err?.message,
      actorUid: actor.uid,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  buildAttendanceReport,
  attendanceReportImpl,
  adminAttendanceReport,
};
