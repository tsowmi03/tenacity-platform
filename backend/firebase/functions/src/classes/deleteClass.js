"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { className, writeAuditLog } = require("../shared/auditLog");
const {
  deleteAttendanceSubcollection,
  validateClassDeletePayload,
} = require("./attendanceGeneration");

async function hasWaitlistEntries(db, classId) {
  const snap = await db
    .collection("waitlistEntries")
    .where("classId", "==", classId)
    .limit(1)
    .get();
  return !snap.empty;
}

async function deleteClassImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("deleteClassImpl requires db");
  if (!actor?.uid) throw new TypeError("deleteClassImpl requires actor.uid");

  const { classId, confirmClassId, deleteAttendance } = payload;
  if (classId !== confirmClassId) {
    throw new HttpsError("failed-precondition", "confirmClassId does not match classId");
  }
  if (deleteAttendance !== true) {
    throw new HttpsError("failed-precondition", "deleteAttendance must be true");
  }

  const ref = db.collection("classes").doc(classId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Class not found: ${classId}`);
  }
  const before = snap.data() || {};
  const enrolledStudents = Array.isArray(before.enrolledStudents)
    ? before.enrolledStudents
    : [];
  if (enrolledStudents.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      "Cannot delete a class with enrolled students"
    );
  }
  if (await hasWaitlistEntries(db, classId)) {
    throw new HttpsError(
      "failed-precondition",
      "Cannot delete a class with waitlist entries"
    );
  }

  const attendanceDeleted = await deleteAttendanceSubcollection(ref);
  await ref.delete();

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "class.delete",
      targetType: "class",
      targetId: classId,
      targetName: className(before, classId),
      before: {
        type: before.type,
        day: before.day,
        startTime: before.startTime,
        endTime: before.endTime,
        capacity: before.capacity,
        tutors: before.tutors,
      },
      payloadSummary: { attendanceDeleted },
    },
    { logger, clock }
  );

  return { classId, attendanceDeleted };
}

const adminDeleteClass = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateClassDeletePayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await deleteClassImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminDeleteClass] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  deleteClassImpl,
  adminDeleteClass,
};
