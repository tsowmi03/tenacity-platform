"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { now } = require("../shared/timestamps");
const {
  assertString,
  validateShape,
} = require("../shared/validation");

/**
 * Hard-delete a student.
 *
 * Confirmation: caller passes `confirmFullName` which must equal
 * `${firstName} ${lastName}` from the stored doc (case-insensitive, trimmed).
 * Students have no email, so the name is the only stable handle.
 *
 * Cascade (per PLAN.md and confirmed policy):
 *  - Remove the studentId from every linked parent's `students[]`.
 *  - Remove the studentId from every class's `enrolledStudents[]`.
 *  - Remove the studentId from every FUTURE attendance doc's `attendance[]`
 *    (historical attendance keeps the student reference for reports).
 *  - Delete `students/{studentId}`.
 *
 * If `student.primaryParentId` equals a parent being unlinked here (it
 * shouldn't — we don't unlink, we delete the student doc), nothing to do.
 *
 * Future-only cleanup means historical reports continue to show the right
 * names; the app should tolerate a missing student id in old attendance.
 */
function validateDeleteStudentPayload(input) {
  return validateShape(input || {}, {
    studentId: (v) => assertString(v, "studentId", { max: 120 }),
    confirmFullName: (v) =>
      assertString(v, "confirmFullName", { min: 1, max: 200 }),
  });
}

function normaliseName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function gatherClassCleanup(db, studentId, clock) {
  const cutoff = now(clock);
  const classSnap = await db
    .collection("classes")
    .where("enrolledStudents", "array-contains", studentId)
    .get();
  const classes = [];
  for (const cls of classSnap.docs) {
    const futureSnap = await cls.ref
      .collection("attendance")
      .where("date", ">=", cutoff)
      .get();
    const futureWithStudent = futureSnap.docs.filter((d) =>
      ((d.data() || {}).attendance || []).includes(studentId)
    );
    classes.push({
      ref: cls.ref,
      attendanceRefs: futureWithStudent.map((d) => d.ref),
    });
  }
  return classes;
}

async function deleteStudentImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("deleteStudentImpl requires db");
  if (!actor?.uid) throw new TypeError("deleteStudentImpl requires actor.uid");

  const { studentId, confirmFullName } = payload;
  const studentRef = db.collection("students").doc(studentId);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) {
    throw new HttpsError("not-found", `Student not found: ${studentId}`);
  }
  const studentData = studentSnap.data() || {};
  const stored = normaliseName(
    `${studentData.firstName || ""} ${studentData.lastName || ""}`
  );
  if (stored !== normaliseName(confirmFullName)) {
    throw new HttpsError(
      "failed-precondition",
      "confirmFullName does not match the student's stored name"
    );
  }

  const parentUids = Array.isArray(studentData.parents) ? studentData.parents : [];
  const classes = await gatherClassCleanup(db, studentId, clock);

  const totalOps =
    1 +
    parentUids.length +
    classes.length +
    classes.reduce((sum, c) => sum + c.attendanceRefs.length, 0);
  if (totalOps > 450) {
    throw new HttpsError(
      "resource-exhausted",
      `Cleanup would require ${totalOps} writes; please reduce scope first.`
    );
  }

  const batch = db.batch();
  parentUids.forEach((puid) => {
    batch.update(db.collection("users").doc(puid), {
      students: admin.firestore.FieldValue.arrayRemove(studentId),
    });
  });
  classes.forEach((c) => {
    batch.update(c.ref, {
      enrolledStudents: admin.firestore.FieldValue.arrayRemove(studentId),
    });
    c.attendanceRefs.forEach((aref) => {
      batch.update(aref, {
        attendance: admin.firestore.FieldValue.arrayRemove(studentId),
      });
    });
  });
  batch.delete(studentRef);
  await batch.commit();

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "student.delete",
      targetType: "student",
      targetId: studentId,
      payloadSummary: {
        parentUnlinks: parentUids.length,
        classesUpdated: classes.length,
        futureAttendanceUpdated: classes.reduce(
          (sum, c) => sum + c.attendanceRefs.length,
          0
        ),
      },
      before: {
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        grade: studentData.grade,
        parents: parentUids,
      },
    },
    { logger, clock }
  );

  return {
    studentId,
    parentUnlinks: parentUids.length,
    classesUpdated: classes.length,
    futureAttendanceUpdated: classes.reduce(
      (sum, c) => sum + c.attendanceRefs.length,
      0
    ),
  };
}

const adminDeleteStudent = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateDeleteStudentPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await deleteStudentImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminDeleteStudent] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateDeleteStudentPayload,
  deleteStudentImpl,
  adminDeleteStudent,
};
