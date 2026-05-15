"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { updatedMeta } = require("../shared/timestamps");
const { assertString, validateShape } = require("../shared/validation");
const { validateUpdateStudentInput } = require("./studentSchemas");

/**
 * Update a `students/{studentId}` document. Allowed fields: firstName,
 * lastName, grade, subjects, primaryParentId.
 *
 * Linking/unlinking parents goes through `adminLinkStudentToParent` and
 * `adminUnlinkStudentFromParent` so the symmetric `parents` / `students`
 * arrays stay in sync.
 *
 * If `primaryParentId` is supplied, the student doc's `parents` array must
 * include it.
 */
function validateUpdateStudentPayload(input) {
  const { studentId } = validateShape(input || {}, {
    studentId: (v) => assertString(v, "studentId", { max: 120 }),
  });
  const updates = validateUpdateStudentInput(input || {});
  if (Object.keys(updates).length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "no updatable fields provided"
    );
  }
  return { studentId, updates };
}

async function updateStudentImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("updateStudentImpl requires db");
  if (!actor?.uid) throw new TypeError("updateStudentImpl requires actor.uid");

  const { studentId, updates } = payload;
  const ref = db.collection("students").doc(studentId);

  let before;
  let after;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Student not found: ${studentId}`);
    }
    before = snap.data();
    if (updates.primaryParentId) {
      const parents = before.parents || [];
      if (!parents.includes(updates.primaryParentId)) {
        throw new HttpsError(
          "failed-precondition",
          "primaryParentId must be one of the student's existing parents"
        );
      }
    }
    const patch = { ...updates, ...updatedMeta(actor.uid, clock) };
    txn.update(ref, patch);
    after = { ...before, ...patch };
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "student.update",
      targetType: "student",
      targetId: studentId,
      payloadSummary: { fields: Object.keys(updates) },
      before: pick(before, Object.keys(updates)),
      after: pick(after, Object.keys(updates)),
    },
    { logger, clock }
  );

  return { studentId, updatedFields: Object.keys(updates) };
}

function pick(doc, keys) {
  const out = {};
  for (const k of keys) if (doc && k in doc) out[k] = doc[k];
  return out;
}

const adminUpdateStudent = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateUpdateStudentPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await updateStudentImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminUpdateStudent] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateUpdateStudentPayload,
  updateStudentImpl,
  adminUpdateStudent,
};
