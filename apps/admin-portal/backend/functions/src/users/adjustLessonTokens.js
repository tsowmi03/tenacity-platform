"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { writeAuditLog } = require("../shared/auditLog");
const { updatedMeta } = require("../shared/timestamps");
const {
  assertString,
  assertOptionalString,
  assertNumber,
  validateShape,
} = require("../shared/validation");

/**
 * Adjust a parent's `lessonTokens` by a signed delta. Used by admin overrides
 * (gifting tokens, correcting a miscount, etc.).
 *
 * Two modes:
 *  - `delta`: integer (positive or negative). Final balance must be >= 0.
 *  - `set`:   absolute non-negative integer. Use when you want the final value
 *             regardless of the current one.
 *
 * Exactly one of `delta` / `set` must be provided.
 */
function validateAdjustPayload(input) {
  const { uid, reason } = validateShape(input || {}, {
    uid: (v) => assertString(v, "uid", { max: 120 }),
    reason: (v) => assertOptionalString(v, "reason", { max: 500 }),
  });
  const hasDelta = input && typeof input.delta === "number";
  const hasSet = input && typeof input.set === "number";
  if (hasDelta === hasSet) {
    throw new HttpsError(
      "invalid-argument",
      "exactly one of `delta` or `set` must be provided"
    );
  }
  if (hasDelta) {
    assertNumber(input.delta, "delta", { integer: true });
    return { uid, reason, mode: "delta", value: input.delta };
  }
  assertNumber(input.set, "set", { integer: true, min: 0 });
  return { uid, reason, mode: "set", value: input.set };
}

async function adjustLessonTokensImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("adjustLessonTokensImpl requires db");
  if (!actor?.uid) throw new TypeError("adjustLessonTokensImpl requires actor.uid");

  const { uid, mode, value, reason } = payload;
  const ref = db.collection("users").doc(uid);

  let before;
  let after;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `User not found: ${uid}`);
    }
    const data = snap.data();
    if (data.role !== "parent") {
      throw new HttpsError(
        "failed-precondition",
        "lessonTokens can only be adjusted on parent users"
      );
    }
    before = typeof data.lessonTokens === "number" ? data.lessonTokens : 0;
    after = mode === "set" ? value : before + value;
    if (after < 0) {
      throw new HttpsError(
        "failed-precondition",
        `lessonTokens would go negative (current=${before}, delta=${value})`
      );
    }
    txn.update(ref, {
      lessonTokens: after,
      ...updatedMeta(actor.uid, clock),
    });
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: "user.adjust_lesson_tokens",
      targetType: "user",
      targetId: uid,
      payloadSummary: { mode, value, reason: reason || null },
      before: { lessonTokens: before },
      after: { lessonTokens: after },
    },
    { logger, clock }
  );

  return { uid, before, after };
}

const adminAdjustLessonTokens = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateAdjustPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await adjustLessonTokensImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminAdjustLessonTokens] failed", {
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateAdjustPayload,
  adjustLessonTokensImpl,
  adminAdjustLessonTokens,
};
