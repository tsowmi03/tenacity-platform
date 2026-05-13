"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { updatedMeta } = require("../shared/timestamps");
const {
  ValidationError,
  assertString,
  assertOptionalString,
  assertEmail,
  assertBoolean,
  assertArray,
  isPlainObject,
  validateShape,
} = require("../shared/validation");

/**
 * Edit an enrolment BEFORE it has been accepted. Per PLAN.md §5 confirmed
 * decision, we only allow updates while status is `pending` or `archived`
 * (or undefined for legacy docs). Accepted enrolments are frozen — the
 * downstream parent/student/class docs would otherwise drift out of sync
 * with the edit.
 *
 * Updatable fields mirror the intake form shape from the main website:
 *   studentFirstName, studentLastName, studentYear, studentSubjects,
 *   classes,
 *   carerFirstName, carerLastName, carerEmail, carerPhone,
 *   emergencyContactFirstName, emergencyContactLastName,
 *   emergencyContactPhone, emergencyContactRelation,
 *   allergies, permissionToLeave, additionalInfo.
 *
 * The caller passes any subset of those fields. At least one must be
 * present.
 */

function assertClassRef(value, field) {
  if (!isPlainObject(value)) {
    throw new ValidationError(`${field} must be an object`, { field });
  }
  return validateShape(value, {
    id: (v) => assertString(v, `${field}.id`, { max: 120 }),
    day: (v) => assertOptionalString(v, `${field}.day`, { max: 20 }),
    startTime: (v) => assertOptionalString(v, `${field}.startTime`, { max: 10 }),
  });
}

const UPDATABLE = {
  studentFirstName: (v) =>
    assertOptionalString(v, "studentFirstName", { max: 80 }),
  studentLastName: (v) =>
    assertOptionalString(v, "studentLastName", { max: 80 }),
  studentYear: (v) =>
    assertOptionalString(v, "studentYear", { max: 10 }),
  studentSubjects: (v) =>
    v === undefined
      ? undefined
      : assertArray(v, "studentSubjects", {
          itemAssert: (item, f) => assertString(item, f, { max: 80 }),
          unique: true,
        }),
  classes: (v) =>
    v === undefined
      ? undefined
      : assertArray(v, "classes", { itemAssert: assertClassRef }),
  carerFirstName: (v) =>
    assertOptionalString(v, "carerFirstName", { max: 80 }),
  carerLastName: (v) =>
    assertOptionalString(v, "carerLastName", { max: 80 }),
  carerEmail: (v) =>
    v === undefined ? undefined : assertEmail(v, "carerEmail"),
  carerPhone: (v) => assertOptionalString(v, "carerPhone", { max: 40 }),
  emergencyContactFirstName: (v) =>
    assertOptionalString(v, "emergencyContactFirstName", { max: 80 }),
  emergencyContactLastName: (v) =>
    assertOptionalString(v, "emergencyContactLastName", { max: 80 }),
  emergencyContactPhone: (v) =>
    assertOptionalString(v, "emergencyContactPhone", { max: 40 }),
  emergencyContactRelation: (v) =>
    assertOptionalString(v, "emergencyContactRelation", { max: 80 }),
  allergies: (v) => assertOptionalString(v, "allergies", { max: 1000 }),
  permissionToLeave: (v) =>
    v === undefined ? undefined : assertBoolean(v, "permissionToLeave"),
  additionalInfo: (v) =>
    assertOptionalString(v, "additionalInfo", { max: 2000 }),
};

function validateUpdateEnrolmentPayload(input) {
  const { enrolmentId } = validateShape(input || {}, {
    enrolmentId: (v) => assertString(v, "enrolmentId", { max: 120 }),
  });
  const updates = validateShape(input || {}, UPDATABLE);
  if (Object.keys(updates).length === 0) {
    throw new HttpsError("invalid-argument", "no updatable fields provided");
  }
  return { enrolmentId, updates };
}

async function updateEnrolmentImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("updateEnrolmentImpl requires db");
  if (!actor?.uid) throw new TypeError("updateEnrolmentImpl requires actor.uid");

  const { enrolmentId, updates } = payload;
  const ref = db.collection("enrolments").doc(enrolmentId);

  let before;
  let patch;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Enrolment not found: ${enrolmentId}`);
    }
    before = snap.data() || {};
    const status = before.status || "pending";
    if (status === "accepted") {
      throw new HttpsError(
        "failed-precondition",
        "Accepted enrolments are frozen — edits would not propagate to " +
          "the parent/student/class records that acceptance created."
      );
    }
    if (status === "deleted") {
      throw new HttpsError(
        "failed-precondition",
        "Cannot update a deleted enrolment"
      );
    }
    patch = { ...updates, ...updatedMeta(actor.uid, clock) };
    txn.update(ref, patch);
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "enrolment.update",
      targetType: "enrolment",
      targetId: enrolmentId,
      payloadSummary: { fields: Object.keys(updates) },
      before: pick(before, Object.keys(updates)),
      after: pick({ ...before, ...patch }, Object.keys(updates)),
    },
    { logger, clock }
  );

  return { enrolmentId, updatedFields: Object.keys(updates) };
}

function pick(doc, keys) {
  const out = {};
  for (const k of keys) if (doc && k in doc) out[k] = doc[k];
  return out;
}

const adminUpdateEnrolment = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateUpdateEnrolmentPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await updateEnrolmentImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminUpdateEnrolment] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateUpdateEnrolmentPayload,
  updateEnrolmentImpl,
  adminUpdateEnrolment,
};
