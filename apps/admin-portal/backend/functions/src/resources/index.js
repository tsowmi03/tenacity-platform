"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { callAnthropicForResource } = require("./apiClient");
const { buildResourceDocx, buildOutputFileName } = require("./builder");
const { extractTextFromBuffer } = require("./fileExtractor");
const { buildSystemPrompt, buildUserMessage } = require("./promptBuilder");
const { writeAuditLog } = require("../shared/auditLog");
const { toHttpsError } = require("../shared/errors");
const {
  assertEnum,
  assertNumber,
  assertString,
  validateShape,
} = require("../shared/validation");
const { fromDate, now } = require("../shared/timestamps");
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
const RESOURCE_JOB_RECOVERY_MS = 8 * 60 * 1000;
const RESOURCE_DEFAULT_MAX_TOKENS = 8000;
const RESOURCE_WORKING_MAX_TOKENS = 24000;
const RESOURCE_WORKER_OPTIONS = {
  region: "us-central1",
  memory: "1GiB",
  timeoutSeconds: 540,
  secrets: [anthropicApiKey],
};

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
    includeWorking: (value) => {
      if (value === undefined || value === null) return false;
      if (typeof value !== "boolean") {
        throw new HttpsError("invalid-argument", "includeWorking must be a boolean");
      }
      return value;
    },
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

function validateRetryResourceJobPayload(input) {
  return validateShape(input || {}, {
    jobId: (value) => assertString(value, "jobId", { max: 160 }),
  });
}

