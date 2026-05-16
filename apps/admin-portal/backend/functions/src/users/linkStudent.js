"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { updatedMeta } = require("../shared/timestamps");
const { assertString, validateShape } = require("../shared/validation");

/**
 * Symmetric link / unlink between a parent user and a student.
 *
 * Link: arrayUnion uid onto students.parents AND studentId onto users.students.
 * Unlink: arrayRemove from both. If unlinking removes the student's
 * primaryParentId, the next remaining parent becomes primary (or it is
 * cleared if none remain).
 *
 * Both operations run in a transaction so the two arrays cannot diverge.
 */

function validateLinkPayload(input) {
  return validateShape(input || {}, {
    parentId: (v) => assertString(v, "parentId", { max: 120 }),
    studentId: (v) => assertString(v, "studentId", { max: 120 }),
  });
}

async function linkImpl({ payload, actor, deps, mode }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("linkImpl requires db");
  if (!actor?.uid) throw new TypeError("linkImpl requires actor.uid");

  const { parentId, studentId } = payload;
  const parentRef = db.collection("users").doc(parentId);
  const studentRef = db.collection("students").doc(studentId);

  await db.runTransaction(async (txn) => {
    const [parentSnap, studentSnap] = await Promise.all([
      txn.get(parentRef),
      txn.get(studentRef),
    ]);
    if (!parentSnap.exists) {
      throw new HttpsError("not-found", `Parent not found: ${parentId}`);
    }
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", `Student not found: ${studentId}`);
    }
    if ((parentSnap.data() || {}).role !== "parent") {
      throw new HttpsError(
        "failed-precondition",
        `User ${parentId} is not a parent`
      );
    }

    const updateMeta = updatedMeta(actor.uid, clock);

    if (mode === "link") {
      txn.update(parentRef, {
        students: admin.firestore.FieldValue.arrayUnion(studentId),
        ...updateMeta,
      });
      txn.update(studentRef, {
        parents: admin.firestore.FieldValue.arrayUnion(parentId),
        ...updateMeta,
      });
    } else {
      const studentData = studentSnap.data() || {};
      const remainingParents = (studentData.parents || []).filter(
        (p) => p !== parentId
      );
      const studentPatch = {
        parents: admin.firestore.FieldValue.arrayRemove(parentId),
        ...updateMeta,
      };
      if (studentData.primaryParentId === parentId) {
        studentPatch.primaryParentId = remainingParents[0] || null;
      }
      txn.update(parentRef, {
        students: admin.firestore.FieldValue.arrayRemove(studentId),
        ...updateMeta,
      });
      txn.update(studentRef, studentPatch);
    }
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: mode === "link" ? "parent.link_student" : "parent.unlink_student",
      targetType: "user",
      targetId: parentId,
      payloadSummary: { studentId },
    },
    { logger, clock }
  );

  return { parentId, studentId, mode };
}

const adminLinkStudentToParent = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateLinkPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await linkImpl({
        payload,
        actor,
        mode: "link",
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminLinkStudentToParent] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

const adminUnlinkStudentFromParent = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateLinkPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await linkImpl({
        payload,
        actor,
        mode: "unlink",
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminUnlinkStudentFromParent] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateLinkPayload,
  linkImpl,
  adminLinkStudentToParent,
  adminUnlinkStudentFromParent,
};
