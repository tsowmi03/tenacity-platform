"use strict";

const { createHash, randomUUID } = require("crypto");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineBoolean, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { callAiForResource } = require("./aiClient");
const {
  ANSWER_MODES,
  answerModeForJob,
  includesWorking,
} = require("./answerMode");
const { buildResourceDocx, buildOutputFileName } = require("./builder");
const { isDiagramRenderError } = require("./builder/diagrams");
const { classifyResourceFailure, describeResourceFailure } = require("./failure");
const { extractTextFromBuffer } = require("./fileExtractor");
const {
  buildResponseSchema,
  buildSplitResponseSchemas,
  buildVerifiedAnswersSchema,
} = require("./responseSchema");
const { buildDiagramFillSchema } = require("./diagramSchema");
const { DIAGRAM_REGISTRY } = require("./diagramRegistry");
const {
  buildDiagramFillPrompt,
  buildSystemPrompt,
  buildUserMessage,
  isEnglishSubject,
} = require("./promptBuilder");
const {
  isPoem,
  planStimulusSelections,
  selectAlternativePublicDomainText,
  sourceVerifiedText,
  sourceVisualStimulus,
} = require("./sourcedText");
const { createPdfPreviewConverter } = require("./pdfPreview");
const { writeAuditLog } = require("../shared/auditLog");
const { toHttpsError } = require("../shared/errors");
const {
  assertArray,
  assertBoolean,
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
const {
  DEFAULT_RESOURCE_MODEL,
  MAIN_MODEL_OPTIONS,
  SOURCE_PLANNER_MODEL,
  assertAllowedMainModel,
  backupModelFor,
  inferModelChoice,
  isAllowedMainModel,
  providerForModel,
} = require("./modelRegistry");
const { normaliseTopics } = require("./topicTaxonomy");

const SUBJECTS = ["maths", "english"];
const STAFF_ROLES = ["admin", "tutor"];
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_CONTENT_TYPE = "application/pdf";
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const openaiApiKey = defineSecret("OPENAI_API_KEY");
// Base URL of the Gotenberg-compatible DOCX→PDF converter used to store a
// preview PDF alongside each generated DOCX (empty = previews disabled, jobs
// complete without one). The default lives in code so it survives every
// deploy; set RESOURCE_PDF_PREVIEW_URL in the function env to point at the
// converter service (private Cloud Run in prod, local Docker in dev).
const pdfPreviewUrl = defineString("RESOURCE_PDF_PREVIEW_URL", { default: "" });
// Overrides the per-type models in modelMap.js when set (empty = use the map).
// Exists so a model upgrade can be rolled back, or a candidate model trialled on
// staging, by changing the function env only — no code change, no redeploy.
const llmModelOverride = defineString("RESOURCE_LLM_MODEL", { default: "" });
const llmFailoverEnabled = defineBoolean("RESOURCE_LLM_FAILOVER_ENABLED", { default: true });
// Feature flag (default ON): source a verified public-domain passage for English
// passage-based resources instead of letting the model invent the text. See
// sourcedText.js. The default lives in code so it survives every deploy; set
// RESOURCE_PD_TEXT_SOURCING=false in the function env only to disable it.
const pdTextSourcing = defineBoolean("RESOURCE_PD_TEXT_SOURCING", { default: true });
// English resource types that are built around a single source passage and so can
// use verified public-domain text in place of a model-invented passage.
const PASSAGE_SOURCING_RESOURCE_TYPES = new Set(["annotation-task"]);
// English resource types that can present a reading stimulus and so pre-source
// verified public-domain text(s) the model builds around. Poems (Wikisource)
// and prose extracts (Gutenberg) are the reliably-sourceable kinds; any that
// fail to verify simply fall back to a model-written text.
const STIMULUS_SOURCING_RESOURCE_TYPES = new Set([
  "practice-paper",
  "worksheet",
  "diagnostic-test",
  "mixed-review",
  "study-guide",
  "essay-scaffold",
]);
// Types whose stimulus is intrinsic — a practice paper always presents reading
// texts, so the verified set is applied even if the model's draft omitted it. For
// every other type the stimulus is model-gated: the sourced text is applied only
// when the model chose to present one.
const STIMULUS_REQUIRED_RESOURCE_TYPES = new Set(["practice-paper"]);
// Must stay comfortably above RESOURCE_WORKER_OPTIONS.timeoutSeconds: the lease
// is what stops a second worker picking up a job while the first is still
// running, so a lease shorter than the function timeout would let a slow job be
// generated twice.
const RESOURCE_JOB_LEASE_MS = 10 * 60 * 1000;
const RESOURCE_MAX_REFERENCE_FILES = 5;
// Output ceiling per generation. max_tokens is a cap, not a reservation — we are
// billed for tokens actually produced, so a high ceiling costs nothing on a
// typical resource but removes the truncation failure mode on a large one.
// Opus 5 tops out at 128k; 96k keeps clear headroom under that. Note thinking
// tokens share this budget, which is the other reason the old 24k was tight.
const RESOURCE_DEFAULT_MAX_TOKENS = 96000;
const RESOURCE_WORKING_MAX_TOKENS = 96000;
// Thinking depth for the main generation pass. "high" rather than "xhigh":
// event-driven Cloud Functions cap at 540s and that budget also has to cover
// answer verification, DOCX build, PDF conversion and upload.
const RESOURCE_GENERATION_EFFORT = "high";
// The mark-scheme verification pass proof-reads an answers array that already
// exists, so it needs neither the depth nor the output room of a full
// generation — but it does need more than the old 8000 now that thinking shares
// the budget.
const RESOURCE_VERIFY_MAX_TOKENS = 32000;
const RESOURCE_VERIFY_EFFORT = "medium";
const RESOURCE_WORKER_OPTIONS = {
  region: "us-central1",
  // 2GiB rather than 1GiB: Cloud Functions scales CPU with memory, so this
  // shortens the DOCX/PDF stage and leaves more of the fixed 540s for the model.
  memory: "2GiB",
  // 540s is the platform maximum for event-driven (onDocumentCreated)
  // functions — it cannot be raised without changing the trigger type.
  timeoutSeconds: 540,
  secrets: [anthropicApiKey, openaiApiKey],
};
// Preview generation is a download, an HTTP conversion and an upload — no model
// call, so it needs neither the Anthropic secret nor the generation worker's
// memory. Its timeout only has to cover the converter's own 60s ceiling.
const RESOURCE_PREVIEW_WORKER_OPTIONS = {
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 120,
};
// The lightweight callables (submit/delete/cancel) do almost no work, but they
// live in this module and so pay its full load cost: the Anthropic SDK, the
// DOCX builders and the diagram renderers are all pulled in before the handler
// runs. That startup footprint measured 261-286 MiB against the 256 MiB default,
// which left them failing their readiness check on a new instance — submissions
// failed intermittently, depending on whether an already-warm instance took the
// call. Marginal overruns are worse than outright ones because they present as
// flakiness rather than a fault, so this leaves real headroom rather than
// trimming to fit.
const RESOURCE_CALLABLE_OPTIONS = {
  region: "us-central1",
  memory: "512MiB",
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
    modelChoice: (value) => {
      if (value === undefined || value === null || value === "") {
        return DEFAULT_RESOURCE_MODEL;
      }
      return assertEnum(value, "modelChoice", MAIN_MODEL_OPTIONS);
    },
    answerMode: (value) => {
      if (value === undefined || value === null || value === "") return null;
      return assertEnum(value, "answerMode", ANSWER_MODES);
    },
    showMarks: (value) => {
      if (value === undefined || value === null) return null;
      return assertBoolean(value, "showMarks");
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
    // RES-23. Set when this generation replays an existing one (Edit-inputs or
    // Regenerate). It records lineage, and it lets the server resolve reference
    // files off the source job rather than trusting the paths in this payload.
    sourceJobId: (value) => nullableString(value, "sourceJobId", { max: 160 }),
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

  if (payload.showMarks === null) {
    payload.showMarks = payload.resourceType === "practice-paper";
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

function validateSubmitResourceRevisionPayload(input) {
  return validateShape(input || {}, {
    sourceJobId: (value) => assertString(value, "sourceJobId", { max: 160 }),
    instruction: (value) =>
      assertString(value, "instruction", { min: 1, max: 2000 }),
  });
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

function buildResourceJobDoc({
  jobId,
  payload,
  actor,
  actorUserData,
  studentData,
  clock,
  lineage = null,
}) {
  const requestedModel = configuredModelForResourceType(
    payload.resourceType,
    payload.modelChoice
  );
  return {
    jobId,
    createdBy: actor.uid,
    createdByName: actorDisplayName({ actor, userData: actorUserData }),
    createdAt: now(clock),
    // RES-23 lineage. Every job belongs to a stack: the resource it descends
    // from, or itself when it is an original. `derivation` says how this
    // version was produced, so history can label it without inferring.
    lineageRootId: lineage?.rootId || jobId,
    derivedFromJobId: lineage?.sourceJobId || null,
    derivation: lineage?.derivation || null,
    revisionInstruction: lineage?.instruction || null,
    revisionChanges: null,
    studentId: payload.studentId,
    studentName: studentDisplayName(studentData, payload.studentId),
    subject: payload.subject,
    year: payload.year,
    resourceType: payload.resourceType,
    answerMode: payload.answerMode,
    showMarks: payload.showMarks,
    includeWorking: payload.answerMode === "worked",
    customPrompt: payload.customPrompt,
    uploadedFiles: payload.uploadedFiles,
    uploadedFilePath: payload.uploadedFilePath,
    uploadedFileName: payload.uploadedFileName,
    modelChoice: payload.modelChoice,
    requestedModel,
    activeModel: requestedModel,
    effectiveModel: null,
    effectiveProvider: null,
    model: requestedModel,
    attemptedModels: [],
    fallbackUsed: false,
    failover: null,
    failureAttempts: [],
    sourcePlanner: {
      requestedModel: SOURCE_PLANNER_MODEL,
      effectiveModel: null,
      effectiveProvider: null,
      fallbackUsed: false,
      reasonCode: null,
    },
    sourceSelections: [],
    sourceCanonicalUrls: [],
    usageByProvider: {},
    status: "pending",
    generatedJson: null,
    outputPath: null,
    outputFileName: null,
    previewPath: null,
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

/**
 * The model this deployment should use for a resource type.
 *
 * RESOURCE_LLM_MODEL overrides MODEL_MAP when set, so the model can be changed
 * or rolled back by editing the function env alone — no redeploy, and no code
 * change needed to fall back if a new model misbehaves in production.
 */
function configuredModelForResourceType(resourceType, requestedModel = null) {
  const override = String(llmModelOverride.value() || "").trim();
  if (override) return assertAllowedMainModel(override, "RESOURCE_LLM_MODEL");
  if (requestedModel) return assertAllowedMainModel(requestedModel);
  return MODEL_MAP[resourceType] || DEFAULT_RESOURCE_MODEL;
}

/**
 * The model to generate a job with.
 *
 * `activeModel` identifies the current attempt and therefore wins during a
 * fallback. Older jobs without the new audit fields infer an allowlisted model
 * from their persisted choice/model, still respecting the emergency override.
 */
function modelForResourceJob(job) {
  if (isAllowedMainModel(job?.activeModel)) return job.activeModel;
  return configuredModelForResourceType(job?.resourceType, inferModelChoice(job));
}

function safetyIdentifierForUid(uid) {
  const value = String(uid || "").trim();
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

function addUsage(target, provider, usage) {
  if (!provider || !usage) return;
  const current = target[provider] || {};
  target[provider] = {
    inputTokens: (Number(current.inputTokens) || 0) + (Number(usage.inputTokens) || 0),
    cachedInputTokens:
      (Number(current.cachedInputTokens) || 0) + (Number(usage.cachedInputTokens) || 0),
    cacheWriteTokens:
      (Number(current.cacheWriteTokens) || 0) + (Number(usage.cacheWriteTokens) || 0),
    outputTokens: (Number(current.outputTokens) || 0) + (Number(usage.outputTokens) || 0),
    reasoningTokens:
      (Number(current.reasoningTokens) || 0) + (Number(usage.reasoningTokens) || 0),
  };
}

function createTrackedAiCaller({ job, deps, callAi, usageByProvider }) {
  return async (request) => {
    try {
      const result = await callAi({
        ...request,
        anthropicApiKey: deps.anthropicApiKey,
        openaiApiKey: deps.openaiApiKey,
        safetyIdentifier: safetyIdentifierForUid(job.createdBy),
      });
      addUsage(usageByProvider, result?.provider, result?.usage);
      return result;
    } catch (err) {
      addUsage(
        usageByProvider,
        err?.provider || providerForModel(request.model),
        err?.usage
      );
      err.usageByProvider = { ...usageByProvider };
      throw err;
    }
  };
}

function sanitizedSourceSelection(selection) {
  if (!selection || typeof selection !== "object") return null;
  return {
    title: String(selection.title || ""),
    author: String(selection.author || ""),
    type: String(selection.type || ""),
    standaloneOnGutenberg: Boolean(selection.standaloneOnGutenberg),
    collectionHint: selection.collectionHint ? String(selection.collectionHint) : null,
    pieceTitle: String(selection.pieceTitle || selection.title || ""),
    approxWordCount: Number(selection.approxWordCount) || 0,
    themes: Array.isArray(selection.themes)
      ? selection.themes.map(String).slice(0, 8)
      : [],
  };
}

function sanitizedVisualSelection(selection) {
  if (!selection || typeof selection !== "object") return null;
  const searchTerms = String(selection.searchTerms || "").trim();
  if (!searchTerms) return null;
  return {
    purpose: String(selection.purpose || "visual-literacy"),
    searchTerms,
    region: selection.region ? String(selection.region) : null,
    task: String(selection.task || ""),
  };
}

function sourceStateFromSourcing({ passageSourcing, stimulusSourcing }) {
  const sourced = passageSourcing?.used
    ? [passageSourcing.sourced]
    : stimulusSourcing?.used
      ? stimulusSourcing.texts
      : [];
  const visuals = stimulusSourcing?.used && Array.isArray(stimulusSourcing.visuals)
    ? stimulusSourcing.visuals
    : [];
  const sourcePlanner = passageSourcing?.planner || stimulusSourcing?.planner || null;
  return {
    ...(sourcePlanner ? { sourcePlanner } : {}),
    sourceSelections: sourced
      .map((item) => sanitizedSourceSelection(item?.selection))
      .filter(Boolean),
    // The planned visual, not the image that was found: replaying a retry
    // re-runs the same lookup, which is what keeps a retried job consistent
    // with the original without storing image bytes on the job document.
    sourceVisuals: visuals
      .map((item) => sanitizedVisualSelection(item?.selection))
      .filter(Boolean),
    sourceCanonicalUrls: [...sourced, ...visuals]
      .map((item) => item?.sourceUrl)
      .filter(Boolean),
  };
}

async function persistAttemptSourceState({ db, job, sourceState }) {
  if (!db || !job?.jobId || !job?.attemptId) return false;
  const ref = db.collection("resourceJobs").doc(job.jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const current = snap.data() || {};
    if (current.status !== "processing" || current.attemptId !== job.attemptId) {
      return false;
    }
    tx.update(ref, sourceState);
    return true;
  });
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

/**
 * Load the job a new generation is being built from — Edit-inputs, Regenerate,
 * or Revise — and check the caller is allowed to act on it.
 *
 * Same rule the portal applies to those actions: the tutor who created the
 * resource, or an admin.
 */
async function loadSourceResourceJob({ db, sourceJobId, actor }) {
  const snap = await db.collection("resourceJobs").doc(sourceJobId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Resource job not found: ${sourceJobId}`);
  }
  const job = snap.data() || {};
  if (actor.role !== "admin" && job.createdBy !== actor.uid) {
    throw new HttpsError(
      "permission-denied",
      "You can only build on your own resource jobs"
    );
  }
  return job;
}

function lineageRootFor(sourceJob, sourceJobId) {
  return sourceJob?.lineageRootId || sourceJob?.jobId || sourceJobId;
}

/**
 * Reference paths a caller is allowed to attach.
 *
 * A tutor may only attach their own uploads — otherwise anyone could read
 * another user's source material by guessing a path. A generation replayed from
 * an existing job is the exception: it carries that job's files by path so
 * nothing is re-uploaded, and those paths belong to whoever created the
 * original. An admin regenerating a tutor's resource is the everyday case, and
 * it used to fail outright with permission-denied whenever the resource had a
 * file attached.
 *
 * So the check stays strict for anything the caller supplies fresh, and widens
 * by exactly the files the source job already had — which loadSourceResourceJob
 * has just confirmed this caller may read.
 */
function assertUploadedFilesAllowed({ uploadedFiles, actor, sourceJob }) {
  const carriedOver = new Set(
    sourceJob ? uploadedFilesForJob(sourceJob).map((file) => file.path) : []
  );
  const disallowed = uploadedFiles.filter(
    (file) =>
      !file.path.startsWith(`resources/uploads/${actor.uid}/`) &&
      !carriedOver.has(file.path)
  );
  if (disallowed.length) {
    throw new HttpsError(
      "permission-denied",
      "Uploaded reference paths must belong to the signed-in user"
    );
  }
}

async function createResourceJobImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createResourceJobImpl requires db");
  if (!actor?.uid) throw new TypeError("createResourceJobImpl requires actor.uid");

  const sourceJob = payload.sourceJobId
    ? await loadSourceResourceJob({ db, sourceJobId: payload.sourceJobId, actor })
    : null;
  assertUploadedFilesAllowed({
    uploadedFiles: payload.uploadedFiles,
    actor,
    sourceJob,
  });

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
    lineage: sourceJob
      ? {
          rootId: lineageRootFor(sourceJob, payload.sourceJobId),
          sourceJobId: payload.sourceJobId,
          derivation: "edited-inputs",
          instruction: null,
        }
      : null,
  });

  await jobRef.set(doc);
  return { jobId: jobRef.id };
}

/**
 * The generation settings a revision inherits from the resource it revises.
 *
 * RES-23 is content-only: a revision changes what the document says, never how
 * it was configured. Everything here is copied from the source job rather than
 * accepted from the client, so answer mode, marks, model and reference files
 * cannot drift as a side effect of asking for a different question.
 */
function revisionPayloadFromSourceJob(sourceJob) {
  const answerMode = answerModeForJob(sourceJob);
  const uploadedFiles = uploadedFilesForJob(sourceJob);
  const firstFile = uploadedFiles[0] || null;
  return {
    studentId: sourceJob.studentId,
    subject: sourceJob.subject,
    year: sourceJob.year,
    resourceType: sourceJob.resourceType,
    modelChoice: inferModelChoice(sourceJob),
    answerMode,
    showMarks:
      typeof sourceJob.showMarks === "boolean"
        ? sourceJob.showMarks
        : sourceJob.resourceType === "practice-paper",
    includeWorking: includesWorking(answerMode),
    customPrompt: sourceJob.customPrompt || "",
    uploadedFiles,
    uploadedFilePath: firstFile?.path || null,
    uploadedFileName: firstFile?.name || null,
  };
}

function assertJobIsRevisable(job) {
  if (job.status !== "complete") {
    throw new HttpsError(
      "failed-precondition",
      "Only a finished resource can be revised"
    );
  }
  if (typeof job.generatedJson !== "string" || !job.generatedJson.trim()) {
    throw new HttpsError(
      "failed-precondition",
      "This resource has no stored generation to revise. Regenerate it first."
    );
  }
}

/**
 * Queue a revision of an existing resource: same inputs, same reference files,
 * plus a tutor's instruction describing the one change to make.
 *
 * This creates a new job rather than mutating the original, so the resource it
 * came from stays downloadable and the pair reads as two versions of one thing.
 */
async function createResourceRevisionImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("createResourceRevisionImpl requires db");
  if (!actor?.uid) {
    throw new TypeError("createResourceRevisionImpl requires actor.uid");
  }

  const sourceJob = await loadSourceResourceJob({
    db,
    sourceJobId: payload.sourceJobId,
    actor,
  });
  assertJobIsRevisable(sourceJob);

  const revisionPayload = revisionPayloadFromSourceJob(sourceJob);
  const [studentSnap, userSnap] = await Promise.all([
    db.collection("students").doc(revisionPayload.studentId).get(),
    db.collection("users").doc(actor.uid).get().catch((err) => {
      logger.warn("[submitResourceRevision] actor user document could not be loaded", {
        actorUid: actor.uid,
        errorMessage: err?.message,
      });
      return null;
    }),
  ]);

  if (!studentSnap.exists) {
    throw new HttpsError(
      "not-found",
      `Student not found: ${revisionPayload.studentId}`
    );
  }

  const jobRef = db.collection("resourceJobs").doc();
  const doc = buildResourceJobDoc({
    jobId: jobRef.id,
    payload: revisionPayload,
    actor,
    actorUserData: userSnap?.exists ? userSnap.data() : null,
    studentData: studentSnap.data() || {},
    clock,
    lineage: {
      rootId: lineageRootFor(sourceJob, payload.sourceJobId),
      sourceJobId: payload.sourceJobId,
      derivation: "revision",
      instruction: payload.instruction.trim(),
    },
  });

  await jobRef.set(doc);
  return { jobId: jobRef.id };
}

const submitResourceJob = onCall(RESOURCE_CALLABLE_OPTIONS, async (request) => {
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

    const fallbackQuery = db
      .collection("resourceJobs")
      .where("createdBy", "==", createdBy)
      .where("status", "==", "fallback_pending")
      .limit(1);
    const fallbackSnap = await tx.get(fallbackQuery);
    if (!fallbackSnap.empty) return null;

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
    const modelChoice = inferModelChoice(pendingJob);
    const requestedModel = isAllowedMainModel(pendingJob.requestedModel)
      ? pendingJob.requestedModel
      : configuredModelForResourceType(pendingJob.resourceType, modelChoice);
    const activeModel = isAllowedMainModel(pendingJob.activeModel)
      ? pendingJob.activeModel
      : requestedModel;
    const attemptedModels = Array.from(new Set([
      ...(Array.isArray(pendingJob.attemptedModels) ? pendingJob.attemptedModels : []),
      activeModel,
    ].filter(isAllowedMainModel)));
    const attemptId = attemptIdFactory();
    const startedDate = clock ? clock() : new Date();
    const startedAt = fromDate(startedDate);
    const leaseExpiresAt = fromDate(
      new Date(startedDate.getTime() + RESOURCE_JOB_LEASE_MS)
    );
    const patch = {
      status: "processing",
      modelChoice,
      requestedModel,
      activeModel,
      attemptedModels,
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
    try {
      const [buffer] = await storage.bucket().file(file.path).download();
      const content = await extractText(buffer, {
        fileName: file.name,
      });
      return {
        fileName: file.name,
        content,
      };
    } catch (err) {
      err.resourceInfrastructure = "upload";
      throw err;
    }
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

async function saveGeneratedResource({ job, parsed, raw, storage, buildDocx, clock, model }) {
  const answerMode = answerModeForJob(job);
  const outputFileName = buildOutputFileName({
    resourceType: job.resourceType,
    title: parsed.title,
    studentName: job.studentName,
    year: job.year,
    subject: job.subject,
    date: clock ? clock() : new Date(),
  });
  let built;
  try {
    built = await buildDocxWithDiagramReliability({
      resourceType: job.resourceType,
      parsed,
      buildDocx,
      options: {
        studentName: job.studentName,
        subject: job.subject,
        year: job.year,
        answerMode,
        showMarks: typeof job.showMarks === "boolean"
          ? job.showMarks
          : job.resourceType === "practice-paper",
      },
    });
  } catch (err) {
    if (!isDiagramRenderError(err) && err?.name !== "ResourceValidationError") {
      err.resourceInfrastructure = "docx";
    }
    throw err;
  }
  const { buffer: docxBuffer, warnings } = built;
  const outputPath = outputPathForJob(job.jobId, outputFileName, job.attemptId);

  try {
    await storage.bucket().file(outputPath).save(docxBuffer, {
      metadata: { contentType: DOCX_CONTENT_TYPE },
      resumable: false,
    });
  } catch (err) {
    err.resourceInfrastructure = "storage";
    throw err;
  }

  // The sibling preview PDF is deliberately NOT built here. Conversion is an
  // HTTP round trip to an external service with a 60s timeout, and this function
  // runs inside the job's fixed 540s budget — so a slow converter used to eat
  // into the time available for generation itself. The DOCX is the deliverable;
  // the preview is a convenience, so it is produced afterwards by
  // generateResourcePreview() once the job is already complete.
  //
  // previewPath is still returned as null so a regenerated job cannot keep a
  // stale preview from an earlier attempt.
  //
  // model is echoed back and persisted onto the job doc alongside these
  // fields (see the completion patch in runQueueForTutor). The job's stored
  // `model` reflects what was requested at creation time, which drifts from
  // reality the moment RESOURCE_LLM_MODEL changes or a job is retried after an
  // upgrade — modelForResourceJob() deliberately prefers the current
  // configuration over that stale value. Persisting the model actually used
  // here keeps the audit trail (and ResourceJobDetailsModal, which reads this
  // field) honest about which model produced a given output.
  return {
    outputPath,
    outputFileName,
    previewPath: null,
    generatedJson: raw,
    extractedTopics: extractJobTopics(parsed),
    warnings,
    model,
  };
}

/**
 * Build the preview PDF for an already-complete job and attach it.
 *
 * Runs outside the generation budget, so a slow or unavailable converter costs
 * the tutor nothing — the DOCX is already downloadable by the time this starts.
 * Best-effort throughout: every failure path leaves the job complete and simply
 * without a preview, which is the same outcome as before this was split out.
 *
 * Returns the preview path, or null when no preview was attached.
 */
async function generateResourcePreview({ job, db, storage, pdfConverter }) {
  if (!db) throw new TypeError("generateResourcePreview requires db");
  if (!storage) throw new TypeError("generateResourcePreview requires storage");
  // No converter configured (RESOURCE_PDF_PREVIEW_URL unset) — previews are off.
  if (!pdfConverter) return null;
  if (!job?.jobId || !job.outputPath) return null;

  const outputPath = job.outputPath;
  const pdfPath = outputPath.replace(/\.docx$/i, ".pdf");

  let pdfBuffer;
  try {
    const [docxBuffer] = await storage.bucket().file(outputPath).download();
    pdfBuffer = await pdfConverter.convert({
      docxBuffer,
      fileName: job.outputFileName,
    });
    await storage.bucket().file(pdfPath).save(pdfBuffer, {
      metadata: { contentType: PDF_CONTENT_TYPE },
      resumable: false,
    });
  } catch (err) {
    logger.warn("[generateResourcePreview] PDF preview conversion failed", {
      jobId: job.jobId,
      errorMessage: err?.message,
    });
    return null;
  }

  // The job may have been retried or deleted while we were converting. Only
  // attach the preview if it still belongs to the output we just converted,
  // otherwise we would point a fresh job at a superseded attempt's PDF.
  //
  // A transaction failure here (not "the job moved on", an actual throw — a
  // transient Firestore error) is caught rather than left to propagate: the
  // trigger fires only on the transition into complete, so once that has
  // already happened there is no later update that would ever retry this, and
  // an uncaught throw here would leave the just-uploaded PDF orphaned in
  // storage forever. Treat it the same as a conversion failure — clean up and
  // report no preview.
  const jobRef = db.collection("resourceJobs").doc(job.jobId);
  let attached = false;
  try {
    attached = await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      if (!snap.exists) return false;
      const current = snap.data() || {};
      if (current.status !== "complete" || current.outputPath !== outputPath) {
        return false;
      }
      tx.update(jobRef, { previewPath: pdfPath });
      return true;
    });
  } catch (err) {
    logger.warn("[generateResourcePreview] failed to attach preview", {
      jobId: job.jobId,
      errorMessage: err?.message,
    });
  }

  if (!attached) {
    // Either the job was superseded (retried/deleted) or attaching it threw
    // above — either way the PDF was uploaded but is not referenced by any
    // job, so it must not be left behind in storage.
    await deleteStorageObject({ storage, path: pdfPath });
    logger.warn("[generateResourcePreview] uploaded preview discarded", {
      jobId: job.jobId,
      outputPath,
    });
    return null;
  }

  return pdfPath;
}

function shouldSourcePassage({ job, enablePdTextSourcing, hasUploadedContent }) {
  return (
    Boolean(enablePdTextSourcing) &&
    isEnglishSubject(job.subject) &&
    PASSAGE_SOURCING_RESOURCE_TYPES.has(job.resourceType) &&
    // A tutor-supplied passage always wins — never override their material.
    !hasUploadedContent
  );
}

/**
 * Attempt to source a verified public-domain passage for the job. Returns
 * { used, sourced, warning }. Never throws: any failure degrades to used:false
 * so generation falls back to the model writing its own passage.
 */
async function maybeSourcePassage({
  job,
  anthropicApiKey,
  openaiApiKey,
  signal,
  sourceText,
  selectAlternative = selectAlternativePublicDomainText,
}) {
  const brief = {
    year: job.year,
    textType: "poem or short story (choose whichever best suits the year level)",
    lengthWords: 400,
    skillFocus: job.customPrompt
      ? `tutor instructions: ${job.customPrompt}`
      : "close reading, inference, tone and language analysis",
    theme: null,
  };
  try {
    const presetSelection = Array.isArray(job.sourceSelections)
      ? job.sourceSelections[0]
      : null;
    let sourced = await sourceText({
      anthropicApiKey,
      openaiApiKey,
      brief,
      selection: presetSelection || undefined,
      signal,
      safetyIdentifier: safetyIdentifierForUid(job.createdBy),
    });
    let planner = sourced?.selection?._planner || job.sourcePlanner || null;
    if (sourced?.ok && sourced.passage) return { used: true, sourced, planner };

    if (sourced?.selection?.title) {
      const alternative = await selectAlternative({
        anthropicApiKey,
        openaiApiKey,
        brief,
        excludedTitles: [sourced.selection.title],
        signal,
        safetyIdentifier: safetyIdentifierForUid(job.createdBy),
      });
      sourced = await sourceText({
        anthropicApiKey,
        openaiApiKey,
        brief,
        selection: alternative,
        signal,
        safetyIdentifier: safetyIdentifierForUid(job.createdBy),
      });
      planner = {
        ...(alternative._planner || planner || {}),
        requestedModel: SOURCE_PLANNER_MODEL,
        fallbackUsed: true,
        reasonCode: "CANONICAL_SOURCE_MISS",
        alternateWorkRequired: true,
      };
      if (sourced?.ok && sourced.passage) return { used: true, sourced, planner };
    }
    return {
      used: false,
      sourced: sourced || null,
      planner,
      warning: "No verified public-domain text found; used model-written passage.",
    };
  } catch (err) {
    if (isCancellationError(err)) throw err;
    return { used: false, sourced: null, warning: `Public-domain sourcing failed: ${err.message}` };
  }
}

/**
 * Overwrite the generated passage fields with the verified source bytes, so the
 * rendered passage is provably the fetched text rather than the model's retype.
 */
function stripVerbatimFlags(parsed) {
  if (!parsed || typeof parsed !== "object") return;
  delete parsed.passageVerbatim;
  if (Array.isArray(parsed.stimulus)) {
    for (const entry of parsed.stimulus) {
      if (entry && typeof entry === "object") delete entry.verbatim;
    }
  }
}

function applySourcedPassage(parsed, sourced) {
  if (!parsed || typeof parsed !== "object") return;
  parsed.passageText = sourced.passage;
  // Only the pipeline may mark a passage verbatim: it exempts the body from
  // the de-AI punctuation backstop, which is safe only for verified sources.
  parsed.passageVerbatim = true;
  parsed.passageTitle = stimulusDisplayTitle(sourced) || parsed.passageTitle;
  parsed.passageAuthor = sourced.author || sourced.selection?.author || parsed.passageAuthor;
  // Where it came from, not the raw link. The canonical URL is still persisted
  // on the job (sourceCanonicalUrls) for auditing, but a printed hyperlink is
  // noise on a page a student writes on.
  parsed.passageSource = sourced.sourceName || sourced.source || parsed.passageSource;
}

function shouldSourceStimulusSet({ job, enablePdTextSourcing }) {
  // Uploaded files do NOT disable sourcing here: uploads are usually context
  // (an assessment notification, a past paper, a copyrighted stimulus booklet
  // the paper should mirror but cannot reprint), so the planner sees excerpts
  // of them and decides — it only stands down when the tutor clearly wants the
  // uploaded text itself to be the material studied.
  return (
    Boolean(enablePdTextSourcing) &&
    isEnglishSubject(job.subject) &&
    STIMULUS_SOURCING_RESOURCE_TYPES.has(job.resourceType)
  );
}

// Build a fetch brief for an already-chosen selection, so the deterministic
// sourcing (Gutenberg/Wikisource) has the length/theme hints it wants without a
// second model-selection call.
function briefForSelection(job, selection) {
  return {
    year: job.year,
    textType: selection.type,
    lengthWords: Number(selection.approxWordCount) || 0,
    skillFocus: job.customPrompt
      ? `tutor instructions: ${job.customPrompt}`
      : "close reading, inference, tone and language analysis",
    theme: Array.isArray(selection.themes) ? selection.themes[0] : null,
  };
}

/**
 * Demand-driven stimulus sourcing. A single cheap planning call decides whether
 * this resource needs reading text(s) and, if so, curates the specific works
 * (kind + count matched to the tutor's request). Only then are those texts
 * fetched — so a skills-based resource fetches nothing, and a poetry paper gets
 * poems while an informational-texts unit gets non-fiction. Uploaded reference
 * documents are shown to the planner as excerpts so it can mirror their kinds
 * and themes with public-domain works (a copyrighted booklet is never
 * reprinted), or stand down when the uploaded text itself is the set text.
 * Best-effort per text: any that cannot be verified is skipped. Never throws
 * (except cancellation, which must abort the whole job).
 */
async function maybeSourceStimulusSet({
  job,
  anthropicApiKey,
  openaiApiKey,
  signal,
  sourceText,
  uploadedContent = null,
  planStimulus = planStimulusSelections,
  selectAlternative = selectAlternativePublicDomainText,
  sourceVisual = sourceVisualStimulus,
}) {
  let plan;
  const persistedSelections = Array.isArray(job.sourceSelections)
    ? job.sourceSelections.filter((selection) => selection?.title)
    : [];
  const persistedVisuals = Array.isArray(job.sourceVisuals)
    ? job.sourceVisuals.filter((selection) => selection?.searchTerms)
    : [];
  if (persistedSelections.length || persistedVisuals.length) {
    plan = {
      needed: true,
      texts: persistedSelections,
      visuals: persistedVisuals,
      planner: job.sourcePlanner || null,
    };
  } else {
    try {
      plan = await planStimulus({
        anthropicApiKey,
        openaiApiKey,
        job,
        uploadedContent,
        signal,
        safetyIdentifier: safetyIdentifierForUid(job.createdBy),
      });
    } catch (err) {
      if (isCancellationError(err)) throw err;
      return {
        used: false,
        texts: [],
        visuals: [],
        planner: null,
        warning: "Stimulus planning failed; used model-written text.",
      };
    }
  }

  const plannedTexts = Array.isArray(plan?.texts) ? plan.texts : [];
  const plannedVisualCount = Array.isArray(plan?.visuals) ? plan.visuals.length : 0;
  if (!plan?.needed || (!plannedTexts.length && !plannedVisualCount)) {
    return { used: false, texts: [], visuals: [], skipped: true, planner: plan?.planner || null };
  }

  const texts = [];
  const attemptedTitles = plannedTexts.map((selection) => selection.title).filter(Boolean);
  let planner = plan.planner || null;
  for (const selection of plannedTexts) {
    try {
      let sourced = await sourceText({
        anthropicApiKey,
        openaiApiKey,
        selection,
        brief: briefForSelection(job, selection),
        signal,
        safetyIdentifier: safetyIdentifierForUid(job.createdBy),
      });
      if (sourced?.ok && sourced.passage) {
        texts.push(sourced);
        continue;
      }

      const alternative = await selectAlternative({
        anthropicApiKey,
        openaiApiKey,
        brief: briefForSelection(job, selection),
        excludedTitles: attemptedTitles,
        signal,
        safetyIdentifier: safetyIdentifierForUid(job.createdBy),
      });
      attemptedTitles.push(alternative.title);
      sourced = await sourceText({
        anthropicApiKey,
        openaiApiKey,
        selection: alternative,
        brief: briefForSelection(job, alternative),
        signal,
        safetyIdentifier: safetyIdentifierForUid(job.createdBy),
      });
      planner = {
        ...(alternative._planner || planner || {}),
        requestedModel: SOURCE_PLANNER_MODEL,
        fallbackUsed: true,
        reasonCode: "CANONICAL_SOURCE_MISS",
        alternateWorkRequired: true,
      };
      if (sourced?.ok && sourced.passage) texts.push(sourced);
    } catch (err) {
      if (isCancellationError(err)) throw err;
      // best-effort: a single failed text must not sink the whole booklet
    }
  }

  // Visuals are sourced after the texts so a resource that is meant to be
  // mostly reading is not held up by an image lookup. Each sourced image adds
  // its near-duplicate key to `usedClusters`, so a second visual cannot come
  // from the same scanned series as the first.
  const visuals = [];
  const plannedVisuals = Array.isArray(plan.visuals) ? plan.visuals : [];
  const usedClusters = new Set();
  for (const selection of plannedVisuals) {
    try {
      const sourced = await sourceVisual({ selection, excludeClusters: usedClusters });
      if (sourced?.ok && sourced.image) {
        usedClusters.add(sourced.cluster);
        visuals.push(sourced);
      }
    } catch (err) {
      if (isCancellationError(err)) throw err;
      // best-effort, exactly as for texts: a failed image must not sink the job
    }
  }

  if (texts.length || visuals.length) {
    // Two different shortfalls, and they need different words. When at least one
    // text was verified the generator is offered the stimulus field and writes
    // its own text for the missing ones. When none was, the field is withheld
    // entirely — so nothing is model-written, and the resource simply ships with
    // the images alone.
    const missingTexts = plannedTexts.length - texts.length;
    const warning = missingTexts <= 0
      ? null
      : texts.length
        ? "Some planned stimulus texts could not be verified and were replaced with model-written text."
        : "No planned stimulus text could be verified; the resource carries only its sourced image(s).";
    return {
      used: true,
      texts,
      visuals,
      planner,
      ...(warning ? { warning } : {}),
    };
  }
  return {
    used: false,
    texts: [],
    visuals: [],
    planner,
    warning: "Planned stimulus texts could not be verified; used model-written text.",
  };
}

// An excerpted work is presented as an extract, matching exam-booklet
// convention ("Extract from Great Expectations") and staying honest about what
// the student is reading.
function stimulusDisplayTitle(sourced) {
  const title = sourced.selection?.title || sourced.title || "";
  return sourced.excerpted && title ? `Extract from ${title}` : title;
}

/**
 * Overwrite the first N entries of the generated stimulus booklet with the N
 * verified source texts, so the rendered booklet is provably the fetched texts
 * (in the same order the model was told to reference as "Text 1", "Text 2",
 * ...). Entries the model added BEYOND the sourced ones are kept: when fewer
 * texts could be verified than the tutor asked for (e.g. a poem was sourced
 * but the requested contemporary prose extract has no public-domain
 * counterpart), the model writes its own original extra text and its questions
 * reference it — deleting it would leave questions pointing at a text that is
 * not in the booklet. Found by a live generation on 2026-07-03.
 */
function applySourcedStimulus(parsed, texts, visuals = []) {
  if (!parsed || typeof parsed !== "object") return;
  const sourcedVisuals = Array.isArray(visuals) ? visuals.filter((item) => item?.image) : [];
  if ((!Array.isArray(texts) || !texts.length) && !sourcedVisuals.length) return;
  const sourced = (Array.isArray(texts) ? texts : []).map((item, index) => ({
    label: `Text ${index + 1}`,
    textType: isPoem(item.selection) ? "poem" : "prose",
    title: stimulusDisplayTitle(item),
    author: item.author || item.selection?.author || "",
    source: item.sourceName || item.source || "",
    body: item.passage,
    // Verified source bytes keep their original punctuation when rendered
    // (exempt from the de-AI backstop). Model-written extras below do not.
    verbatim: true,
  }));
  const existing = Array.isArray(parsed.stimulus) ? parsed.stimulus : [];
  const extras = existing.slice(sourced.length).map((entry, index) => ({
    ...entry,
    label: `Text ${sourced.length + index + 1}`,
  }));

  // Images are appended, never overwritten from the model's output: the model
  // cannot produce image bytes, so it is told how many images the booklet will
  // carry and writes questions against "Image 1", "Image 2" while the pictures
  // themselves arrive only from here.
  const images = sourcedVisuals.map((item, index) => ({
    kind: "image",
    label: `Image ${index + 1}`,
    title: item.title,
    creator: item.creator,
    date: item.date,
    licence: item.licence,
    licenceUrl: item.licenceUrl,
    source: item.sourceName || item.source || "",
    // The planner's task is carried for the generator's benefit, not the
    // page's: it tells the model what the image is for so its questions match.
    // It is deliberately not rendered under the image - the questions ask.
    task: item.selection?.task || "",
    image: item.image,
  }));

  parsed.stimulus = [...sourced, ...extras, ...images];
}

/**
 * Generate a resource whose schema is too large to constrain in one call, as two
 * constrained calls: the teaching content first, then the assessment written
 * against that content, merged into one document.
 *
 * The alternative was leaving the topic booklet — the most-generated type — on
 * the unconstrained path. The cost is one extra call and the quiz being composed
 * in a second pass rather than alongside the content, which is why the
 * assessment prompt is given the content verbatim.
 */
async function generateSplitResource({
  job,
  schemas,
  callAi,
  apiKey,
  model,
  maxTokens,
  answerMode,
  hasStimulus,
  userMessage,
  signal,
}) {
  const mathBearing = !isEnglishSubject(job.subject);
  const sectionPrompt = (section) =>
    buildSystemPrompt(job.resourceType, {
      year: job.year,
      subject: job.subject,
      answerMode,
      section,
      hasStimulus,
    });

  const { parsed: content } = await callAi({
    apiKey,
    model,
    maxTokens,
    effort: RESOURCE_GENERATION_EFFORT,
    systemPrompt: sectionPrompt("content"),
    userMessage,
    signal,
    responseSchema: schemas.content,
    mathBearing,
  });

  const { parsed: assessment } = await callAi({
    apiKey,
    model,
    maxTokens,
    effort: RESOURCE_GENERATION_EFFORT,
    systemPrompt: sectionPrompt("assessment"),
    userMessage: [
      userMessage,
      "---",
      "The booklet's teaching content, already written:",
      JSON.stringify(content, null, 2),
    ].join("\n\n"),
    signal,
    responseSchema: schemas.assessment,
    mathBearing,
  });

  const parsed = { ...content, ...assessment };
  // The stored raw is what a later repair attempt re-reads, and repair rewrites
  // the whole document in one pass — so it needs the merged booklet, not either
  // half on its own.
  return { parsed, raw: JSON.stringify(parsed, null, 2) };
}

/**
 * Every question or part that named a diagram type, in document order.
 *
 * Found by walking for the `diagramType` field rather than by knowing each
 * resource type's layout: questions live under `questions`, `sections[].questions`,
 * `subTopics[].practiceQuestions`, `endQuiz.sections[].questions` and inside
 * `custom` blocks, and a walker cannot fall out of step with that the way a
 * hand-written traversal would.
 */
function collectDiagramTargets(parsed) {
  const targets = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (typeof node.diagramType === "string") targets.push(node);
    for (const value of Object.values(node)) walk(value);
  };
  walk(parsed);
  return targets;
}

function describeDiagramTargets(targets) {
  return targets
    .map((target, index) => {
      const stem = String(target.stem || target.instruction || "").replace(/\s+/g, " ");
      return `${index + 1}. (${target.marks} marks) ${stem}`;
    })
    .join("\n");
}

/**
 * Phase B of maths generation: build the diagram objects the resource asked for,
 * one call per distinct type.
 *
 * The diagram cannot be described in the same schema as the resource — see
 * diagramSchema.js — so generation names the type and this fills it in. Types
 * whose shape no schema can express (recursive, variant, or too slow to compile)
 * run the same call unconstrained, which is exactly the pre-AWP-15 behaviour and
 * is still covered by validation.js and the diagram repair path.
 */
async function fillDiagrams({ job, parsed, callAi, apiKey, model, signal }) {
  const targets = collectDiagramTargets(parsed);
  const wanted = targets.filter((target) => target.diagramType !== "none");

  const byType = new Map();
  for (const target of wanted) {
    if (!byType.has(target.diagramType)) byType.set(target.diagramType, []);
    byType.get(target.diagramType).push(target);
  }

  // One call per distinct type, run concurrently: they share no state beyond the
  // question objects they each write to, and a resource using several types was
  // otherwise paying for them end to end — three types measured 260s of a 540s
  // budget, most of it spent waiting.
  await Promise.all([...byType].map(async ([type, group]) => {
    const definition = DIAGRAM_REGISTRY[type];
    if (!definition) {
      if (group.some((target) => target.diagramRequired !== false)) {
        const err = new Error(`Required diagram type is unsupported: ${type}`);
        err.modelFailure = true;
        err.diagramRequired = true;
        err.diagramLabel = group[0]?.stem || group[0]?.instruction || type;
        throw err;
      }
      return;
    }
    const schema = buildDiagramFillSchema(type);
    try {
      const { parsed: filled } = await callAi({
        apiKey,
        model,
        maxTokens: RESOURCE_VERIFY_MAX_TOKENS,
        effort: RESOURCE_VERIFY_EFFORT,
        systemPrompt: buildDiagramFillPrompt({ job, type, definition, constrained: Boolean(schema) }),
        userMessage: [
          `Produce one "${type}" diagram for each of these ${group.length} item(s), using the matching index.`,
          describeDiagramTargets(group),
        ].join("\n\n"),
        signal,
        responseSchema: schema,
        mathBearing: true,
      });
      for (const entry of filled?.diagrams || []) {
        const target = group[Number(entry?.index) - 1];
        if (target && entry.diagram) target.diagram = entry.diagram;
      }
    } catch (err) {
      if (isCancellationError(err)) throw err;
      if (group.some((target) => target.diagramRequired !== false)) {
        err.modelFailure = true;
        err.diagramRequired = true;
        err.diagramLabel = err.diagramLabel || group[0]?.stem || group[0]?.instruction || type;
        throw err;
      }
      logger.warn("[resource] diagram fill failed", {
        jobId: job.jobId,
        diagramType: type,
        count: group.length,
        reasonCode: classifyResourceFailure(err).reasonCode,
      });
    }
  }));

  for (const target of targets) {
    delete target.diagramType;
    // A question that asked for a diagram and did not get one keeps its stem but
    // loses the requirement — the same degradation buildDocxWithDiagramReliability
    // already applies to a diagram that will not render.
    if (!target.diagram && target.diagramRequired !== false) {
      const err = new Error("A required diagram was not returned by the model");
      err.modelFailure = true;
      err.diagramRequired = true;
      err.diagramLabel = target.stem || target.instruction || "a question";
      throw err;
    }
    if (!target.diagram) target.diagramRequired = false;
  }

  return { requested: wanted.length, filled: wanted.filter((t) => t.diagram).length };
}

/**
 * The answer arrays in a parsed resource, each with a way to write the verified
 * rows back. Most types carry one flat `answers` array; the topic booklet nests
 * two, keyed by sub-topic and by quiz section.
 */
function answerGroupsFor(parsed) {
  const answers = parsed?.answers;
  if (Array.isArray(answers)) {
    return [{ rows: answers, replace: (target, rows) => { target.answers = rows; } }];
  }
  if (!answers || typeof answers !== "object") return [];
  return Object.entries(answers)
    .filter(([, rows]) => Array.isArray(rows) && rows.length)
    .map(([key, rows]) => ({
      rows,
      replace: (target, verified) => { target.answers[key] = verified; },
    }));
}

async function runGenerationPipeline(job, deps) {
  const {
    storage,
    clock,
    callAi = callAiForResource,
    buildDocx = buildResourceDocx,
    extractText = extractTextFromBuffer,
    enablePdTextSourcing = false,
    sourceText = sourceVerifiedText,
    planStimulus = planStimulusSelections,
  } = deps;
  if (!storage) throw new TypeError("runGenerationPipeline requires storage");
  if (!job?.jobId) throw new TypeError("runGenerationPipeline requires job.jobId");

  const generationModel = modelForResourceJob(job);
  const usageByProvider = {};
  const trackedCallAi = createTrackedAiCaller({ job, deps, callAi, usageByProvider });

  throwIfCancelled(deps);
  const uploadedContent = await downloadUploadedContent({ job, storage, extractText });
  const hasUploadedContent = Array.isArray(uploadedContent)
    ? uploadedContent.length > 0
    : Boolean(uploadedContent);
  const answerMode = answerModeForJob(job);

  // Optionally source verified public-domain text before generation, so the
  // model builds the resource around real text instead of inventing it. A
  // single-passage type (annotation task) sources one passage; a stimulus-
  // booklet type (practice paper) sources a set of texts.
  let passageSourcing = { used: false, sourced: null };
  let stimulusSourcing = { used: false, texts: [] };
  if (shouldSourcePassage({ job, enablePdTextSourcing, hasUploadedContent })) {
    passageSourcing = await maybeSourcePassage({
      job,
      anthropicApiKey: deps.anthropicApiKey,
      openaiApiKey: deps.openaiApiKey,
      signal: deps.signal,
      sourceText,
      selectAlternative: deps.selectAlternative,
    });
    if (passageSourcing.used) {
      logger.info("[resource] sourced public-domain passage", {
        jobId: job.jobId,
        source: passageSourcing.sourced.source,
        sourceUrl: passageSourcing.sourced.sourceUrl,
        wordCount: passageSourcing.sourced.wordCount,
      });
    } else if (passageSourcing.warning) {
      logger.warn("[resource] public-domain sourcing skipped", {
        jobId: job.jobId,
        warning: passageSourcing.warning,
      });
    }
    throwIfCancelled(deps);
  } else if (shouldSourceStimulusSet({ job, enablePdTextSourcing })) {
    stimulusSourcing = await maybeSourceStimulusSet({
      job,
      anthropicApiKey: deps.anthropicApiKey,
      openaiApiKey: deps.openaiApiKey,
      signal: deps.signal,
      sourceText,
      uploadedContent,
      planStimulus,
      selectAlternative: deps.selectAlternative,
    });
    if (stimulusSourcing.used) {
      logger.info("[resource] sourced public-domain stimulus", {
        jobId: job.jobId,
        texts: stimulusSourcing.texts.length,
        images: stimulusSourcing.visuals.length,
        regionFallbacks: stimulusSourcing.visuals.filter((v) => v?.regionFallbackUsed).length,
      });
    } else if (stimulusSourcing.skipped) {
      logger.info("[resource] stimulus not needed for this resource", { jobId: job.jobId });
    } else if (stimulusSourcing.warning) {
      logger.warn("[resource] stimulus sourcing skipped", {
        jobId: job.jobId,
        warning: stimulusSourcing.warning,
      });
    }
    throwIfCancelled(deps);
  }

  const sourceState = sourceStateFromSourcing({ passageSourcing, stimulusSourcing });
  if (sourceState.sourcePlanner?.usageByProvider) {
    for (const [provider, usage] of Object.entries(
      sourceState.sourcePlanner.usageByProvider
    )) {
      addUsage(usageByProvider, provider, usage);
    }
  } else if (sourceState.sourcePlanner?.usage) {
    addUsage(usageByProvider, sourceState.sourcePlanner.effectiveProvider, sourceState.sourcePlanner.usage);
  }
  if (sourceState.sourcePlanner) {
    delete sourceState.sourcePlanner.usage;
    delete sourceState.sourcePlanner.usageByProvider;
  }
  await persistAttemptSourceState({ db: deps.db, job, sourceState });

  const sourcedForPrompt = passageSourcing.used
    ? passageSourcing.sourced
    : stimulusSourcing.used
      ? { texts: stimulusSourcing.texts }
      : null;
  const userMessage = buildUserMessage(job, uploadedContent, sourcedForPrompt);
  throwIfCancelled(deps);

  // The stimulus field is offered to the model only when real public-domain
  // text was actually sourced. Without this the planner's verdict never reached
  // the generator: asked for a resource it had judged not to need reading
  // texts, the model wrote its own and passed them off as the stimulus.
  // Building the prompt after sourcing — rather than before, as it used to be —
  // is what lets the schema and the prompt agree on that.
  //
  // Images are counted separately from `hasStimulus`. The stimulus FIELD exists
  // so the model can write reading texts we then overwrite with sourced bytes;
  // offering it for a visual-only resource would invite exactly the invented
  // texts this guard was added to prevent. The model is instead told how many
  // images the booklet will carry, so it can set questions against "Image 1"
  // without ever authoring the images themselves.
  const hasStimulus = stimulusSourcing.used && stimulusSourcing.texts.length > 0;
  const stimulusImages = stimulusSourcing.used
    ? stimulusSourcing.visuals
        .filter((item) => item?.image)
        .map((item) => ({ purpose: item.selection?.purpose, task: item.selection?.task }))
    : [];
  const systemPrompt = buildSystemPrompt(job.resourceType, {
    year: job.year,
    subject: job.subject,
    answerMode,
    hasStimulus,
    stimulusImages,
  });

  const maxTokens = maxTokensForResourceJob(job);
  const splitSchemas = buildSplitResponseSchemas(job.resourceType, {
    subject: job.subject,
    answerMode,
    hasStimulus,
  });

  let { parsed, raw } = splitSchemas
    ? await generateSplitResource({
        job,
        schemas: splitSchemas,
        callAi: trackedCallAi,
        apiKey: null,
        model: generationModel,
        maxTokens,
        answerMode,
        hasStimulus,
        userMessage,
        signal: deps.signal,
      })
    : await trackedCallAi({
        model: generationModel,
        maxTokens,
        effort: RESOURCE_GENERATION_EFFORT,
        systemPrompt,
        userMessage,
        signal: deps.signal,
        // Null for maths until the diagram union lands; English is constrained
        // to a schema, so the response cannot come back as anything but valid
        // JSON.
        responseSchema: buildResponseSchema(job.resourceType, {
          subject: job.subject,
          answerMode,
          hasStimulus,
        }),
        // English resources are prose — \n is a paragraph break, not the start
        // of a LaTeX command, so parse with the prose-safe backslash vocabulary.
        mathBearing: !isEnglishSubject(job.subject),
      });
  throwIfCancelled(deps);

  // Maths questions name the diagram they need; build those now. English
  // resources carry no diagramType, so this is a no-op walk for them.
  const diagramFill = await fillDiagrams({
    job,
    parsed,
    callAi: trackedCallAi,
    apiKey: null,
    model: generationModel,
    signal: deps.signal,
  });
  if (diagramFill.requested) {
    logger.info("[resource] diagrams filled", {
      jobId: job.jobId,
      requested: diagramFill.requested,
      filled: diagramFill.filled,
    });
    // The generation response described diagrams by name only. What is stored —
    // and what a repair attempt would re-read — has to be the document that
    // actually has them.
    raw = JSON.stringify(parsed, null, 2);
  }
  throwIfCancelled(deps);

  // The verbatim flags exempt a body from the de-AI punctuation backstop, so
  // only the pipeline may grant them (below, for verified sources). Scrub any
  // the model emitted for its own text.
  stripVerbatimFlags(parsed);

  // Guarantee the rendered text equals the verified source bytes. The stimulus
  // is applied when the model chose to present a reading text, or unconditionally
  // for types whose stimulus is intrinsic (practice papers), so skill-based
  // resources are never forced to carry a passage they did not ask for.
  if (passageSourcing.used) applySourcedPassage(parsed, passageSourcing.sourced);
  if (stimulusSourcing.used) {
    const modelIncludedStimulus = Array.isArray(parsed.stimulus) && parsed.stimulus.length > 0;
    const applyTexts = modelIncludedStimulus
      || STIMULUS_REQUIRED_RESOURCE_TYPES.has(job.resourceType);
    // Sourced images are applied unconditionally. The model never writes them,
    // so there is no model-authored version to defer to — and the planner
    // asking for a visual is itself the decision that the resource wants one.
    applySourcedStimulus(
      parsed,
      applyTexts ? stimulusSourcing.texts : [],
      stimulusSourcing.visuals
    );
  }

  // Verification pass: clean and cross-check maths working out. A topic booklet
  // carries its answers as { subTopicAnswers, endQuizAnswers } rather than one
  // flat array — the sub-topics restart their question numbering, so a flat
  // array could not say which question it answered. Each group is verified in
  // its own right; guarding on Array.isArray alone would silently skip the
  // booklet, which is the type that most needs the pass.
  if (includesWorking(answerMode) && job.subject === "maths") {
    for (const group of answerGroupsFor(parsed)) {
      const verified = await verifyMathsAnswers({
        job,
        parsed: { ...parsed, answers: group.rows },
        apiKey: null,
        callAi: trackedCallAi,
        signal: deps.signal,
      });
      group.replace(parsed, verified.answers);
      throwIfCancelled(deps);
    }
  }

  try {
    const saved = await saveGeneratedResource({
      job,
      parsed,
      raw,
      storage,
      buildDocx,
      clock,
      model: generationModel,
    });
    const sourceWarnings = [passageSourcing.warning, stimulusSourcing.warning]
      .filter(Boolean)
      .map((message) => ({
        code: "PUBLIC_DOMAIN_SOURCE_FALLBACK",
        message,
      }));
    return {
      ...saved,
      warnings: [...(saved.warnings || []), ...sourceWarnings],
      effectiveModel: generationModel,
      effectiveProvider: providerForModel(generationModel),
      usageByProvider,
      ...sourceState,
    };
  } catch (err) {
    if (raw && !err.rawAiText) err.rawAiText = raw;
    err.usageByProvider = { ...usageByProvider };
    throw err;
  }
}

/**
 * Post-generation verification pass for maths practice paper answers.
 * Asks the active generation model to review every answer+workingOut pair for:
 *  - meta-commentary / self-corrections in workingOut
 *  - answer ≠ working conclusion mismatches
 *  - mathematical errors
 * Returns a new parsed object with the corrected answers array.
 * Any model failure propagates so the queue can repair or fail over rather than
 * silently ship an unverified mark scheme.
 */
async function verifyMathsAnswers({ job, parsed, apiKey, signal, callAi = callAiForResource }) {
  const rows = parsed.answers;
  const answersJson = rows
    .map((row, index) => `${index + 1}. ${JSON.stringify(row)}`)
    .join("\n");
  const systemPrompt = `You are a senior mathematics teacher proof-reading a mark scheme.

For each answer entry, review and correct:
1. CLEAN WORKING: "workingOut" must read like a teacher's whiteboard solution. Remove any "Wait", "Actually", "Let me re-check", "Note:", self-corrections, or meta-commentary. Rewrite those steps cleanly and correctly.
2. CONSISTENCY: The value in "answer" must match exactly what "workingOut" concludes. If they disagree, fix "answer" to match the correct conclusion of the working.
3. ACCURACY: If you spot a calculation error in "workingOut", correct both "workingOut" and "answer".

Return ONLY corrections, as valid JSON, for the entries you actually changed:
{ "corrections": [{ "index": number, "answer": string, "workingOut": string }, ...] }
"index" is the entry's number in the list below. Leave out any entry you would not change. No preamble, no explanation, no markdown code fences.`;

  const userMessage = `Review this mark scheme. Each entry is numbered; return corrections by index.\n\n${answersJson}`;

  try {
    const model = modelForResourceJob(job);
    const { parsed: verifiedParsed } = await callAi({
      apiKey,
      model,
      // Raised from 8000: thinking tokens come out of this budget, and a
      // truncated mark scheme here would silently fall back to the unverified
      // answers below.
      maxTokens: RESOURCE_VERIFY_MAX_TOKENS,
      // Proof-reading an existing answers array is a narrower job than writing
      // the resource, so it runs at lower effort to protect the 540s budget.
      effort: RESOURCE_VERIFY_EFFORT,
      systemPrompt,
      userMessage,
      signal,
      responseSchema: buildVerifiedAnswersSchema(),
    });

    const corrections = Array.isArray(verifiedParsed?.corrections)
      ? verifiedParsed.corrections
      : null;
    if (!corrections) {
      const err = new Error("Answer verification returned an invalid response shape");
      err.modelFailure = true;
      throw err;
    }

    // Merge onto the original rows rather than replacing them: only `answer` and
    // `workingOut` are the pass's business, and everything else on the row —
    // marks, and the sub-topic or section that says which question it answers —
    // has to survive untouched.
    const verifiedAnswers = rows.map((row) => ({ ...row }));
    let applied = 0;
    for (const correction of corrections) {
      const target = verifiedAnswers[Number(correction?.index) - 1];
      if (!target) continue;
      target.answer = correction.answer;
      target.workingOut = correction.workingOut;
      applied += 1;
    }

    logger.info("Answer verification pass completed", {
      questionCount: rows.length,
      corrected: applied,
    });

    return { ...parsed, answers: verifiedAnswers };
  } catch (err) {
    // A cancellation must abort the whole job, not be swallowed as a soft failure.
    if (isCancellationError(err)) throw err;
    err.modelFailure = true;
    throw err;
  }
}

function buildRepairSystemPrompt(job) {
  const answerMode = answerModeForJob(job);
  if (job.repairMode === "diagram") {
    return `${buildSystemPrompt(job.resourceType, {
      year: job.year,
      subject: job.subject,
      answerMode,
      hasStimulus: true,
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
    hasStimulus: true,
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
    clock,
    callAi = callAiForResource,
    buildDocx = buildResourceDocx,
  } = deps;
  if (!storage) throw new TypeError("runRepairPipeline requires storage");
  if (!job?.jobId) throw new TypeError("runRepairPipeline requires job.jobId");
  if (!canRepairJob(job)) {
    throw new Error("Job does not have repairable generated JSON");
  }

  throwIfCancelled(deps);
  const answerMode = answerModeForJob(job);
  const repairModel = modelForResourceJob(job);
  const usageByProvider = {};
  const trackedCallAi = createTrackedAiCaller({ job, deps, callAi, usageByProvider });
  const { parsed, raw } = await trackedCallAi({
    model: repairModel,
    maxTokens: maxTokensForResourceJob(job),
    effort: RESOURCE_GENERATION_EFFORT,
    systemPrompt: buildRepairSystemPrompt(job),
    userMessage: buildRepairUserMessage(job),
    signal: deps.signal,
    // Same schema as the generation being repaired, so a repair cannot drift off
    // shape and fail validation a step later. Two deliberate exceptions:
    // stimulus stays permitted, because repair must preserve what the document
    // already had rather than strip it for sourcing nothing this time; and maths
    // is repaired unconstrained, because the generation schema pins `diagram` to
    // null and would delete every diagram the fill pass just built.
    responseSchema: isEnglishSubject(job.subject)
      ? buildResponseSchema(job.resourceType, {
          subject: job.subject,
          answerMode,
          hasStimulus: true,
        })
      : null,
    mathBearing: !isEnglishSubject(job.subject),
  });
  throwIfCancelled(deps);

  try {
    const saved = await saveGeneratedResource({
      job,
      parsed,
      raw,
      storage,
      buildDocx,
      clock,
      model: repairModel,
    });
    return {
      ...saved,
      effectiveModel: repairModel,
      effectiveProvider: providerForModel(repairModel),
      usageByProvider,
    };
  } catch (err) {
    if (raw && !err.rawAiText) err.rawAiText = raw;
    err.usageByProvider = { ...usageByProvider };
    throw err;
  }
}

function isRevisionJob(job) {
  return job?.derivation === "revision" && Boolean(job?.derivedFromJobId);
}

function buildRevisionSystemPrompt(job) {
  const answerMode = answerModeForJob(job);
  return `${buildSystemPrompt(job.resourceType, {
    year: job.year,
    subject: job.subject,
    answerMode,
    hasStimulus: true,
  })}

Revision mode:
- The user will give you a resource you generated earlier and one instruction describing a change to make to it.
- Make that change, and only that change.
- Every question, part, option, answer, mark, section, heading, stimulus and title the instruction does not ask you to change must come back exactly as it was given to you, word for word.
- Do not renumber, reorder, reword, rebalance or otherwise improve content the instruction did not mention, even where you can see a better version of it.
- Keep the same resource type, structure and answer mode as the original.
- Return the complete revised resource as valid JSON. No markdown code fences. No explanation.`;
}

function buildRevisionUserMessage({ job, sourceJob, uploadedContent }) {
  const previous = String(sourceJob?.generatedJson || "").trim();
  const instruction = String(job?.revisionInstruction || "").trim();
  const references = (Array.isArray(uploadedContent) ? uploadedContent : [])
    .map((file) => `Reference file: ${file.fileName}\n${file.content}`)
    .join("\n\n");
  return [
    "Revise this resource.",
    `Change requested:\n${instruction}`,
    references
      ? `Source material the resource was built from:\n${references}`
      : null,
    `Resource to revise:\n${previous}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

/**
 * Stringify with sorted keys, so two objects that differ only in key order
 * fingerprint the same. Key order is not meaningful in the generated resource
 * and does vary between model responses.
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * Every top-level question in a generated resource, keyed by where it sits.
 *
 * The schemas nest questions differently per resource type — `questions`,
 * `sections[].questions`, `subTopics[].practiceQuestions`, `blocks[].questions`
 * — so this walks the whole tree rather than knowing each shape. A question is
 * an object with both a `stem` and a `number`; parts carry a `stem` and a
 * `label` instead, and are folded into their parent's fingerprint rather than
 * counted separately, so one edited part reports as one changed question.
 */
function collectRevisionQuestions(value, path = "", into = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      collectRevisionQuestions(child, `${path}[${index}]`, into)
    );
    return into;
  }
  if (!value || typeof value !== "object") return into;

  if (typeof value.stem === "string" && Number.isFinite(Number(value.number))) {
    into.set(path, {
      label: `Q${value.number}`,
      fingerprint: stableStringify(value),
    });
    return into;
  }

  for (const [key, child] of Object.entries(value)) {
    collectRevisionQuestions(child, path ? `${path}.${key}` : key, into);
  }
  return into;
}

function formatLabelList(labels) {
  const unique = [...new Set(labels)];
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} and ${unique.length - 3} more`;
}

/**
 * Compare the resource a revision started from with what came back.
 *
 * A revision is asked to change one thing and told to reproduce the rest
 * verbatim, but nothing enforces that — and a silent rewrite of a question the
 * tutor was happy with is the exact failure this feature exists to prevent. So
 * the two versions are diffed question by question and the result is recorded
 * on the job.
 *
 * The model is never told which questions the instruction "should" have
 * touched, and neither are we: intent cannot be recovered from free text. So
 * the summary is always stored, and it is escalated to a warning only when more
 * than one question moved, on the grounds that a targeted instruction usually
 * changes one. That will occasionally flag a legitimately broad revision
 * ("make every question harder"), which costs a tutor one glance — the reverse
 * mistake costs them a mangled resource they did not check.
 */
function detectRevisionChanges(previousRaw, revised) {
  let previous;
  try {
    previous = JSON.parse(String(previousRaw || ""));
  } catch {
    // Nothing to compare against. A revision is still a perfectly good result,
    // so this reports no changes rather than failing the job.
    return null;
  }

  const before = collectRevisionQuestions(previous);
  const after = collectRevisionQuestions(revised);

  const changed = [];
  const removed = [];
  for (const [questionPath, item] of before) {
    const match = after.get(questionPath);
    if (!match) removed.push(item.label);
    else if (match.fingerprint !== item.fingerprint) changed.push(item.label);
  }
  const added = [...after]
    .filter(([questionPath]) => !before.has(questionPath))
    .map(([, item]) => item.label);

  const titleChanged =
    typeof previous?.title === "string" &&
    typeof revised?.title === "string" &&
    previous.title !== revised.title;

  const total = changed.length + added.length + removed.length;
  if (!total && !titleChanged) return null;

  const parts = [];
  if (changed.length) parts.push(`changed ${formatLabelList(changed)}`);
  if (added.length) parts.push(`added ${formatLabelList(added)}`);
  if (removed.length) parts.push(`removed ${formatLabelList(removed)}`);
  if (titleChanged) parts.push("changed the title");

  return {
    changed,
    added,
    removed,
    titleChanged,
    total,
    summary: `This revision ${parts.join(", ")}.`,
  };
}

function revisionDriftWarnings(changes) {
  if (!changes || changes.total <= 1) return [];
  return [{
    code: "REVISION_CHANGED_MULTIPLE",
    changedCount: changes.total,
    message: `${changes.summary} Check anything you did not ask it to change.`,
  }];
}

/**
 * Regenerate a resource from the one it is revising plus a tutor's instruction.
 *
 * Deliberately close to runRepairPipeline: same shape of call (previous
 * response in, complete replacement out), same DOCX save path. The differences
 * are that the instruction comes from a tutor rather than a parse failure, the
 * source JSON is read off the job being revised rather than this one, and the
 * original's reference files are re-attached so an instruction like "take Q3
 * from the same past paper" has something to work from.
 *
 * The source JSON is deliberately NOT copied onto the revision's own document.
 * `generatedJson` on an unfinished job means "a previous attempt produced this
 * and it needs repairing" — see canRepairJob — so a revision carrying its
 * source there would be picked up by the repair path instead of this one.
 */
async function runRevisionPipeline(job, deps) {
  const {
    db,
    storage,
    clock,
    callAi = callAiForResource,
    buildDocx = buildResourceDocx,
    extractText = extractTextFromBuffer,
  } = deps;
  if (!db) throw new TypeError("runRevisionPipeline requires db");
  if (!storage) throw new TypeError("runRevisionPipeline requires storage");
  if (!job?.jobId) throw new TypeError("runRevisionPipeline requires job.jobId");
  if (!job.derivedFromJobId) {
    throw new Error("Revision job is missing the resource it revises");
  }

  throwIfCancelled(deps);

  const sourceSnap = await db
    .collection("resourceJobs")
    .doc(job.derivedFromJobId)
    .get();
  if (!sourceSnap.exists) {
    throw new Error("The resource this revision was based on no longer exists");
  }
  const sourceJob = sourceSnap.data() || {};
  if (
    typeof sourceJob.generatedJson !== "string" ||
    !sourceJob.generatedJson.trim()
  ) {
    throw new Error(
      "The resource this revision was based on no longer has a stored generation"
    );
  }

  const uploadedContent = await downloadUploadedContent({
    job,
    storage,
    extractText,
  });
  throwIfCancelled(deps);

  const answerMode = answerModeForJob(job);
  const revisionModel = modelForResourceJob(job);
  const usageByProvider = {};
  const trackedCallAi = createTrackedAiCaller({ job, deps, callAi, usageByProvider });

  const { parsed, raw } = await trackedCallAi({
    model: revisionModel,
    maxTokens: maxTokensForResourceJob(job),
    effort: RESOURCE_GENERATION_EFFORT,
    systemPrompt: buildRevisionSystemPrompt(job),
    userMessage: buildRevisionUserMessage({ job, sourceJob, uploadedContent }),
    signal: deps.signal,
    // Same two exceptions as the repair path: stimulus stays permitted so a
    // revision preserves what the document already had, and maths is left
    // unconstrained because the generation schema pins `diagram` to null and
    // would strip every diagram the original was built with.
    responseSchema: isEnglishSubject(job.subject)
      ? buildResponseSchema(job.resourceType, {
          subject: job.subject,
          answerMode,
          hasStimulus: true,
        })
      : null,
    mathBearing: !isEnglishSubject(job.subject),
  });
  throwIfCancelled(deps);

  const revisionChanges = detectRevisionChanges(sourceJob.generatedJson, parsed);

  try {
    const saved = await saveGeneratedResource({
      job,
      parsed,
      raw,
      storage,
      buildDocx,
      clock,
      model: revisionModel,
    });
    return {
      ...saved,
      warnings: [...revisionDriftWarnings(revisionChanges), ...saved.warnings],
      revisionChanges,
      effectiveModel: revisionModel,
      effectiveProvider: providerForModel(revisionModel),
      usageByProvider,
    };
  } catch (err) {
    if (raw && !err.rawAiText) err.rawAiText = raw;
    err.usageByProvider = { ...usageByProvider };
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

    const nextPatch = { ...patch };
    if (patch.usageByProvider) {
      nextPatch.usageByProvider = mergeUsageByProvider(
        current.usageByProvider,
        patch.usageByProvider
      );
    }
    if (patch.status === "complete" && current.failover) {
      nextPatch.failover = {
        ...current.failover,
        completedAt: patch.completedAt || now(),
      };
    }
    tx.update(jobRef, {
      ...nextPatch,
      attemptId: null,
      lastAttemptId: attemptId,
      leaseExpiresAt: null,
    });
    return true;
  });
}

function mergeUsageByProvider(...records) {
  const merged = {};
  for (const record of records) {
    for (const [provider, usage] of Object.entries(record || {})) {
      addUsage(merged, provider, usage);
    }
  }
  return merged;
}

function fallbackTargetForJob(job) {
  const activeModel = modelForResourceJob(job);
  const target = backupModelFor(activeModel);
  const attempted = new Set(
    Array.isArray(job?.attemptedModels) ? job.attemptedModels : []
  );
  return target && !attempted.has(target) ? target : null;
}

async function queueResourceFallback({ db, storage, job, err, clock }) {
  if (!db) throw new TypeError("queueResourceFallback requires db");
  const targetModel = fallbackTargetForJob(job);
  if (!targetModel) return false;

  const failure = classifyResourceFailure(err);
  if (!failure.failoverEligible) return false;

  // Confirm ownership before touching the attempt-isolated output. The
  // transaction below repeats this fence after cleanup so a cancellation or a
  // newer worker that wins the race cannot be overwritten by the handoff.
  const jobRef = db.collection("resourceJobs").doc(job.jobId);
  const ownershipSnap = await jobRef.get();
  if (!ownershipSnap.exists) return false;
  const ownedJob = ownershipSnap.data() || {};
  if (
    ownedJob.status !== "processing" ||
    ownedJob.attemptId !== job.attemptId ||
    ownedJob.cancelRequested
  ) {
    return false;
  }

  await deleteAttemptOutputs({
    storage,
    jobId: job.jobId,
    attemptId: job.attemptId,
  });

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return false;
    const current = snap.data() || {};
    if (current.status !== "processing" || current.attemptId !== job.attemptId) {
      return false;
    }

    const activeModel = modelForResourceJob(current);
    const currentTarget = fallbackTargetForJob(current);
    if (!currentTarget || currentTarget !== targetModel || current.cancelRequested) {
      return false;
    }
    const queuedAt = now(clock);
    const failureAttempt = {
      model: activeModel,
      provider: providerForModel(activeModel),
      reasonCode: failure.reasonCode,
      safeReason: failure.message,
      failedAt: queuedAt,
    };
    tx.update(jobRef, {
      status: "fallback_pending",
      activeModel: targetModel,
      fallbackUsed: true,
      failover: {
        fromModel: activeModel,
        toModel: targetModel,
        reasonCode: failure.reasonCode,
        safeReason: failure.message,
        queuedAt,
        completedAt: null,
      },
      failureAttempts: [
        ...(Array.isArray(current.failureAttempts) ? current.failureAttempts : []),
        failureAttempt,
      ],
      usageByProvider: mergeUsageByProvider(
        current.usageByProvider,
        err?.usageByProvider
      ),
      generatedJson: null,
      outputPath: null,
      outputFileName: null,
      previewPath: null,
      warnings: [],
      error: null,
      errorCode: null,
      errorDetail: null,
      cancelRequested: false,
      attemptId: null,
      lastAttemptId: job.attemptId,
      leaseExpiresAt: null,
      startedAt: null,
      completedAt: null,
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
    revisionPipeline = runRevisionPipeline,
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
        // A revision rebuilds an existing resource from a tutor's instruction;
        // everything else generates from the job's inputs. The repair path
        // above still applies to both, and still runs first, because a revision
        // whose own output failed to parse is repairable in exactly the same way.
        const buildPipeline = isRevisionJob(job) ? revisionPipeline : generationPipeline;
        try {
          result = await buildPipeline(job, jobDeps);
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
          effectiveModel: result.effectiveModel || result.model || modelForResourceJob(job),
          effectiveProvider:
            result.effectiveProvider || providerForModel(result.model || modelForResourceJob(job)),
          model: result.effectiveModel || result.model || modelForResourceJob(job),
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
        if (result.previewPath && storage) {
          await deleteStorageObject({ storage, path: result.previewPath });
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

      if (deps.enableFailover !== false) {
        const queued = await queueResourceFallback({
          db,
          storage,
          job,
          err,
          clock,
        });
        if (queued) {
          outcomes.push({
            jobId: job.jobId,
            status: "fallback_pending",
            fromModel: modelForResourceJob(job),
            toModel: fallbackTargetForJob(job),
          });
          return outcomes;
        }
      }

      const { message: friendlyError, detail } = describeResourceFailure(err);
      const activeModel = modelForResourceJob(job);
      const failureAttempt = {
        model: activeModel,
        provider: providerForModel(activeModel),
        reasonCode: classifyResourceFailure(err).reasonCode,
        safeReason: friendlyError,
        failedAt: now(clock),
      };
      const bothProvidersFailed = Boolean(job.fallbackUsed && job.failover);
      const patch = {
        status: "failed",
        error: bothProvidersFailed
          ? `Both generation models failed. ${job.failover.fromModel}: ${job.failover.safeReason} ${activeModel}: ${friendlyError}`
          : friendlyError,
        errorCode: err?.code || null,
        errorDetail: detail,
        cancelRequested: false,
        completedAt: now(clock),
        usageByProvider: err?.usageByProvider || {},
        failureAttempts: [
          ...(Array.isArray(job.failureAttempts) ? job.failureAttempts : []),
          failureAttempt,
        ],
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

function shouldProcessResourceFallback(before, after) {
  return Boolean(
    after?.status === "fallback_pending" && before?.status !== "fallback_pending"
  );
}

async function processResourceFallbackImpl({ event, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("processResourceFallbackImpl requires db");
  const before = event?.data?.before?.data?.();
  const after = event?.data?.after?.data?.();
  if (!shouldProcessResourceFallback(before, after)) return null;

  const jobId = event?.params?.jobId || after?.jobId;
  if (!jobId) return null;
  const ref = db.collection("resourceJobs").doc(jobId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = snap.data() || {};
    if (current.status !== "fallback_pending") return null;
    if (current.cancelRequested) {
      tx.update(ref, {
        status: "cancelled",
        cancelRequested: false,
        completedAt: now(clock),
      });
      return { status: "cancelled", createdBy: current.createdBy };
    }
    tx.update(ref, {
      status: "pending",
      attemptId: null,
      leaseExpiresAt: null,
      startedAt: null,
      completedAt: null,
    });
    return { status: "pending", createdBy: current.createdBy };
  });

  if (!result || result.status !== "pending" || !result.createdBy) return result;
  const outcomes = await (deps.runQueueForTutor || runQueueForTutor)(
    result.createdBy,
    deps
  );
  return { ...result, outcomes };
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

  const modelChoice = inferModelChoice(job);
  const requestedModel = configuredModelForResourceType(job.resourceType, modelChoice);
  await jobRef.update({
    status: "pending",
    modelChoice,
    requestedModel,
    activeModel: requestedModel,
    effectiveModel: null,
    effectiveProvider: null,
    model: requestedModel,
    attemptedModels: [],
    fallbackUsed: false,
    failover: null,
    failureAttempts: [],
    usageByProvider: {},
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
    if (["pending", "fallback_pending"].includes(job.status)) {
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
  if (actor.role !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can delete resource jobs");
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
  const previewDelete = await deleteStorageObject({
    storage,
    path: job.previewPath,
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
        previewDelete,
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
    previewDelete,
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

  const fallbackSnap = await db
    .collection("resourceJobs")
    .where("status", "==", "fallback_pending")
    .get();
  for (const doc of fallbackSnap.docs) {
    const queriedJob = doc.data() || {};
    const queuedAtMs = queriedJob.failover?.queuedAt?.toMillis?.();
    if (!Number.isFinite(queuedAtMs) || queuedAtMs >= thresholdDate.getTime()) {
      continue;
    }
    const recovered = await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(doc.ref);
      if (!currentSnap.exists) return false;
      const current = currentSnap.data() || {};
      const currentQueuedAtMs = current.failover?.queuedAt?.toMillis?.();
      if (
        current.status !== "fallback_pending" ||
        !Number.isFinite(currentQueuedAtMs) ||
        currentQueuedAtMs >= thresholdDate.getTime()
      ) {
        return false;
      }
      tx.update(doc.ref, {
        status: "pending",
        attemptId: null,
        leaseExpiresAt: null,
        startedAt: null,
        error: "Fallback handoff recovered after its worker did not start",
      });
      return true;
    });
    if (!recovered) continue;
    recoveredJobIds.push(doc.id);
    if (queriedJob.createdBy) createdBySet.add(queriedJob.createdBy);
  }

  const tutorsQueued = [...createdBySet];
  for (const createdBy of tutorsQueued) {
    await (deps.runQueueForTutor || runQueueForTutor)(createdBy, deps);
  }

  return { recoveredJobIds, tutorsQueued };
}

/**
 * Decide whether a resourceJobs update should trigger preview generation.
 *
 * Deliberately fires only on the transition *into* complete. That makes it
 * single-shot per attempt, and — because attaching the preview is itself an
 * update — stops this trigger from re-entering on its own write.
 */
function shouldGeneratePreview(before, after) {
  if (!after || after.status !== "complete") return false;
  if (!after.outputPath || after.previewPath) return false;
  return before?.status !== "complete";
}

const generateResourcePreviewOnComplete = onDocumentUpdated(
  {
    document: "resourceJobs/{jobId}",
    ...RESOURCE_PREVIEW_WORKER_OPTIONS,
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!shouldGeneratePreview(before, after)) return;

    try {
      return await generateResourcePreview({
        job: { ...after, jobId: event.params.jobId },
        db: admin.firestore(),
        storage: admin.storage(),
        pdfConverter: createPdfPreviewConverter({ url: pdfPreviewUrl.value() }),
      });
    } catch (err) {
      // Never rethrow: a failed preview must not retry the trigger or surface
      // as a job failure. The resource itself is already complete.
      logger.warn("[generateResourcePreviewOnComplete] failed", {
        jobId: event?.params?.jobId,
        errorMessage: err?.message,
      });
      return null;
    }
  }
);

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
          openaiApiKey: openaiApiKey.value(),
          enablePdTextSourcing: pdTextSourcing.value(),
          enableFailover: llmFailoverEnabled.value(),
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

const processResourceFallback = onDocumentUpdated(
  {
    document: "resourceJobs/{jobId}",
    ...RESOURCE_WORKER_OPTIONS,
  },
  async (event) => {
    try {
      return await processResourceFallbackImpl({
        event,
        deps: {
          db: admin.firestore(),
          storage: admin.storage(),
          anthropicApiKey: anthropicApiKey.value(),
          openaiApiKey: openaiApiKey.value(),
          enablePdTextSourcing: pdTextSourcing.value(),
          enableFailover: llmFailoverEnabled.value(),
        },
      });
    } catch (err) {
      logger.error("[processResourceFallback] failed", {
        jobId: event?.params?.jobId,
        reasonCode: classifyResourceFailure(err).reasonCode,
      });
      throw err;
    }
  }
);

const submitResourceRevision = onCall(RESOURCE_CALLABLE_OPTIONS, async (request) => {
  const actor = requireResourceStaffCallable(request);
  let payload;
  try {
    payload = validateSubmitResourceRevisionPayload(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }

  try {
    return await createResourceRevisionImpl({
      payload,
      actor,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[submitResourceRevision] failed", {
      sourceJobId: payload?.sourceJobId,
      actorUid: actor.uid,
      errorMessage: err?.message,
    });
    throw toHttpsError(err);
  }
});

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
          openaiApiKey: openaiApiKey.value(),
          enablePdTextSourcing: pdTextSourcing.value(),
          enableFailover: llmFailoverEnabled.value(),
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
  RESOURCE_CALLABLE_OPTIONS,
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
  RESOURCE_CALLABLE_OPTIONS,
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
          openaiApiKey: openaiApiKey.value(),
          enablePdTextSourcing: pdTextSourcing.value(),
          enableFailover: llmFailoverEnabled.value(),
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
  applySourcedPassage,
  stripVerbatimFlags,
  buildDocxWithDiagramReliability,
  buildResourceJobDoc,
  cancelResourceJob,
  cancelResourceJobImpl,
  claimNextPendingJobForTutor,
  createResourceJobImpl,
  createResourceRevisionImpl,
  assertUploadedFilesAllowed,
  loadSourceResourceJob,
  revisionPayloadFromSourceJob,
  collectRevisionQuestions,
  detectRevisionChanges,
  revisionDriftWarnings,
  isRevisionJob,
  maybeSourcePassage,
  shouldSourcePassage,
  applySourcedStimulus,
  maybeSourceStimulusSet,
  shouldSourceStimulusSet,
  planStimulusSelections,
  deleteResourceJob,
  deleteResourceJobImpl,
  deleteAttemptOutputs,
  deleteStorageObject,
  downloadUploadedContent,
  extractJobTopics,
  finalizeResourceJobAttempt,
  configuredModelForResourceType,
  maxTokensForResourceJob,
  modelForResourceJob,
  outputPathForJob,
  generateResourcePreview,
  generateResourcePreviewOnComplete,
  processResourceJob,
  processResourceJobImpl,
  processResourceFallback,
  processResourceFallbackImpl,
  queueResourceFallback,
  shouldProcessResourceFallback,
  shouldGeneratePreview,
  recoverStuckResourceJobs,
  recoverStuckResourceJobsImpl,
  requireResourceStaffCallable,
  retryResourceJob,
  retryResourceJobImpl,
  fillDiagrams,
  runRepairPipeline,
  runRevisionPipeline,
  runGenerationPipeline,
  runQueueForTutor,
  safetyIdentifierForUid,
  submitResourceJob,
  submitResourceRevision,
  validateCancelResourceJobPayload,
  validateSubmitResourceRevisionPayload,
  validateRetryResourceJobPayload,
  validateDeleteResourceJobPayload,
  validateSubmitResourceJobPayload,
  uploadedFilesForJob,
};
