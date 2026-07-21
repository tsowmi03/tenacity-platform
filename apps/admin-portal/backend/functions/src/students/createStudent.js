"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const {
  assertArray,
  assertString,
  assertOptionalString,
  validateShape,
} = require("../shared/validation");
const { validateCreateStudentInput } = require("./studentSchemas");
const { buildStudentDoc } = require("./studentFactory");

/**
 * Standalone student creation. Optionally links the new student to existing
 * parent users by adding to each parent's `students` array and the student's
 * `parents` array.
 *
 * For the "create parent + students together" flow, use `adminCreateUser`.
 */
function validateCreateStudentPayload(input) {
  if (!input || typeof input !== "object") {
    throw new HttpsError("invalid-argument", "payload required");
  }
  const studentFields = validateCreateStudentInput({
    ...input,
    parents: undefined,
  });
  const { parentIds, primaryParentId } = validateShape(input, {
    parentIds: (v) =>
      v === undefined
        ? []
        : assertArray(v, "parentIds", {
            itemAssert: (item, f) => assertString(item, f, { max: 120 }),
            unique: true,
          }),
    primaryParentId: (v) =>
      assertOptionalString(v, "primaryParentId", { max: 120 }),
  });
  if (
    primaryParentId &&
    parentIds.length &&
    !parentIds.includes(primaryParentId)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "primaryParentId must be one of the linked parentIds"
    );
  }
  return { student: studentFields, parentIds, primaryParentId };
}

async function createStudentImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createStudentImpl requires db");
  if (!actor?.uid) throw new TypeError("createStudentImpl requires actor.uid");

  const { student, parentIds, primaryParentId } = payload;
  const studentRef = db.collection("students").doc();
  const studentId = studentRef.id;

  if (parentIds.length === 0) {
    const doc = buildStudentDoc(
      { ...student, parents: [] },
      { actorUid: actor.uid, clock }
    );
    if (primaryParentId) doc.primaryParentId = primaryParentId;
    await studentRef.set(doc);
  } else {
    const parentRefs = parentIds.map((id) => db.collection("users").doc(id));
    await db.runTransaction(async (txn) => {
      const snaps = await Promise.all(parentRefs.map((r) => txn.get(r)));
      snaps.forEach((snap, i) => {
        if (!snap.exists) {
          throw new HttpsError("not-found", `Parent not found: ${parentIds[i]}`);
        }
        if ((snap.data() || {}).role !== "parent") {
          throw new HttpsError(
            "failed-precondition",
            `User ${parentIds[i]} is not a parent`
          );
        }
      });

      const doc = buildStudentDoc(
        { ...student, parents: [...parentIds] },
        { actorUid: actor.uid, clock }
      );
      doc.primaryParentId = primaryParentId || parentIds[0];
      txn.set(studentRef, doc);

      parentRefs.forEach((ref) => {
        txn.update(ref, {
          students: admin.firestore.FieldValue.arrayUnion(studentId),
        });
      });
    });
  }

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "student.create",
      targetType: "student",
      targetId: studentId,
      targetName: displayName(student, studentId),
      payloadSummary: {
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        parentIds,
      },
    },
    { logger, clock }
  );

  return { studentId, parentIds };
}

const adminCreateStudent = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateCreateStudentPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await createStudentImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminCreateStudent] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateCreateStudentPayload,
  createStudentImpl,
  adminCreateStudent,
};
