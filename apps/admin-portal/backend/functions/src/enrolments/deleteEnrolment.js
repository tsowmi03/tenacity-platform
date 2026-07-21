"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const {
  assertString,
  assertOptionalString,
  validateShape,
} = require("../shared/validation");
const {
  validateDeleteEnrolmentInput,
} = require("./enrolmentSchemas");
const { softDeletedFields } = require("./enrolmentFactory");

/**
 * Two delete flavours per PLAN.md §5:
 *
 *   adminDeleteEnrolment (soft)
 *     - Default. Sets status:"deleted", archived:true, deletedAt/By,
 *       deleteReason. The doc stays so we keep a record of what was deleted
 *       and why.
 *     - Safe for accepted enrolments — the downstream parent/student/class
 *       links are untouched.
 *
 *   adminPurgeEnrolment (hard, gated)
 *     - For test/spam. Removes the firestore doc entirely.
 *     - Refuses if `createdParentId` or `createdStudentId` is set, because
 *       acceptance already created downstream records. The admin should
 *       delete the parent/student separately first if they really want a
 *       full purge.
 *     - Requires `confirmId` matching the enrolmentId (typed confirmation,
 *       analogous to confirmEmail on user delete).
 */

async function softDeleteImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("softDeleteImpl requires db");
  if (!actor?.uid) throw new TypeError("softDeleteImpl requires actor.uid");

  const { enrolmentId, reason } = payload;
  const ref = db.collection("enrolments").doc(enrolmentId);

  let before;
  let patch;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Enrolment not found: ${enrolmentId}`);
    }
    before = snap.data() || {};
    if (before.status === "deleted") {
      throw new HttpsError(
        "failed-precondition",
        "Enrolment is already deleted"
      );
    }
    patch = softDeletedFields({ actorUid: actor.uid, reason, clock });
    txn.update(ref, patch);
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "enrolment.delete",
      targetType: "enrolment",
      targetId: enrolmentId,
      targetName: displayName(
        { firstName: before.studentFirstName, lastName: before.studentLastName },
        enrolmentId
      ),
      payloadSummary: { reason: reason || null },
      before: {
        status: before.status || "pending",
        archived: !!before.archived,
      },
      after: { status: patch.status, archived: patch.archived },
    },
    { logger, clock }
  );

  return { enrolmentId, status: patch.status, archived: patch.archived };
}

function validatePurgePayload(input) {
  return validateShape(input || {}, {
    enrolmentId: (v) => assertString(v, "enrolmentId", { max: 120 }),
    confirmId: (v) => assertString(v, "confirmId", { max: 120 }),
    reason: (v) => assertOptionalString(v, "reason", { max: 500 }),
  });
}

async function purgeImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("purgeImpl requires db");
  if (!actor?.uid) throw new TypeError("purgeImpl requires actor.uid");

  const { enrolmentId, confirmId, reason } = payload;
  if (enrolmentId !== confirmId) {
    throw new HttpsError(
      "failed-precondition",
      "confirmId does not match enrolmentId"
    );
  }

  const ref = db.collection("enrolments").doc(enrolmentId);
  let before;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Enrolment not found: ${enrolmentId}`);
    }
    before = snap.data() || {};
    if (before.createdParentId || before.createdStudentId) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot purge: enrolment has accepted downstream records " +
          "(createdParentId/createdStudentId set). " +
          "Delete the parent/student first or use soft delete."
      );
    }
    txn.delete(ref);
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "enrolment.purge",
      targetType: "enrolment",
      targetId: enrolmentId,
      targetName: displayName(
        { firstName: before.studentFirstName, lastName: before.studentLastName },
        enrolmentId
      ),
      payloadSummary: { reason: reason || null },
      before: {
        status: before.status || "pending",
        carerEmail: before.carerEmail || null,
      },
    },
    { logger, clock }
  );

  return { enrolmentId, purged: true };
}

const adminDeleteEnrolment = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateDeleteEnrolmentInput(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await softDeleteImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminDeleteEnrolment] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

const adminPurgeEnrolment = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validatePurgePayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await purgeImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminPurgeEnrolment] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  softDeleteImpl,
  purgeImpl,
  validatePurgePayload,
  adminDeleteEnrolment,
  adminPurgeEnrolment,
};
