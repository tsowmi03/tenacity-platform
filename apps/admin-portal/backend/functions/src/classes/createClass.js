"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { validateCreateClassInput } = require("./classSchemas");
const { buildClassDoc } = require("./classFactory");
const {
  loadTerms,
  planAttendanceWrites,
} = require("./attendanceGeneration");

async function createClassImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createClassImpl requires db");
  if (!actor?.uid) throw new TypeError("createClassImpl requires actor.uid");

  const classRef = payload.id
    ? db.collection("classes").doc(payload.id)
    : db.collection("classes").doc();
  const classId = classRef.id;
  const classDoc = buildClassDoc(payload, { actorUid: actor.uid, clock });
  const terms = payload.generateAttendance
    ? await loadTerms(db, payload.termIds, clock)
    : [];
  const attendancePlan = payload.generateAttendance
    ? await planAttendanceWrites({
        classRef,
        classData: classDoc,
        terms,
        actor,
        clock,
        overwrite: true,
      })
    : { candidates: [], writes: [] };
  const totalWrites = 1 + attendancePlan.writes.length;
  if (totalWrites > 450) {
    throw new HttpsError(
      "resource-exhausted",
      `Class creation would require ${totalWrites} writes; reduce the scope.`
    );
  }

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(classRef);
    if (snap.exists) {
      throw new HttpsError("already-exists", `Class already exists: ${classId}`);
    }
    txn.set(classRef, classDoc);
    attendancePlan.writes.forEach((item) => txn.set(item.ref, item.doc));
  });

  const attendance = {
    considered: attendancePlan.candidates.length,
    written: attendancePlan.writes.length,
    skippedExisting:
      attendancePlan.candidates.length - attendancePlan.writes.length,
    termIds: terms.map((t) => t.id),
  };

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "class.create",
      targetType: "class",
      targetId: classId,
      payloadSummary: {
        type: payload.type,
        day: payload.day,
        startTime: payload.startTime,
        endTime: payload.endTime,
        capacity: payload.capacity,
        tutors: payload.tutors,
        enrolledStudents: payload.enrolledStudents,
        generatedAttendance: attendance.written,
      },
    },
    { logger, clock }
  );

  return { classId, attendance };
}

const adminCreateClass = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateCreateClassInput(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await createClassImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminCreateClass] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  createClassImpl,
  adminCreateClass,
};
