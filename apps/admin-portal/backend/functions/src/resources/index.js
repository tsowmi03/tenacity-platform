"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { toHttpsError } = require("../shared/errors");
const {
  assertEnum,
  assertNumber,
  assertString,
  validateShape,
} = require("../shared/validation");
const { now } = require("../shared/timestamps");
const {
  ENGLISH_ONLY_RESOURCE_TYPES,
  MODEL_MAP,
  RESOURCE_TYPES,
} = require("./modelMap");

const SUBJECTS = ["maths", "english"];
const STAFF_ROLES = ["admin", "tutor"];

function requireResourceStaffCallable(request) {
  const auth = request?.auth;
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign-in required");
  }
  const role = auth.token?.role || null;
  if (!STAFF_ROLES.includes(role)) {
    throw new HttpsError("permission-denied", "Admin or tutor role required");
  }
  return {
    uid: auth.uid,
    email: auth.token?.email || null,
    role,
    claims: auth.token || {},
  };
}

function nullableString(value, field, opts = {}) {
  if (value === undefined || value === null || value === "") return null;
  return assertString(value, field, opts);
}

function validateSubmitResourceJobPayload(input) {
  const payload = validateShape(input, {
    studentId: (value) => assertString(value, "studentId", { max: 160 }),
    subject: (value) => assertEnum(value, "subject", SUBJECTS),
    year: (value) => assertNumber(value, "year", { min: 5, max: 10, integer: true }),
    resourceType: (value) => assertEnum(value, "resourceType", RESOURCE_TYPES),
    customPrompt: (value) => {
      if (value === undefined || value === null) return "";
      return assertString(value, "customPrompt", { min: 0, max: 5000 });
    },
    uploadedFilePath: (value) =>
      nullableString(value, "uploadedFilePath", { max: 500 }),
    uploadedFileName: (value) =>
      nullableString(value, "uploadedFileName", { max: 240 }),
  });

  if (
    ENGLISH_ONLY_RESOURCE_TYPES.has(payload.resourceType) &&
    payload.subject !== "english"
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${payload.resourceType} is only available for English resources`
    );
  }

  if (payload.uploadedFilePath && !payload.uploadedFilePath.startsWith("resources/uploads/")) {
    throw new HttpsError(
      "invalid-argument",
      "uploadedFilePath must point inside resources/uploads"
    );
  }

  if (payload.uploadedFilePath && !payload.uploadedFileName) {
    throw new HttpsError(
      "invalid-argument",
      "uploadedFileName is required when uploadedFilePath is provided"
    );
  }

  if (!payload.uploadedFilePath && payload.uploadedFileName) {
    throw new HttpsError(
      "invalid-argument",
      "uploadedFilePath is required when uploadedFileName is provided"
    );
  }

  return payload;
}

function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

function studentDisplayName(student, fallbackId) {
  return (
    student?.displayName ||
    fullName(student?.firstName, student?.lastName) ||
    fallbackId
  );
}

function actorDisplayName({ actor, userData }) {
  return (
    userData?.displayName ||
    fullName(userData?.firstName, userData?.lastName) ||
    actor.claims?.name ||
    actor.email ||
    actor.uid
  );
}

function buildResourceJobDoc({ jobId, payload, actor, actorUserData, studentData, clock }) {
  return {
    jobId,
    createdBy: actor.uid,
    createdByName: actorDisplayName({ actor, userData: actorUserData }),
    createdAt: now(clock),
    studentId: payload.studentId,
    studentName: studentDisplayName(studentData, payload.studentId),
    subject: payload.subject,
    year: payload.year,
    resourceType: payload.resourceType,
    customPrompt: payload.customPrompt,
    uploadedFilePath: payload.uploadedFilePath,
    uploadedFileName: payload.uploadedFileName,
    model: MODEL_MAP[payload.resourceType],
    status: "pending",
    generatedJson: null,
    outputPath: null,
    outputFileName: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

async function createResourceJobImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createResourceJobImpl requires db");
  if (!actor?.uid) throw new TypeError("createResourceJobImpl requires actor.uid");
  if (
    payload.uploadedFilePath &&
    !payload.uploadedFilePath.startsWith(`resources/uploads/${actor.uid}/`)
  ) {
    throw new HttpsError(
      "permission-denied",
      "Uploaded reference path must belong to the signed-in user"
    );
  }

  const studentRef = db.collection("students").doc(payload.studentId);
  const userRef = db.collection("users").doc(actor.uid);
  const [studentSnap, userSnap] = await Promise.all([
    studentRef.get(),
    userRef.get().catch((err) => {
      logger.warn("[submitResourceJob] actor user document could not be loaded", {
        actorUid: actor.uid,
        errorMessage: err?.message,
      });
      return null;
    }),
  ]);

  if (!studentSnap.exists) {
    throw new HttpsError("not-found", `Student not found: ${payload.studentId}`);
  }

  const jobRef = db.collection("resourceJobs").doc();
  const doc = buildResourceJobDoc({
    jobId: jobRef.id,
    payload,
    actor,
    actorUserData: userSnap?.exists ? userSnap.data() : null,
    studentData: studentSnap.data() || {},
    clock,
  });

  await jobRef.set(doc);
  return { jobId: jobRef.id };
}

const submitResourceJob = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireResourceStaffCallable(request);
  let payload;
  try {
    payload = validateSubmitResourceJobPayload(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }

  try {
    return await createResourceJobImpl({
      payload,
      actor,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[submitResourceJob] failed", {
      actorUid: actor.uid,
      errorMessage: err?.message,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  buildResourceJobDoc,
  createResourceJobImpl,
  requireResourceStaffCallable,
  submitResourceJob,
  validateSubmitResourceJobPayload,
};
