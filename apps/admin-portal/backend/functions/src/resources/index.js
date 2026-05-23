"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { callAnthropicForResource } = require("./apiClient");
const { buildResourceDocx, buildOutputFileName } = require("./builder");
const { extractTextFromBuffer } = require("./fileExtractor");
const { buildSystemPrompt, buildUserMessage } = require("./promptBuilder");
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
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

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

async function claimNextPendingJobForTutor({ db, createdBy, clock }) {
  if (!db) throw new TypeError("claimNextPendingJobForTutor requires db");
  if (!createdBy) throw new TypeError("claimNextPendingJobForTutor requires createdBy");

  return db.runTransaction(async (tx) => {
    const processingQuery = db
      .collection("resourceJobs")
      .where("createdBy", "==", createdBy)
      .where("status", "==", "processing")
      .limit(1);
    const processingSnap = await tx.get(processingQuery);
    if (!processingSnap.empty) return null;

    const pendingQuery = db
      .collection("resourceJobs")
      .where("createdBy", "==", createdBy)
      .where("status", "==", "pending")
      .orderBy("createdAt", "asc")
      .limit(1);
    const pendingSnap = await tx.get(pendingQuery);
    if (pendingSnap.empty) return null;

    const pendingDoc = pendingSnap.docs[0];
    const startedAt = now(clock);
    const patch = { status: "processing", startedAt, error: null };
    tx.update(pendingDoc.ref, patch);

    return {
      ...pendingDoc.data(),
      ...patch,
      jobId: pendingDoc.id,
      ref: pendingDoc.ref,
    };
  });
}

async function downloadUploadedContent({ job, storage, extractText = extractTextFromBuffer }) {
  if (!job.uploadedFilePath) return "";
  if (!storage) throw new TypeError("downloadUploadedContent requires storage");

  const [buffer] = await storage.bucket().file(job.uploadedFilePath).download();
  return extractText(buffer, {
    fileName: job.uploadedFileName,
    mimeType: job.uploadedFileMimeType,
  });
}

function outputPathForJob(jobId, outputFileName) {
  return `resources/output/${jobId}/${outputFileName}`;
}

async function runGenerationPipeline(job, deps) {
  const {
    storage,
    anthropicApiKey: apiKey,
    clock,
    callAi = callAnthropicForResource,
    buildDocx = buildResourceDocx,
    extractText = extractTextFromBuffer,
  } = deps;
  if (!storage) throw new TypeError("runGenerationPipeline requires storage");
  if (!job?.jobId) throw new TypeError("runGenerationPipeline requires job.jobId");

  const uploadedContent = await downloadUploadedContent({ job, storage, extractText });
  const systemPrompt = buildSystemPrompt(job.resourceType, {
    year: job.year,
    subject: job.subject,
  });
  const userMessage = buildUserMessage(job, uploadedContent);
  const { parsed, raw } = await callAi({
    apiKey,
    model: job.model || MODEL_MAP[job.resourceType],
    systemPrompt,
    userMessage,
  });

  let outputFileName;
  let outputPath;
  try {
    outputFileName = buildOutputFileName({
      resourceType: job.resourceType,
      title: parsed.title,
      studentName: job.studentName,
      year: job.year,
      subject: job.subject,
      date: clock ? clock() : new Date(),
    });
    const docxBuffer = await buildDocx(job.resourceType, parsed, {
      studentName: job.studentName,
      subject: job.subject,
      year: job.year,
    });
    outputPath = outputPathForJob(job.jobId, outputFileName);

    await storage.bucket().file(outputPath).save(docxBuffer, {
      metadata: { contentType: DOCX_CONTENT_TYPE },
      resumable: false,
    });
  } catch (err) {
    if (raw && !err.rawAiText) err.rawAiText = raw;
    throw err;
  }

  return {
    outputPath,
    outputFileName,
    generatedJson: raw,
  };
}

function errorMessage(err) {
  return err?.message || String(err || "Unknown resource generation error");
}

async function runQueueForTutor(createdBy, deps) {
  const { db, clock, generationPipeline = runGenerationPipeline } = deps;
  if (!db) throw new TypeError("runQueueForTutor requires db");
  if (!createdBy) throw new TypeError("runQueueForTutor requires createdBy");

  const outcomes = [];
  while (true) {
    const job = await claimNextPendingJobForTutor({ db, createdBy, clock });
    if (!job) return outcomes;

    const jobRef = db.collection("resourceJobs").doc(job.jobId);
    try {
      const result = await generationPipeline(job, deps);
      await jobRef.update({
        ...result,
        status: "complete",
        completedAt: now(clock),
        error: null,
      });
      outcomes.push({ jobId: job.jobId, status: "complete" });
    } catch (err) {
      const patch = {
        status: "failed",
        error: errorMessage(err),
        completedAt: now(clock),
      };
      if (err?.rawAiText) {
        patch.generatedJson = err.rawAiText;
      }
      await jobRef.update(patch);
      outcomes.push({ jobId: job.jobId, status: "failed", error: patch.error });
    }
  }
}

async function processResourceJobImpl({ event, deps }) {
  const job = event?.data?.data?.();
  if (!job || job.status !== "pending") return null;
  return (deps.runQueueForTutor || runQueueForTutor)(job.createdBy, deps);
}

const processResourceJob = onDocumentCreated(
  {
    document: "resourceJobs/{jobId}",
    region: "us-central1",
    timeoutSeconds: 540,
    secrets: [anthropicApiKey],
  },
  async (event) => {
    try {
      return await processResourceJobImpl({
        event,
        deps: {
          db: admin.firestore(),
          storage: admin.storage(),
          anthropicApiKey: anthropicApiKey.value(),
        },
      });
    } catch (err) {
      logger.error("[processResourceJob] failed", {
        jobId: event?.params?.jobId,
        errorMessage: err?.message,
      });
      throw err;
    }
  }
);

module.exports = {
  buildResourceJobDoc,
  claimNextPendingJobForTutor,
  createResourceJobImpl,
  downloadUploadedContent,
  outputPathForJob,
  processResourceJob,
  processResourceJobImpl,
  requireResourceStaffCallable,
  runGenerationPipeline,
  runQueueForTutor,
  submitResourceJob,
  validateSubmitResourceJobPayload,
};
