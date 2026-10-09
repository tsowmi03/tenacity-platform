"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const { now, updatedMeta } = require("../shared/timestamps");
const {
  ValidationError,
  assertBoolean,
  assertEnum,
  assertString,
  validateShape,
} = require("../shared/validation");
const { REFERRAL_STATUSES } = require("./referralRecords");

/**
 * An admin's decision on a referral, and whether they have applied the reward.
 *
 * A callable rather than a portal write so every change lands in the audit log
 * with its before and after, as every other admin change does. Who referred
 * whom is never editable. Nothing here touches an invoice: the reward is
 * applied by hand, and `rewardApplied` only records that it was.
 */

function validateUpdateReferralPayload(input) {
  const out = validateShape(input || {}, {
    referralId: (v) => assertString(v, "referralId", { max: 300 }),
    status: (v) =>
      v === undefined ? undefined : assertEnum(v, "status", REFERRAL_STATUSES),
    rewardApplied: (v) =>
      v === undefined ? undefined : assertBoolean(v, "rewardApplied"),
  });
  if (out.status === undefined && out.rewardApplied === undefined) {
    throw new ValidationError("status or rewardApplied is required", {
      field: "<root>",
    });
  }
  return out;
}

async function updateReferralImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("updateReferralImpl requires db");
  if (!actor?.uid) throw new TypeError("updateReferralImpl requires actor.uid");

  const { referralId, status, rewardApplied } = payload;
  const ref = db.collection("referrals").doc(referralId);

  let before;
  let after;
  let targetName = referralId;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Referral not found: ${referralId}`);
    }
    const data = snap.data() || {};
    const [referrerSnap, newParentSnap] = await Promise.all([
      txn.get(db.collection("users").doc(String(data.referrerParentId || "-"))),
      txn.get(db.collection("users").doc(String(data.newParentId || "-"))),
    ]);
    targetName = `${displayName(referrerSnap.data(), data.referrerParentId || "?")} → ${displayName(
      newParentSnap.data(),
      data.newParentId || "?"
    )}`;
    before = {
      status: data.status || "pending",
      rewardApplied: data.rewardApplied === true,
    };
    after = {
      status: status ?? before.status,
      rewardApplied: rewardApplied ?? before.rewardApplied,
    };

    const update = { ...updatedMeta(actor.uid, clock) };
    if (status !== undefined) update.status = status;
    if (rewardApplied !== undefined) {
      update.rewardApplied = rewardApplied;
      // Stamped when the reward goes on, cleared if an admin takes it back,
      // so the date always means "applied on".
      if (rewardApplied !== before.rewardApplied) {
        update.rewardAppliedAt = rewardApplied ? now(clock) : null;
      }
    }
    txn.update(ref, update);
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "referral.update",
      targetType: "referral",
      targetId: referralId,
      targetName,
      payloadSummary: { status: status ?? null, rewardApplied: rewardApplied ?? null },
      before,
      after,
    },
    { logger, clock }
  );

  return { referralId, before, after };
}

const adminUpdateReferral = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  let payload;
  try {
    payload = validateUpdateReferralPayload(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
  try {
    return await updateReferralImpl({
      payload,
      actor,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[adminUpdateReferral] failed", {
      errorMessage: err?.message,
      referralId: payload?.referralId,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  validateUpdateReferralPayload,
  updateReferralImpl,
  adminUpdateReferral,
};
