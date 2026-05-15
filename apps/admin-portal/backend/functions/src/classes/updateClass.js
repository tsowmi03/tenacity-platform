"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { updatedMeta } = require("../shared/timestamps");
const { assertString, validateShape } = require("../shared/validation");
const { validateUpdateClassInput } = require("./classSchemas");
const {
  planFutureAttendanceUpdates,
  validateAttendancePropagationPayload,
} = require("./attendanceGeneration");

function validateUpdateClassPayload(input) {
  const { classId } = validateShape(input || {}, {
    classId: (v) => assertString(v, "classId", { max: 120 }),
  });
  const updates = validateUpdateClassInput(input || {});
  const propagation = validateAttendancePropagationPayload(input || {});
  if (Object.keys(updates).length === 0) {
    throw new HttpsError("invalid-argument", "At least one class field is required");
  }
  return { classId, updates, propagation };
}

async function updateClassImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("updateClassImpl requires db");
  if (!actor?.uid) throw new TypeError("updateClassImpl requires actor.uid");

  const ref = db.collection("classes").doc(payload.classId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Class not found: ${payload.classId}`);
  }
  const before = snap.data() || {};
  const after = { ...before, ...payload.updates };

  if (after.startTime >= after.endTime) {
    throw new HttpsError("invalid-argument", "endTime must be after startTime");
  }
  if ((after.enrolledStudents || []).length > after.capacity) {
    throw new HttpsError(
      "failed-precondition",
      "capacity cannot be less than enrolledStudents length"
    );
  }

  const updateDates =
    payload.updates.day !== undefined || payload.updates.startTime !== undefined;
  const updateTutors = payload.updates.tutors !== undefined;
  const updateStudents = payload.updates.enrolledStudents !== undefined;
  let attendanceWrites = [];
  if (
    payload.propagation.propagateAttendance &&
    (updateDates || updateTutors || updateStudents)
  ) {
    attendanceWrites = await planFutureAttendanceUpdates({
      db,
      classId: payload.classId,
      classData: after,
      actor,
      clock,
      fromDate: payload.propagation.attendanceFromDate,
      updateDates,
      updateTutors,
      updateStudents,
    });
  }

  const batch = db.batch();
  batch.update(ref, {
    ...payload.updates,
    ...updatedMeta(actor.uid, clock),
  });
  attendanceWrites.forEach(({ ref: attendanceRef, patch }) => {
    batch.update(attendanceRef, patch);
  });
  await batch.commit();

  const attendance = { futureAttendanceUpdated: attendanceWrites.length };

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "class.update",
      targetType: "class",
      targetId: payload.classId,
      before: {
        type: before.type,
        day: before.day,
        startTime: before.startTime,
        endTime: before.endTime,
        capacity: before.capacity,
        tutors: before.tutors,
        enrolledStudents: before.enrolledStudents,
      },
      after: {
        type: after.type,
        day: after.day,
        startTime: after.startTime,
        endTime: after.endTime,
        capacity: after.capacity,
        tutors: after.tutors,
        enrolledStudents: after.enrolledStudents,
      },
      payloadSummary: attendance,
    },
    { logger, clock }
  );

  return { classId: payload.classId, ...attendance };
}

const adminUpdateClass = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateUpdateClassPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await updateClassImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminUpdateClass] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateUpdateClassPayload,
  updateClassImpl,
  adminUpdateClass,
};
