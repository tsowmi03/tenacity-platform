"use strict";

const { randomUUID } = require("crypto");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { callAnthropicForResource } = require("./apiClient");
const {
  ANSWER_MODES,
  answerModeForJob,
  includesWorking,
} = require("./answerMode");
const { buildResourceDocx, buildOutputFileName } = require("./builder");
const { isDiagramRenderError } = require("./builder/diagrams");
const { describeResourceFailure } = require("./failure");
const { extractTextFromBuffer } = require("./fileExtractor");
const { buildSystemPrompt, buildUserMessage, isEnglishSubject } = require("./promptBuilder");
const { writeAuditLog } = require("../shared/auditLog");
const { toHttpsError } = require("../shared/errors");
const {
  assertArray,
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
const { normaliseTopics } = require("./topicTaxonomy");

const SUBJECTS = ["maths", "english"];
const STAFF_ROLES = ["admin", "tutor"];
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const RESOURCE_JOB_LEASE_MS = 10 * 60 * 1000;
const RESOURCE_MAX_REFERENCE_FILES = 5;
const RESOURCE_DEFAULT_MAX_TOKENS = 24000;
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
  const hasAnswerMode =
    input?.answerMode !== undefined &&
    input?.answerMode !== null &&
    input?.answerMode !== "";
  const hasIncludeWorking =
    input?.includeWorking !== undefined &&
    input?.includeWorking !== null;
  const payload = validateShape(input, {
    studentId: (value) => assertString(value, "studentId", { max: 160 }),
    subject: (value) => assertEnum(value, "subject", SUBJECTS),
    year: (value) => assertNumber(value, "year", { min: 5, max: 10, integer: true }),
    resourceType: (value) => assertEnum(value, "resourceType", RESOURCE_TYPES),
    answerMode: (value) => {
      if (value === undefined || value === null || value === "") return null;
      return assertEnum(value, "answerMode", ANSWER_MODES);
    },
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
    uploadedFiles: (value) => {
      if (value === undefined || value === null) return [];
      return assertArray(value, "uploadedFiles", {
        max: RESOURCE_MAX_REFERENCE_FILES,
      }).map((file, index) => {
        if (!file || typeof file !== "object" || Array.isArray(file)) {
          throw new HttpsError(
            "invalid-argument",
            `uploadedFiles[${index}] must be an object`
          );
        }
        return {
          path: assertString(file.path, `uploadedFiles[${index}].path`, { max: 500 }),
          name: assertString(file.name, `uploadedFiles[${index}].name`, { max: 240 }),
        };
      });
    },
  });

  if (hasAnswerMode) {
    payload.includeWorking = payload.answerMode === "worked";
  } else if (hasIncludeWorking) {
    payload.answerMode = payload.includeWorking ? "worked" : "answers";
  } else {
    payload.answerMode = "none";
    payload.includeWorking = false;
  }

  if (
    ENGLISH_ONLY_RESOURCE_TYPES.has(payload.resourceType) &&
    payload.subject !== "english"
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${payload.resourceType} is only available for English resources`
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

  if (!payload.uploadedFiles.length && payload.uploadedFilePath) {
    payload.uploadedFiles = [{
      path: payload.uploadedFilePath,
      name: payload.uploadedFileName,
    }];
  }

  for (const file of payload.uploadedFiles) {
    if (!file.path.startsWith("resources/uploads/")) {
      throw new HttpsError(
        "invalid-argument",
        "Reference file paths must point inside resources/uploads"
      );
    }
  }

  const firstUploadedFile = payload.uploadedFiles[0] || null;
  payload.uploadedFilePath = firstUploadedFile?.path || null;
  payload.uploadedFileName = firstUploadedFile?.name || null;

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

function validateCancelResourceJobPayload(input) {
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
    answerMode: payload.answerMode,
    includeWorking: payload.answerMode === "worked",
    customPrompt: payload.customPrompt,
    uploadedFiles: payload.uploadedFiles,
    uploadedFilePath: payload.uploadedFilePath,
    uploadedFileName: payload.uploadedFileName,
    model: MODEL_MAP[payload.resourceType],
    status: "pending",
    generatedJson: null,
    outputPath: null,
    outputFileName: null,
    extractedTopics: [],
    warnings: [],
    error: null,
    errorCode: null,
    errorDetail: null,
    lastError: null,
    lastErrorCode: null,
    lastErrorDetail: null,
    cancelRequested: false,
    attemptId: null,
    attemptCount: 0,
    lastAttemptId: null,
    leaseExpiresAt: null,
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
  return includesWorking(answerModeForJob(job))
    ? RESOURCE_WORKING_MAX_TOKENS
    : RESOURCE_DEFAULT_MAX_TOKENS;
}

const RESOURCE_CANCELLED_CODE = "RESOURCE_CANCELLED";

class ResourceCancelledError extends Error {
  constructor(message = "Resource generation was cancelled") {
    super(message);
    this.name = "ResourceCancelledError";
    this.code = RESOURCE_CANCELLED_CODE;
    this.cancelled = true;
  }
}

function isCancellationError(err) {
  return Boolean(
    err &&
      (err.cancelled === true ||
        err.code === RESOURCE_CANCELLED_CODE ||
        err.name === "APIUserAbortError" ||
        err.name === "AbortError")
  );
}

function throwIfCancelled(deps) {
  if (deps?.isCancelled?.() || deps?.signal?.aborted) {
    throw new ResourceCancelledError();
  }
}

/**
 * Watch a processing job for a cancel request and abort the in-flight AI call
 * the moment `cancelRequested` is set. Backed by a Firestore document listener
 * so cancellation is near-instant rather than polled. Injectable via
 * `deps.startCancelWatcher` for tests.
 */
function startCancelWatcher({ jobRef, attemptId }) {
  const controller = new AbortController();
  let cancelled = false;
  let unsubscribe = () => {};

  if (typeof jobRef?.onSnapshot === "function") {
    unsubscribe = jobRef.onSnapshot(
      (snap) => {
        const data = (snap && snap.data && snap.data()) || {};
        if (data.cancelRequested && (!attemptId || data.attemptId === attemptId)) {
          cancelled = true;
          controller.abort();
        }
      },
      () => {}
    );
  }

  return {
    signal: controller.signal,
    isCancelled: () => cancelled || controller.signal.aborted,
    stop: () => {
      try {
        unsubscribe();
      } catch (_) {
        /* listener already detached */
      }
    },
  };
}

async function createResourceJobImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createResourceJobImpl requires db");
  if (!actor?.uid) throw new TypeError("createResourceJobImpl requires actor.uid");
  if (payload.uploadedFiles.some(
    (file) => !file.path.startsWith(`resources/uploads/${actor.uid}/`)
  )) {
    throw new HttpsError(
      "permission-denied",
      "Uploaded reference paths must belong to the signed-in user"
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

async function claimNextPendingJobForTutor({
  db,
  createdBy,
  clock,
  attemptIdFactory = randomUUID,
}) {
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
    const pendingJob = pendingDoc.data() || {};
    const attemptId = attemptIdFactory();
    const startedDate = clock ? clock() : new Date();
    const startedAt = fromDate(startedDate);
    const leaseExpiresAt = fromDate(
      new Date(startedDate.getTime() + RESOURCE_JOB_LEASE_MS)
    );
    const patch = {
      status: "processing",
      attemptId,
      attemptCount: (Number(pendingJob.attemptCount) || 0) + 1,
      leaseExpiresAt,
      startedAt,
      warnings: [],
      error: null,
      errorCode: null,
      errorDetail: null,
      cancelRequested: false,
    };
    tx.update(pendingDoc.ref, patch);

    return {
      ...pendingJob,
      ...patch,
      jobId: pendingDoc.id,
      ref: pendingDoc.ref,
    };
  });
}

function uploadedFilesForJob(job = {}) {
  if (Array.isArray(job.uploadedFiles) && job.uploadedFiles.length) {
    const filesByPath = new Map();
    for (const file of job.uploadedFiles) {
      if (file?.path && file?.name && !filesByPath.has(file.path)) {
        filesByPath.set(file.path, { path: file.path, name: file.name });
      }
    }
    if (filesByPath.size) return [...filesByPath.values()];
  }
  if (job.uploadedFilePath && job.uploadedFileName) {
    return [{
      path: job.uploadedFilePath,
      name: job.uploadedFileName,
    }];
  }
  return [];
}

async function downloadUploadedContent({ job, storage, extractText = extractTextFromBuffer }) {
  const uploadedFiles = uploadedFilesForJob(job);
  if (!uploadedFiles.length) return [];
  if (!storage) throw new TypeError("downloadUploadedContent requires storage");

  return Promise.all(uploadedFiles.map(async (file) => {
    const [buffer] = await storage.bucket().file(file.path).download();
    const content = await extractText(buffer, {
      fileName: file.name,
    });
    return {
      fileName: file.name,
      content,
    };
  }));
}

function outputPathForJob(jobId, outputFileName, attemptId = null) {
  const attemptPrefix = attemptId ? `${attemptId}_` : "";
  return `resources/output/${jobId}/${attemptPrefix}${outputFileName}`;
}

function cloneGeneratedResource(resource) {
  return JSON.parse(JSON.stringify(resource));
}

function omitDiagramReference(value, target) {
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value) && value.diagram === target) {
    value.diagram = null;
    value.diagramRequired = false;
    return true;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => omitDiagramReference(child, target));
}

function diagramWarning(err) {
  const label = String(err?.diagramLabel || "diagram");
  const detail = errorMessage(err).slice(0, 500);
  return {
    code: "OPTIONAL_DIAGRAM_OMITTED",
    diagramLabel: label,
    diagramType: String(err?.diagramType || "unknown"),
    message: `Optional diagram for ${label} was omitted: ${detail}`,
  };
}

async function buildDocxWithDiagramReliability({
  resourceType,
  parsed,
  options,
  buildDocx,
}) {
  const resource = cloneGeneratedResource(parsed);
  const warnings = [];

  while (true) {
    try {
      const buffer = await buildDocx(resourceType, resource, options);
      return { buffer, warnings };
    } catch (err) {
      if (!isDiagramRenderError(err)) throw err;
      if (err.diagramRequired !== false) {
        const detail = errorMessage(err);
        err.message = `Required diagram for ${err.diagramLabel || "a question"} could not be rendered: ${detail}`;
        throw err;
      }
      if (!omitDiagramReference(resource, err.diagramSpec)) {
        throw new Error(
          `Optional diagram for ${err.diagramLabel || "a question"} failed, but could not be omitted safely`
        );
      }
      warnings.push(diagramWarning(err));
      if (warnings.length >= 50) {
        throw new Error("Too many optional diagram failures to build this resource safely");
      }
    }
  }
}

/**
 * Pull search topics out of a generated resource for the suggestion system.
 * Handles both schema shapes: `topics: string[]` (practice-paper, study-guide,
 * diagnostic-test, mixed-review, annotation-task, essay-scaffold) and
 * `topic: string` (worksheet, topic-booklet, custom). All values are normalised
 * through the canonical taxonomy so the same concept stores the same string.
 */
function extractJobTopics(parsed) {
  if (Array.isArray(parsed?.topics)) {
    const topics = normaliseTopics(parsed.topics);
    if (topics.length) return topics;
  }
  if (typeof parsed?.topic === "string") {
    return normaliseTopics([parsed.topic]);
  }
  return [];
}

async function saveGeneratedResource({ job, parsed, raw, storage, buildDocx, clock }) {
  const answerMode = answerModeForJob(job);
  const outputFileName = buildOutputFileName({
    resourceType: job.resourceType,
    title: parsed.title,
    studentName: job.studentName,
    year: job.year,
    subject: job.subject,
    date: clock ? clock() : new Date(),
  });
  const { buffer: docxBuffer, warnings } = await buildDocxWithDiagramReliability({
    resourceType: job.resourceType,
    parsed,
    buildDocx,
    options: {
      studentName: job.studentName,
      subject: job.subject,
      year: job.year,
      answerMode,
    },
  });
  const outputPath = outputPathForJob(job.jobId, outputFileName, job.attemptId);

  await storage.bucket().file(outputPath).save(docxBuffer, {
    metadata: { contentType: DOCX_CONTENT_TYPE },
    resumable: false,
  });

  return {
    outputPath,
    outputFileName,
    generatedJson: raw,
    extractedTopics: extractJobTopics(parsed),
    warnings,
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

  throwIfCancelled(deps);
  const uploadedContent = await downloadUploadedContent({ job, storage, extractText });
  const answerMode = answerModeForJob(job);
  const systemPrompt = buildSystemPrompt(job.resourceType, {
    year: job.year,
    subject: job.subject,
    answerMode,
  });
  const userMessage = buildUserMessage(job, uploadedContent);
  throwIfCancelled(deps);
  let { parsed, raw } = await callAi({
    apiKey,
    model: modelForResourceJob(job),
    maxTokens: maxTokensForResourceJob(job),
    systemPrompt,
    userMessage,
    signal: deps.signal,
    // English resources are prose — \n is a paragraph break, not the start of a
    // LaTeX command, so parse with the prose-safe backslash vocabulary.
    mathBearing: !isEnglishSubject(job.subject),
  });
  throwIfCancelled(deps);

  // Verification pass: clean and cross-check maths working out
  if (includesWorking(answerMode) && job.subject === "maths" && Array.isArray(parsed?.answers)) {
    parsed = await verifyMathsAnswers({ job, parsed, apiKey, callAi, signal: deps.signal });
    throwIfCancelled(deps);
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
async function verifyMathsAnswers({ job, parsed, apiKey, signal, callAi = callAnthropicForResource }) {
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
      signal,
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
    // A cancellation must abort the whole job, not be swallowed as a soft failure.
    if (isCancellationError(err)) throw err;
    // Verification is otherwise best-effort — never block generation
    logger.warn("Answer verification pass failed (using original answers)", {
      error: err?.message,
    });
    return parsed;
  }
}

function buildRepairSystemPrompt(job) {
  const answerMode = answerModeForJob(job);
  if (job.repairMode === "diagram") {
    return `${buildSystemPrompt(job.resourceType, {
      year: job.year,
      subject: job.subject,
      answerMode,
    })}

Diagram repair mode:
- The user will provide a previous model response whose required diagram could not be rendered safely.
- Preserve every question, answer, mark, section, title, and all non-diagram content.
- Correct only the failing diagram object and its diagramRequired flag.
- Keep diagramRequired true when the question depends on the diagram.
- Use only a supported diagram type and its documented semantic fields.
- Do not add renderer layout fields such as coordinates, canvas size, paths, SVG, scale, or positioning.
- Return the complete corrected resource as valid JSON. No markdown code fences. No explanation.`;
  }

  return `${buildSystemPrompt(job.resourceType, {
    year: job.year,
    subject: job.subject,
    answerMode,
  })}

Repair mode:
- The user will provide a previous model response that failed JSON parsing or DOCX schema validation.
- Preserve the educational content, question intent, marks, answers, and marking guide as much as possible.
- Fix only the JSON structure and schema compatibility issues.
- Return ONLY valid JSON matching the schema above. No markdown code fences. No explanation.`;
}

function buildRepairUserMessage(job) {
  const previous = String(job.generatedJson || "").trim();
  // Prefer the technical detail (when present) so the repair prompt sees the
  // real failure reason rather than the friendlier tutor-facing summary.
  const error = String(
    job.errorDetail || job.error || job.lastErrorDetail || job.lastError || ""
  ).trim();
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

function diagramRepairModeForJob(job) {
  return ["DIAGRAM_LAYOUT_ERROR", "DIAGRAM_RENDER_ERROR"].includes(
    job?.errorCode || job?.lastErrorCode
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

  throwIfCancelled(deps);
  const { parsed, raw } = await callAi({
    apiKey,
    model: modelForResourceJob(job),
    maxTokens: maxTokensForResourceJob(job),
    systemPrompt: buildRepairSystemPrompt(job),
    userMessage: buildRepairUserMessage(job),
    signal: deps.signal,
    mathBearing: !isEnglishSubject(job.subject),
  });
  throwIfCancelled(deps);

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

async function finalizeResourceJobAttempt({ db, jobId, attemptId, patch }) {
  if (!db) throw new TypeError("finalizeResourceJobAttempt requires db");
  if (!jobId) throw new TypeError("finalizeResourceJobAttempt requires jobId");
  if (!attemptId) throw new TypeError("finalizeResourceJobAttempt requires attemptId");

  const jobRef = db.collection("resourceJobs").doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return false;

    const current = snap.data() || {};
    if (current.status !== "processing" || current.attemptId !== attemptId) {
      return false;
    }

    tx.update(jobRef, {
      ...patch,
      attemptId: null,
      lastAttemptId: attemptId,
      leaseExpiresAt: null,
    });
    return true;
  });
}

async function runQueueForTutor(createdBy, deps) {
  const {
    db,
    storage,
    clock,
    generationPipeline = runGenerationPipeline,
    repairPipeline = runRepairPipeline,
  } = deps;
  if (!db) throw new TypeError("runQueueForTutor requires db");
  if (!createdBy) throw new TypeError("runQueueForTutor requires createdBy");

  const outcomes = [];
  while (true) {
    const job = await claimNextPendingJobForTutor({
      db,
      createdBy,
      clock,
      attemptIdFactory: deps.attemptIdFactory,
    });
    if (!job) return outcomes;

    if (diagramRepairModeForJob(job)) job.repairMode = "diagram";

    // Watch this attempt for a cancel request and abort the in-flight AI call.
    const watcher = (deps.startCancelWatcher || startCancelWatcher)({
      jobRef: job.ref,
      attemptId: job.attemptId,
    });
    const jobDeps = {
      ...deps,
      signal: watcher.signal,
      isCancelled: watcher.isCancelled,
    };

    const attemptRepair = async () => {
      try {
        return {
          result: await repairPipeline(job, jobDeps),
          error: null,
        };
      } catch (err) {
        if (isCancellationError(err)) throw err;
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
          result = await generationPipeline(job, jobDeps);
        } catch (err) {
          if (isCancellationError(err)) throw err;
          if (err?.rawAiText) {
            const generationError = errorMessage(err);
            job.generatedJson = err.rawAiText;
            job.error = generationError;
            job.lastError = generationError;
            job.errorCode = err.code || null;
            job.lastErrorCode = err.code || null;
            job.repairMode = isDiagramRenderError(err) ? "diagram" : "schema";

            const repairAttempt = await attemptRepair();
            result = repairAttempt.result;
            repairError = repairAttempt.error || repairError;
            repaired = Boolean(result);
            if (!result && repairAttempt.error && isDiagramRenderError(err)) {
              err.message = `${generationError} Diagram repair failed: ${repairAttempt.error}`;
            }
          }
          if (!result) {
            if (job.generatedJson) err.rawAiText = job.generatedJson;
            throw err;
          }
        }
      }
      const finalized = await finalizeResourceJobAttempt({
        db,
        jobId: job.jobId,
        attemptId: job.attemptId,
        patch: {
          ...result,
          status: "complete",
          completedAt: now(clock),
          error: null,
          errorCode: null,
          errorDetail: null,
          lastError: null,
          lastErrorCode: null,
          lastErrorDetail: null,
          cancelRequested: false,
        },
      });
      if (!finalized) {
        if (result.outputPath && storage) {
          await deleteStorageObject({ storage, path: result.outputPath });
        }
        logger.warn("[runQueueForTutor] stale attempt completion ignored", {
          jobId: job.jobId,
          attemptId: job.attemptId,
        });
        outcomes.push({ jobId: job.jobId, status: "superseded" });
        continue;
      }
      outcomes.push({
        jobId: job.jobId,
        status: "complete",
        repaired,
        ...(result.warnings?.length ? { warnings: result.warnings } : {}),
        ...(repairError ? { repairError } : {}),
      });
    } catch (err) {
      // A tutor stopped the job mid-flight: finalize as cancelled, not failed.
      if (isCancellationError(err) || watcher.isCancelled()) {
        const finalized = await finalizeResourceJobAttempt({
          db,
          jobId: job.jobId,
          attemptId: job.attemptId,
          patch: {
            status: "cancelled",
            cancelRequested: false,
            error: null,
            errorCode: null,
            errorDetail: null,
            completedAt: now(clock),
          },
        });
        if (!finalized) {
          outcomes.push({ jobId: job.jobId, status: "superseded" });
          continue;
        }
        logger.info("[runQueueForTutor] job cancelled by request", {
          jobId: job.jobId,
          attemptId: job.attemptId,
        });
        outcomes.push({ jobId: job.jobId, status: "cancelled" });
        continue;
      }

      const { message: friendlyError, detail } = describeResourceFailure(err);
      const patch = {
        status: "failed",
        error: friendlyError,
        errorCode: err?.code || null,
        errorDetail: detail,
        cancelRequested: false,
        completedAt: now(clock),
      };
      if (err?.rawAiText) {
        patch.generatedJson = err.rawAiText;
      }
      const finalized = await finalizeResourceJobAttempt({
        db,
        jobId: job.jobId,
        attemptId: job.attemptId,
        patch,
      });
      if (!finalized) {
        logger.warn("[runQueueForTutor] stale attempt failure ignored", {
          jobId: job.jobId,
          attemptId: job.attemptId,
          errorMessage: patch.error,
        });
        outcomes.push({ jobId: job.jobId, status: "superseded" });
        continue;
      }
      outcomes.push({ jobId: job.jobId, status: "failed", error: patch.error });
    } finally {
      watcher.stop();
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
  if (!["failed", "cancelled"].includes(job.status)) {
    throw new HttpsError(
      "failed-precondition",
      "Only failed or cancelled resource jobs can be retried"
    );
  }

  await jobRef.update({
    status: "pending",
    warnings: [],
    error: null,
    errorCode: null,
    errorDetail: null,
    lastError: job.error || null,
    lastErrorCode: job.errorCode || null,
    lastErrorDetail: job.errorDetail || null,
    cancelRequested: false,
    attemptId: null,
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
  });

  const outcomes = await (deps.runQueueForTutor || runQueueForTutor)(
    job.createdBy,
    deps
  );
  return { jobId: payload.jobId, status: "pending", outcomes };
}

async function cancelResourceJobImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("cancelResourceJobImpl requires db");
  if (!actor?.uid) throw new TypeError("cancelResourceJobImpl requires actor.uid");

  const jobRef = db.collection("resourceJobs").doc(payload.jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Resource job not found: ${payload.jobId}`);
    }

    const job = snap.data() || {};
    if (actor.role !== "admin" && job.createdBy !== actor.uid) {
      throw new HttpsError("permission-denied", "You can only stop your own resource jobs");
    }

    // Still queued: it has not been claimed by a worker, so cancel outright.
    if (job.status === "pending") {
      tx.update(jobRef, {
        status: "cancelled",
        cancelRequested: false,
        error: null,
        errorCode: null,
        errorDetail: null,
        attemptId: null,
        leaseExpiresAt: null,
        startedAt: null,
        completedAt: now(clock),
      });
      return { jobId: payload.jobId, status: "cancelled" };
    }

    // Mid-generation: flag it; the worker's watcher aborts the AI call and
    // finalizes the job as cancelled.
    if (job.status === "processing") {
      tx.update(jobRef, { cancelRequested: true });
      return { jobId: payload.jobId, status: "cancelling" };
    }

    throw new HttpsError(
      "failed-precondition",
      "This job has already finished — there is nothing to stop."
    );
  });
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

