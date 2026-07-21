"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const {
  validateArchiveEnrolmentInput,
} = require("./enrolmentSchemas");
const {
  archivedFields,
  unarchivedFields,
} = require("./enrolmentFactory");

/**
 * Archive / unarchive a pending enrolment.
 *
 * Archive rules (PLAN §5):
 *  - Status must be `pending` (or unset/undefined for legacy docs).
 *  - Sets `status: "archived"`, `archived: true`, archivedAt/By.
 *  - Accepted enrolments are already `archived: true, status: "accepted"`;
 *    archiving them would mis-label history, so we refuse with
 *    failed-precondition.
 *
 * Unarchive: only reverses an `archived` status back to `pending`. Refuses
 * for `accepted` or `deleted` records.
 */

async function archiveImpl({ payload, actor, deps, mode }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("archiveImpl requires db");
  if (!actor?.uid) throw new TypeError("archiveImpl requires actor.uid");

  const { enrolmentId } = payload;
  const ref = db.collection("enrolments").doc(enrolmentId);

  let before;
  let patch;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Enrolment not found: ${enrolmentId}`);
    }
    before = snap.data() || {};
    const currentStatus = before.status || "pending";

    if (mode === "archive") {
      if (currentStatus === "accepted") {
        throw new HttpsError(
          "failed-precondition",
          "Accepted enrolments are already archived; cannot re-archive"
        );
      }
      if (currentStatus === "deleted") {
        throw new HttpsError(
          "failed-precondition",
          "Cannot archive a deleted enrolment"
        );
      }
      patch = archivedFields({ actorUid: actor.uid, clock });
    } else {
      if (currentStatus !== "archived") {
        throw new HttpsError(
          "failed-precondition",
          `Can only unarchive an archived enrolment (current: ${currentStatus})`
        );
      }
      patch = unarchivedFields({ actorUid: actor.uid, clock });
    }
    txn.update(ref, patch);
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: mode === "archive" ? "enrolment.archive" : "enrolment.unarchive",
      targetType: "enrolment",
      targetId: enrolmentId,
      targetName: displayName(
        { firstName: before.studentFirstName, lastName: before.studentLastName },
        enrolmentId
      ),
      before: { status: before.status || "pending", archived: !!before.archived },
      after: { status: patch.status, archived: patch.archived },
    },
    { logger, clock }
  );

  return { enrolmentId, status: patch.status, archived: patch.archived };
}

const adminArchiveEnrolment = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateArchiveEnrolmentInput(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await archiveImpl({
        payload,
        actor,
        mode: "archive",
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminArchiveEnrolment] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

const adminUnarchiveEnrolment = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateArchiveEnrolmentInput(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await archiveImpl({
        payload,
        actor,
        mode: "unarchive",
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminUnarchiveEnrolment] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  archiveImpl,
  adminArchiveEnrolment,
  adminUnarchiveEnrolment,
};