function validateDeleteResourceJobPayload(input) {
  return validateShape(input || {}, {
    jobId: (value) => assertString(value, "jobId", { max: 160 }),
  });
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
    includeWorking: payload.includeWorking || false,
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

function modelForResourceJob(job) {
  const configuredModel = MODEL_MAP[job.resourceType];
  if (job.model === "claude-3-5-haiku-20241022" && configuredModel) {
    return configuredModel;
  }
  return job.model || configuredModel;
}

function maxTokensForResourceJob(job) {
  return job?.includeWorking
    ? RESOURCE_WORKING_MAX_TOKENS
    : RESOURCE_DEFAULT_MAX_TOKENS;
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

async function saveGeneratedResource({ job, parsed, raw, storage, buildDocx, clock }) {
  const outputFileName = buildOutputFileName({
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
  const outputPath = outputPathForJob(job.jobId, outputFileName);

  await storage.bucket().file(outputPath).save(docxBuffer, {
    metadata: { contentType: DOCX_CONTENT_TYPE },
    resumable: false,
  });

  return {
    outputPath,
    outputFileName,
    generatedJson: raw,
  };
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
    includeWorking: job.includeWorking || false,
  });
  const userMessage = buildUserMessage(job, uploadedContent);
  let { parsed, raw } = await callAi({
    apiKey,
    model: modelForResourceJob(job),
    maxTokens: maxTokensForResourceJob(job),
    systemPrompt,
    userMessage,
  });

  // Verification pass: clean and cross-check maths working out
  if (job.includeWorking && job.subject === "maths" && Array.isArray(parsed?.answers)) {
    parsed = await verifyMathsAnswers({ job, parsed, apiKey, callAi });
  }

  try {
    return await saveGeneratedResource({
      job,
      parsed,
      raw,
      storage,
      buildDocx,
      clock,
    });
  } catch (err) {
    if (raw && !err.rawAiText) err.rawAiText = raw;
    throw err;
  }
}

/**
 * Post-generation verification pass for maths practice paper answers.
 * Asks Claude to review every answer+workingOut pair for:
 *  - meta-commentary / self-corrections in workingOut
 *  - answer ≠ working conclusion mismatches
 *  - mathematical errors
 * Returns a new parsed object with the corrected answers array.
 * On any failure (parse error, schema mismatch) returns the original parsed unchanged.
 */
async function verifyMathsAnswers({ job, parsed, apiKey, callAi = callAnthropicForResource }) {
  const answersJson = JSON.stringify(parsed.answers, null, 2);
  const systemPrompt = `You are a senior mathematics teacher proof-reading a mark scheme.

For each answer entry, review and correct:
1. CLEAN WORKING: "workingOut" must read like a teacher's whiteboard solution. Remove any "Wait", "Actually", "Let me re-check", "Note:", self-corrections, or meta-commentary. Rewrite those steps cleanly and correctly.
2. CONSISTENCY: The value in "answer" must match exactly what "workingOut" concludes. If they disagree, fix "answer" to match the correct conclusion of the working.
3. ACCURACY: If you spot a calculation error in "workingOut", correct both "workingOut" and "answer".

Return ONLY the corrected answers array as valid JSON:
[{ "questionNumber": number, "partLabel": null | string, "answer": string, "marks": number, "workingOut": string }, ...]
No preamble, no explanation, no markdown code fences.`;

  const userMessage = `Review and correct this mark scheme answers array:\n\n${answersJson}`;

  try {
    const model = modelForResourceJob(job);
    const { parsed: verifiedParsed } = await callAi({
      apiKey,
      model,
      maxTokens: 8000,
      systemPrompt,
      userMessage,
    });

    // verifiedParsed should be an array (the answers), not an object
    const verifiedAnswers = Array.isArray(verifiedParsed)
      ? verifiedParsed
      : Array.isArray(verifiedParsed?.answers)
      ? verifiedParsed.answers
      : null;

    if (!verifiedAnswers || verifiedAnswers.length !== parsed.answers.length) {
      logger.warn("Answer verification returned unexpected shape — using original answers", {
        originalCount: parsed.answers.length,
        verifiedCount: verifiedAnswers?.length,
      });
      return parsed;
    }

    logger.info("Answer verification pass completed", { questionCount: verifiedAnswers.length });

    return { ...parsed, answers: verifiedAnswers };
  } catch (err) {
    // Verification is best-effort — never block generation
    logger.warn("Answer verification pass failed (using original answers)", {
      error: err?.message,
    });
    return parsed;
  }
}

function buildRepairSystemPrompt(job) {
  return `${buildSystemPrompt(job.resourceType, {
    year: job.year,
    subject: job.subject,
    includeWorking: job.includeWorking || false,
  })}

Repair mode:
- The user will provide a previous model response that failed JSON parsing or DOCX schema validation.
- Preserve the educational content, question intent, marks, answers, and marking guide as much as possible.
- Fix only the JSON structure and schema compatibility issues.
- Return ONLY valid JSON matching the schema above. No markdown code fences. No explanation.`;
}

function buildRepairUserMessage(job) {
  const previous = String(job.generatedJson || "").trim();
  const error = String(job.error || job.lastError || "").trim();
  return [
    "Repair this previous model response so it is valid JSON for the requested resource schema.",
    error ? `Failure reason:\n${error}` : null,
    `Previous model response:\n${previous}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function canRepairJob(job) {
  return (
    typeof job?.generatedJson === "string" &&
    job.generatedJson.trim().length > 0 &&
    !job.outputPath
  );
}

async function runRepairPipeline(job, deps) {
  const {
    storage,
    anthropicApiKey: apiKey,
    clock,
    callAi = callAnthropicForResource,
    buildDocx = buildResourceDocx,
  } = deps;
  if (!storage) throw new TypeError("runRepairPipeline requires storage");
  if (!job?.jobId) throw new TypeError("runRepairPipeline requires job.jobId");
  if (!canRepairJob(job)) {
    throw new Error("Job does not have repairable generated JSON");
  }

  const { parsed, raw } = await callAi({
    apiKey,
    model: modelForResourceJob(job),
    maxTokens: maxTokensForResourceJob(job),
    systemPrompt: buildRepairSystemPrompt(job),
    userMessage: buildRepairUserMessage(job),
  });

  try {
    return await saveGeneratedResource({
      job,
      parsed,
      raw,
      storage,
      buildDocx,
      clock,
    });
  } catch (err) {
    if (raw && !err.rawAiText) err.rawAiText = raw;
    throw err;
  }
}

function errorMessage(err) {
  return err?.message || String(err || "Unknown resource generation error");
}

async function runQueueForTutor(createdBy, deps) {
  const {
    db,
    clock,
    generationPipeline = runGenerationPipeline,
    repairPipeline = runRepairPipeline,
  } = deps;
  if (!db) throw new TypeError("runQueueForTutor requires db");
  if (!createdBy) throw new TypeError("runQueueForTutor requires createdBy");

  const outcomes = [];
  while (true) {
    const job = await claimNextPendingJobForTutor({ db, createdBy, clock });
    if (!job) return outcomes;

    const jobRef = db.collection("resourceJobs").doc(job.jobId);
    const attemptRepair = async () => {
      try {
        return {
          result: await repairPipeline(job, deps),
          error: null,
        };
      } catch (err) {
        if (err?.rawAiText) job.generatedJson = err.rawAiText;
        return {
          result: null,
          error: errorMessage(err),
        };
      }
    };

    try {
      let result;
      let repaired = false;
      let repairError = null;
      if (canRepairJob(job)) {
        const repairAttempt = await attemptRepair();
        result = repairAttempt.result;
        repairError = repairAttempt.error;
        repaired = Boolean(result);
      }

      if (!result) {
        try {
          result = await generationPipeline(job, deps);
        } catch (err) {
          if (err?.rawAiText) {
            const generationError = errorMessage(err);
            job.generatedJson = err.rawAiText;
            job.error = generationError;
            job.lastError = generationError;

            const repairAttempt = await attemptRepair();
            result = repairAttempt.result;
            repairError = repairAttempt.error || repairError;
            repaired = Boolean(result);
          }
          if (!result) {
            if (job.generatedJson) err.rawAiText = job.generatedJson;
            throw err;
          }
        }
      }
      await jobRef.update({
        ...result,
        status: "complete",
        completedAt: now(clock),
        error: null,
        lastError: null,
      });
      outcomes.push({
        jobId: job.jobId,
        status: "complete",
        repaired,
        ...(repairError ? { repairError } : {}),
      });
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

async function retryResourceJobImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("retryResourceJobImpl requires db");
  if (!actor?.uid) throw new TypeError("retryResourceJobImpl requires actor.uid");

  const jobRef = db.collection("resourceJobs").doc(payload.jobId);
  const snap = await jobRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Resource job not found: ${payload.jobId}`);
  }

  const job = snap.data() || {};
  if (actor.role !== "admin" && job.createdBy !== actor.uid) {
    throw new HttpsError("permission-denied", "You can only retry your own resource jobs");
  }
  if (job.status !== "failed") {
    throw new HttpsError("failed-precondition", "Only failed resource jobs can be retried");
  }

  await jobRef.update({
    status: "pending",
    error: null,
    lastError: job.error || null,
    startedAt: null,
    completedAt: null,
  });

  const outcomes = await (deps.runQueueForTutor || runQueueForTutor)(
    job.createdBy,
    deps
  );
  return { jobId: payload.jobId, status: "pending", outcomes };
}

async function deleteStorageObject({ storage, path }) {
  if (!path) return { attempted: false, deleted: false };
  try {
    await storage.bucket().file(path).delete();
    return { attempted: true, deleted: true };
  } catch (err) {
    const code = err?.code || err?.errors?.[0]?.reason;
    if (code === 404 || code === "notFound") {
      return { attempted: true, deleted: false, missing: true };
    }
    logger.warn("[deleteResourceJob] storage delete failed", {
      path,
      errorMessage: err?.message,
    });
    return {
      attempted: true,
      deleted: false,
      errorMessage: err?.message || "Storage delete failed",
    };
  }
}

async function deleteResourceJobImpl({ payload, actor, deps }) {
  const { db, storage, clock } = deps;
  if (!db) throw new TypeError("deleteResourceJobImpl requires db");
  if (!storage) throw new TypeError("deleteResourceJobImpl requires storage");
  if (!actor?.uid) throw new TypeError("deleteResourceJobImpl requires actor.uid");

  const jobRef = db.collection("resourceJobs").doc(payload.jobId);
  const snap = await jobRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Resource job not found: ${payload.jobId}`);
  }

  const job = snap.data() || {};
  if (actor.role !== "admin" && job.createdBy !== actor.uid) {
    throw new HttpsError("permission-denied", "You can only delete your own resource jobs");
  }
  if (!["complete", "failed"].includes(job.status)) {
    throw new HttpsError("failed-precondition", "Only completed or failed resource jobs can be deleted");
  }

  const outputDelete = await deleteStorageObject({
    storage,
    path: job.outputPath,
  });
  const uploadDelete = await deleteStorageObject({
    storage,
    path: job.uploadedFilePath,
  });
  await jobRef.delete();

  await writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action: "resource.delete",
      targetType: "resourceJob",
      targetId: payload.jobId,
      targetName: job.outputFileName || job.resourceType || payload.jobId,
      before: {
        createdBy: job.createdBy,
        studentId: job.studentId,
        studentName: job.studentName,
        subject: job.subject,
        year: job.year,
        resourceType: job.resourceType,
        status: job.status,
      },
      payloadSummary: {
        outputDelete,
        uploadDelete,
      },
    },
    { logger, clock }
  );

  return {
    jobId: payload.jobId,
    deleted: true,
    outputDelete,
    uploadDelete,
  };
}

async function recoverStuckResourceJobsImpl({ deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("recoverStuckResourceJobsImpl requires db");

  const currentDate = clock ? clock() : new Date();
  const threshold = fromDate(new Date(currentDate.getTime() - RESOURCE_JOB_RECOVERY_MS));
  const snap = await db
    .collection("resourceJobs")
    .where("status", "==", "processing")
    .where("startedAt", "<", threshold)
    .get();

  const createdBySet = new Set();
  const recoveredJobIds = [];
  for (const doc of snap.docs) {
    const job = doc.data() || {};
    await doc.ref.update({
      status: "pending",
      startedAt: null,
      error: "Job recovered after timeout",
    });
    recoveredJobIds.push(doc.id);
    if (job.createdBy) createdBySet.add(job.createdBy);
  }

  const tutorsQueued = [...createdBySet];
  for (const createdBy of tutorsQueued) {
    await (deps.runQueueForTutor || runQueueForTutor)(createdBy, deps);
  }

  return { recoveredJobIds, tutorsQueued };
}

const processResourceJob = onDocumentCreated(
  {
    document: "resourceJobs/{jobId}",
    ...RESOURCE_WORKER_OPTIONS,
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

const retryResourceJob = onCall(
  RESOURCE_WORKER_OPTIONS,
  async (request) => {
    const actor = requireResourceStaffCallable(request);
    let payload;
    try {
      payload = validateRetryResourceJobPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }

    try {
      return await retryResourceJobImpl({
        payload,
        actor,
        deps: {
          db: admin.firestore(),
          storage: admin.storage(),
          anthropicApiKey: anthropicApiKey.value(),
        },
      });
    } catch (err) {
      logger.error("[retryResourceJob] failed", {
        jobId: payload?.jobId,
        actorUid: actor.uid,
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

const deleteResourceJob = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireResourceStaffCallable(request);
    let payload;
    try {
      payload = validateDeleteResourceJobPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }

    try {
      return await deleteResourceJobImpl({
        payload,
        actor,
        deps: {
          db: admin.firestore(),
          storage: admin.storage(),
        },
      });
    } catch (err) {
      logger.error("[deleteResourceJob] failed", {
        jobId: payload?.jobId,
        actorUid: actor.uid,
        errorMessage: err?.message,
      });
      throw toHttpsError(err);
    }
  }
);

const recoverStuckResourceJobs = onSchedule(
  {
    schedule: "every 10 minutes",
    ...RESOURCE_WORKER_OPTIONS,
  },
  async () => {
    try {
      return await recoverStuckResourceJobsImpl({
        deps: {
          db: admin.firestore(),
          storage: admin.storage(),
          anthropicApiKey: anthropicApiKey.value(),
        },
      });
    } catch (err) {
      logger.error("[recoverStuckResourceJobs] failed", {
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
  deleteResourceJob,
  deleteResourceJobImpl,
  deleteStorageObject,
  downloadUploadedContent,
  maxTokensForResourceJob,
  outputPathForJob,
  processResourceJob,
  processResourceJobImpl,
  recoverStuckResourceJobs,
  recoverStuckResourceJobsImpl,
  requireResourceStaffCallable,
  retryResourceJob,
  retryResourceJobImpl,
  runRepairPipeline,
  runGenerationPipeline,
  runQueueForTutor,
  submitResourceJob,
  validateRetryResourceJobPayload,
  validateDeleteResourceJobPayload,
  validateSubmitResourceJobPayload,
};
