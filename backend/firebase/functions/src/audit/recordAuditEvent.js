"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { writeAuditLog } = require("../shared/auditLog");

const ALLOWED_ACTIONS = new Set([
  "attendance.mark",
  "attendance.cancel",
  "attendance.uncancel",
  "class.book_one_off",
  "class.cancel_booking",
  "class.reschedule",
  "class.enrol_permanent",
  "class.unenrol_permanent",
  "user.adjust_lesson_tokens",
  "invoice.create",
  "invoice.delete",
  "invoice.mark_paid",
  "invoice.pay_start",
  "invoice.pay_complete",
  "terms.accept",
  "profile.update",
  "student.update",
  "student.unenrol",
  "user.delete_account",
  "announcement.create",
  "announcement.delete",
]);

const ALLOWED_TARGET_TYPES = new Set([
  "announcement",
  "attendance",
  "class",
  "invoice",
  "invoiceDraft",
  "payment",
  "student",
  "term",
  "user",
]);

function requiredString(input, field, max = 240) {
  const value = input?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HttpsError("invalid-argument", `${field} is too long`);
  }
  return trimmed;
}

function optionalString(input, field, max = 500) {
  const value = input?.[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HttpsError("invalid-argument", `${field} is too long`);
  }
  return trimmed || undefined;
}

function compactValue(value, depth = 0) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => compactValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value).slice(0, 80)) {
      const compacted = compactValue(child, depth + 1);
      if (compacted !== undefined) out[key.slice(0, 120)] = compacted;
    }
    return out;
  }
  return String(value).slice(0, 500);
}

function validateAuditPayload(input) {
  const action = requiredString(input, "action", 120);
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new HttpsError("invalid-argument", "Unsupported audit action");
  }
  const targetType = requiredString(input, "targetType", 80);
  if (!ALLOWED_TARGET_TYPES.has(targetType)) {
    throw new HttpsError("invalid-argument", "Unsupported audit target type");
  }

  return {
    action,
    targetType,
    targetId: requiredString(input, "targetId", 240),
    targetName: optionalString(input, "targetName", 500),
    payloadSummary: compactValue(input?.payloadSummary),
    before: compactValue(input?.before),
    after: compactValue(input?.after),
    requestId: optionalString(input, "requestId", 240),
  };
}

async function actorForRequest(request, db) {
  const auth = request?.auth;
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign-in required");
  }

  let userData = null;
  try {
    const userSnap = await db.collection("users").doc(auth.uid).get();
    userData = userSnap.exists ? userSnap.data() : null;
  } catch (err) {
    logger.warn("[recordAuditEvent] failed to load actor user doc", {
      actorUid: auth.uid,
      errorMessage: err?.message,
    });
  }

  return {
    uid: auth.uid,
    email: auth.token?.email || userData?.email || null,
    role: auth.token?.role || userData?.role || null,
  };
}

async function recordAuditEventImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("recordAuditEventImpl requires db");
  if (!actor?.uid) throw new TypeError("recordAuditEventImpl requires actor.uid");

  return writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      ...payload,
    },
    { logger, clock }
  );
}

const recordAuditEvent = onCall({ region: "us-central1" }, async (request) => {
  const db = admin.firestore();
  const payload = validateAuditPayload(request.data || {});
  const actor = await actorForRequest(request, db);
  const { id, duplicate } = await recordAuditEventImpl({
    payload,
    actor,
    deps: { db },
  });
  return { ok: true, id, duplicate: Boolean(duplicate) };
});

module.exports = {
  ALLOWED_ACTIONS,
  ALLOWED_TARGET_TYPES,
  compactValue,
  recordAuditEvent,
  recordAuditEventImpl,
  validateAuditPayload,
};
