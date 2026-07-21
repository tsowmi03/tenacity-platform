"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { displayName, writeAuditLog } = require("../shared/auditLog");
const { updatedMeta } = require("../shared/timestamps");
const { assertString, validateShape } = require("../shared/validation");
const { validateUpdateUserInput } = require("./userSchemas");

/**
 * Update a `users/{uid}` document. Allowed fields: firstName, lastName, phone,
 * lessonTokens (parent-only). Returns `{ uid, updatedFields, before, after }`.
 *
 * Role changes are out of scope here — they require a separate flow that
 * adjusts custom claims AND reshapes the user doc (e.g., add students/
 * lessonTokens when promoting to parent). Likewise email changes need a
 * Firebase Auth update; defer to a dedicated function.
 */
function validateUpdateUserPayload(input) {
  const { uid } = validateShape(input || {}, {
    uid: (v) => assertString(v, "uid", { max: 120 }),
  });
  const updates = validateUpdateUserInput(input || {});
  if (Object.keys(updates).length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "no updatable fields provided"
    );
  }
  return { uid, updates };
}

async function updateUserImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("updateUserImpl requires db");
  if (!actor?.uid) throw new TypeError("updateUserImpl requires actor.uid");

  const { uid, updates } = payload;
  const userRef = db.collection("users").doc(uid);

  let before;
  let after;
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(userRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `User not found: ${uid}`);
    }
    before = snap.data();

    if (updates.lessonTokens !== undefined && before.role !== "parent") {
      throw new HttpsError(
        "failed-precondition",
        "lessonTokens can only be updated on parent users"
      );
    }

    const patch = { ...updates, ...updatedMeta(actor.uid, clock) };
    txn.update(userRef, patch);
    after = { ...before, ...patch };
  });

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "user.update",
      targetType: "user",
      targetId: uid,
      targetName: displayName(after, uid),
      payloadSummary: { fields: Object.keys(updates) },
      before: pickAuditable(before, Object.keys(updates)),
      after: pickAuditable(after, Object.keys(updates)),
    },
    { logger, clock }
  );

  return { uid, updatedFields: Object.keys(updates) };
}

function pickAuditable(doc, keys) {
  const out = {};
  for (const k of keys) if (doc && k in doc) out[k] = doc[k];
  return out;
}

const adminUpdateUser = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateUpdateUserPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      return await updateUserImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminUpdateUser] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  validateUpdateUserPayload,
  updateUserImpl,
  adminUpdateUser,
};
