"use strict";

const { createHash } = require("crypto");
const { fromDate } = require("../shared/timestamps");

const STAGE_TIMEOUT_MS = 360_000;
const MAX_STAGE_COUNT = 80;
const MAX_RECOVERIES = 3;
const WORKSHEET_BATCH_SIZE = 15;
const MAX_QUESTIONS = 200;

function controlError(code, message) {
  return Object.assign(new Error(message), { code, resourceControl: true });
}

function requestedQuestionCount(prompt = "") {
  const matches = [...String(prompt).matchAll(/\b(\d+)[\s-]*(?:worked\s+|practice\s+|maths?\s+|revision\s+)*(?:questions?|problems?)\b/gi)];
  return matches.length ? Math.max(...matches.map((m) => Number(m[1]))) : null;
}

function assertRequestSize(job) {
  const count = requestedQuestionCount(job.customPrompt);
  if (count > MAX_QUESTIONS) {
    throw controlError("RESOURCE_SIZE_LIMIT", `Request up to ${MAX_QUESTIONS} questions per resource. Split this request into smaller resources.`);
  }
  return count;
}

// Content-addressed results are private Storage objects, not Firestore fields:
// a large response can exceed Firestore's document limit. Only the worker writes
// them; an attempt fence protects both the journal and the progress display.
function createDurableCaller({ job, db, storage, callAi, clock = () => new Date(), timeoutMs = STAGE_TIMEOUT_MS }) {
  let freshCalls = 0;
  let completed = 0;
  const invocationStarted = Date.now();
  const progress = async (message) => db.runTransaction(async (tx) => {
    const snap = await tx.get(job.ref);
    const current = snap.data() || {};
    if (!snap.exists || current.status !== "processing" || current.attemptId !== job.attemptId || current.cancelRequested) {
      throw controlError("RESOURCE_SUPERSEDED", "This worker no longer owns the resource.");
    }
    tx.update(job.ref, { progress: { message, completedStages: completed, updatedAt: fromDate(clock()) } });
  });
  return async (request) => {
    const { signal, apiKey, anthropicApiKey, openaiApiKey, stageLabel, validateStageResult, ...publicRequest } = request;
    for (const key of Object.keys(publicRequest)) {
      if (key.startsWith("posthog") || key === "safetyIdentifier") delete publicRequest[key];
    }
    const key = createHash("sha256").update(JSON.stringify(publicRequest)).digest("hex");
    const file = storage.bucket().file(`resources/checkpoints/${job.jobId}/${key}.json`);
    try {
      const [bytes] = await file.download();
      completed += 1;
      return JSON.parse(bytes.toString("utf8"));
    } catch (err) {
      if (Number(err.code) !== 404) throw err;
    }
    if (freshCalls) throw controlError("RESOURCE_STAGE_YIELD", "Continuing from saved progress");
    if (completed >= MAX_STAGE_COUNT) {
      throw controlError("RESOURCE_STAGE_LIMIT", "This request needs too many generation stages. Split it into smaller resources.");
    }
    await progress(stageLabel || `Generating · ${completed} steps saved`);
    freshCalls += 1;
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(controlError("RESOURCE_STAGE_TIMEOUT", "A generation stage took longer than six minutes. Saved progress is retained; retry or split the request into smaller resources."));
          controller.abort();
        }, Math.max(1, Math.min(timeoutMs, 450_000 - (Date.now() - invocationStarted))));
      });
      const { stageLabel: _label, validateStageResult: validate, ...providerRequest } = request;
      const result = await Promise.race([callAi({ ...providerRequest, signal: controller.signal }), deadline]);
      if (validate) validate(result);
      await progress(`Saving stage ${completed + 1}`);
      await file.save(JSON.stringify(result), { resumable: false, metadata: { contentType: "application/json" } });
      completed += 1;
      await progress(`${completed} steps saved · preparing the next step`);
      // A caller can mutate parsed in place (diagram fills / verification).
      // Return an isolated value so replay always starts from the same bytes.
      return structuredClone(result);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  };
}

async function generateWorksheetBatches({ job, request, callAi, count }) {
  const chunks = [];
  for (let start = 1; start <= count; start += WORKSHEET_BATCH_SIZE) {
    const end = Math.min(count, start + WORKSHEET_BATCH_SIZE - 1);
    const validateStageResult = (result) => {
      const part = result.parsed;
      if (!Array.isArray(part?.questions) || part.questions.length !== end - start + 1 ||
          part.questions.some((q, i) => q.number !== start + i) ||
          (job.answerMode !== "none" && (!Array.isArray(part.answers) ||
            part.questions.some((q) => !part.answers.some((a) => a.questionNumber === q.number)) ||
            part.answers.some((a) => a.questionNumber < start || a.questionNumber > end)))) {
        throw controlError("RESOURCE_BATCH_INVALID", "A worksheet batch returned missing or incorrectly numbered questions or answers. Retry to resume saved progress, or request fewer questions.");
      }
    };
    const result = await callAi({
      ...request,
      maxTokens: Math.min(request.maxTokens, 16000),
      stageLabel: `Writing questions ${start}–${end} of ${count}`,
      validateStageResult,
      userMessage: `${request.userMessage}\n\nBATCH INSTRUCTION: This is one part of a ${count}-question worksheet. Generate ONLY questions ${start}–${end}, exactly ${end - start + 1} questions with their requested answers. Use these global question numbers in questions and answers. Distribute the requested topics and difficulty across the whole worksheet, considering this batch's position. Do not repeat earlier questions. Earlier question stems: ${JSON.stringify(chunks.flatMap((part) => part.questions.map((q) => q.stem)))}. Return the usual complete worksheet JSON shape for this batch only. This batch instruction overrides the requested total for this response.`,
    });
    validateStageResult(result);
    const part = result.parsed;
    chunks.push(part);
  }
  const parsed = {
    ...chunks[0],
    questions: chunks.flatMap((p) => p.questions),
    answers: chunks.flatMap((p) => p.answers || []),
    totalMarks: chunks.reduce((sum, p) => sum + Number(p.totalMarks || 0), 0),
  };
  return { parsed, raw: JSON.stringify(parsed) };
}

module.exports = { createDurableCaller, assertRequestSize, requestedQuestionCount, generateWorksheetBatches,
  WORKSHEET_BATCH_SIZE, MAX_QUESTIONS, MAX_RECOVERIES, controlError };