async function deleteAttemptOutputs({ storage, jobId, attemptId }) {
  if (!storage || !jobId || !attemptId) return;
  try {
    await storage.bucket().deleteFiles({
      prefix: `resources/output/${jobId}/${attemptId}_`,
    });
  } catch (err) {
    logger.warn("[recoverStuckResourceJobs] stale output cleanup failed", {
      jobId,
      attemptId,
      errorMessage: err?.message,
    });
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
  if (!["complete", "failed", "cancelled"].includes(job.status)) {
    throw new HttpsError(
      "failed-precondition",
      "Only completed, failed, or cancelled resource jobs can be deleted"
    );
  }

  const outputDelete = await deleteStorageObject({
    storage,
    path: job.outputPath,
  });
  const uploadDeletes = await Promise.all(
    uploadedFilesForJob(job).map((file) =>
      deleteStorageObject({
        storage,
        path: file.path,
      })
    )
  );
  const uploadDelete = uploadDeletes[0] || {
    attempted: false,
    deleted: false,
  };
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
        uploadDeletes,
      },
    },
    { logger, clock }
  );

  return {
    jobId: payload.jobId,
    deleted: true,
    outputDelete,
    uploadDelete,
    uploadDeletes,
  };
}

async function recoverStuckResourceJobsImpl({ deps }) {
  const { db, storage, clock } = deps;
  if (!db) throw new TypeError("recoverStuckResourceJobsImpl requires db");

  const currentDate = clock ? clock() : new Date();
  const thresholdDate = new Date(currentDate.getTime() - RESOURCE_JOB_LEASE_MS);
  const threshold = fromDate(thresholdDate);
  const snap = await db
    .collection("resourceJobs")
    .where("status", "==", "processing")
    .where("startedAt", "<", threshold)
    .get();

  const createdBySet = new Set();
  const recoveredJobIds = [];
  for (const doc of snap.docs) {
    const queriedJob = doc.data() || {};
    const queriedAttemptId = queriedJob.attemptId || null;
    const recovered = await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(doc.ref);
      if (!currentSnap.exists) return false;

      const currentJob = currentSnap.data() || {};
      const startedAt = currentJob.startedAt?.toMillis?.();
      const leaseExpiry = currentJob.leaseExpiresAt?.toMillis?.();
      const currentAttemptId = currentJob.attemptId || null;
      const currentAttemptMatches =
        currentAttemptId === null
          ? queriedAttemptId === null && !currentJob.leaseExpiresAt
          : currentAttemptId === queriedAttemptId &&
            Number.isFinite(leaseExpiry) &&
            leaseExpiry < currentDate.getTime();
      if (
        currentJob.status !== "processing" ||
        !Number.isFinite(startedAt) ||
        startedAt >= thresholdDate.getTime() ||
        !currentAttemptMatches
      ) {
        return false;
      }

      tx.update(doc.ref, {
        status: "pending",
        attemptId: null,
        lastAttemptId: queriedAttemptId || currentJob.lastAttemptId || null,
        leaseExpiresAt: null,
        startedAt: null,
        error: "Job recovered after worker lease expired",
      });
      return true;
    });
    if (!recovered) continue;

    await deleteAttemptOutputs({
      storage,
      jobId: doc.id,
      attemptId: queriedAttemptId,
    });
    recoveredJobIds.push(doc.id);
    if (queriedJob.createdBy) createdBySet.add(queriedJob.createdBy);
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

const cancelResourceJob = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireResourceStaffCallable(request);
    let payload;
    try {
      payload = validateCancelResourceJobPayload(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }

    try {
      return await cancelResourceJobImpl({
        payload,
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[cancelResourceJob] failed", {
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
  answerModeForJob,
  buildDocxWithDiagramReliability,
  buildResourceJobDoc,
  cancelResourceJob,
  cancelResourceJobImpl,
  claimNextPendingJobForTutor,
  createResourceJobImpl,
  deleteResourceJob,
  deleteResourceJobImpl,
  deleteAttemptOutputs,
  deleteStorageObject,
  downloadUploadedContent,
  extractJobTopics,
  finalizeResourceJobAttempt,
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
  validateCancelResourceJobPayload,
  validateRetryResourceJobPayload,
  validateDeleteResourceJobPayload,
  validateSubmitResourceJobPayload,
  uploadedFilesForJob,
};
