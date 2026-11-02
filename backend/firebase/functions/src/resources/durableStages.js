"use strict";

const { createHash } = require("crypto");
const { providerForModel } = require("./modelRegistry");
const { resourceEvent, resourceStage } = require("./resourceLog");
const { fromDate } = require("../shared/timestamps");

const STAGE_TIMEOUT_MS = 360_000;
const MAX_STAGE_COUNT = 80;
const MAX_PLANNED_STAGE_COUNT = 600;
const MAX_STAGE_RECOVERIES = 12;
const INVOCATION_BUDGET_MS = 450_000;
const MIN_CALL_BUDGET_MS = 30_000;
const MAX_RECOVERIES = 3;
const WORKSHEET_BATCH_SIZE = 15;
const MAX_QUESTIONS = 200;

function controlError(code, message) {
  return Object.assign(new Error(message), { code, resourceControl: true });
}

// "180 worked questions", "250 algebra questions", "30 index-law problems":
// up to three words may sit between the number and the noun. A number that
// labels something else ("Year 9 questions", "Chapter 16 problems") is not a
// count.
const COUNT_LABELS = "year|yr|stage|chapter|section|page|level|grade|part|unit|week|lesson|module|question|q";
const QUESTION_COUNT = new RegExp(String.raw`(?<!\b(?:${COUNT_LABELS})\.?\s*)\b(\d+)(?:[\s-]+[A-Za-z][\w'-]*){0,3}?[\s-]+(?:questions?|problems?)\b`, "gi");

function requestedQuestionCount(prompt = "") {
  const matches = [...String(prompt).matchAll(QUESTION_COUNT)];
  // A per-topic multiplier is not a total. Planning resolves it against references.
  if (matches.some((m) => /^\s*(?:per|for each|in each|for every)\b/i.test(String(prompt).slice(m.index + m[0].length)))) return null;
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
function createDurableCaller({ job, db, storage, callAi, fallbackModel = null, clock = () => new Date(), timeoutMs = STAGE_TIMEOUT_MS }) {
  let inFlight = null;
  let completed = 0;
  const invocationStarted = Date.now();
  const progress = async (message, executing = false, recovery = {}) => db.runTransaction(async (tx) => {
    const snap = await tx.get(job.ref);
    const current = snap.data() || {};
    if (!snap.exists || current.status !== "processing" || current.attemptId !== job.attemptId || current.cancelRequested) {
      throw controlError("RESOURCE_SUPERSEDED", "This worker no longer owns the resource.");
    }
    tx.update(job.ref, { progress: { message, completedStages: completed, updatedAt: fromDate(clock()) },
      ...(executing ? { providerCallCount: (current.providerCallCount || 0) + 1,
        stageRetryCount: (current.stageRetryCount || 0) + (recovery.failures && !recovery.fallback ? 1 : 0),
        stageFallbackCount: (current.stageFallbackCount || 0) + (recovery.fallback ? 1 : 0) } : {}) });
  });
  return async (request) => {
    const { signal, apiKey, anthropicApiKey, openaiApiKey, stageLabel, stageId, splitAllowed, validateStageResult, ...publicRequest } = request;
    for (const key of Object.keys(publicRequest)) {
      if (key.startsWith("posthog") || key === "safetyIdentifier") delete publicRequest[key];
    }
    // Versioned planned artifacts are reusable across providers. Legacy hashes stay exact.
    if (job.generationVersion === 1) { delete publicRequest.model; if (stageId) publicRequest.logicalStageId = stageId; }
    const key = createHash("sha256").update(JSON.stringify(publicRequest)).digest("hex");
    const file = storage.bucket().file(`resources/checkpoints/${job.jobId}/${key}.json`);
    try {
      const [bytes] = await file.download();
      completed += 1;
      const cached = JSON.parse(bytes.toString("utf8"));
      if (validateStageResult) validateStageResult(cached);
      resourceEvent(job, "checkpoint.reused", { stageId: stageId || key, completedStages: completed });
      return cached;
    } catch (err) {
      if (Number(err.code) !== 404) throw err;
    }
    // Concurrent stages (diagram fills run under Promise.all) reach here
    // together. The slot is taken before any await, so only one provider call
    // starts per invocation; the others wait for it to be saved, then yield.
    // A failed call saved nothing, so yielding after it would replay the same
    // failure every invocation (a best-effort caller swallows it): the slot
    // passes to the next stage instead.
    while (inFlight) {
      const current = inFlight;
      const saved = await current.then(() => true, () => false);
      if (saved) throw controlError("RESOURCE_STAGE_YIELD", "Continuing from saved progress");
      if (inFlight === current) break;
    }
    if (completed >= (job.generationVersion === 1 ? MAX_PLANNED_STAGE_COUNT : MAX_STAGE_COUNT)) {
      throw controlError("RESOURCE_STAGE_LIMIT", "This request needs too many generation stages. Split it into smaller resources.");
    }
    const recovery = job.stageRecovery?.[key] || {};
    if ((job.stageRecoveryCount || 0) > MAX_STAGE_RECOVERIES) throw controlError("RESOURCE_RECOVERY_EXHAUSTED", "Generation reached its recovery limit. Reduce the request before retrying.");
    if (recovery.split) throw controlError("RESOURCE_STAGE_SPLIT", "Continuing in smaller batches.");
    if (recovery.exhausted) throw controlError("RESOURCE_RECOVERY_EXHAUSTED", "This stage could not finish after bounded retries. Completed stages are retained; reduce the request before retrying.");
    if (INVOCATION_BUDGET_MS - (Date.now() - invocationStarted) < MIN_CALL_BUDGET_MS) throw controlError("RESOURCE_STAGE_YIELD", "Continuing in a fresh worker.");
    inFlight = resourceStage(job, stageId || key, () => runFreshStage({ request, signal, stageLabel, file, key, recovery }), { model: recovery.fallback ? fallbackModel : request.model, batchIndex: /^(questions|solutions)\./.test(stageId || "") ? Number(stageId.split(".")[1]) : undefined });
    return inFlight;
  };

  async function runFreshStage({ request, signal, stageLabel, file, key, recovery }) {
    await progress(stageLabel || `Generating · ${completed} steps saved`, true, recovery);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    let timer;
    let providerFinished = false;
    let providerResult;
    const providerStarted = Date.now();
    const activeModel = recovery.fallback && fallbackModel ? fallbackModel : request.model;
    const budget = Math.max(1, Math.min(timeoutMs, INVOCATION_BUDGET_MS - (Date.now() - invocationStarted)));
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(controlError("RESOURCE_STAGE_TIMEOUT", `A generation stage exceeded its time limit. ${completed ? `${completed} completed stages are saved.` : "No stages have been saved yet."} Retry or split the request into smaller resources.`));
          controller.abort();
        }, budget);
      });
      const { stageLabel: _label, stageId: _stageId, splitAllowed: _split, validateStageResult: validate, ...providerRequest } = request;
      if (recovery.fallback && fallbackModel) providerRequest.model = fallbackModel;
      if (recovery.lastReason) providerRequest.userMessage += `\n\nThe prior response failed validation (${recovery.lastReason}). Correct that issue while preserving the original scope and requested limits.`;
      resourceEvent(job, "provider.started", { model: providerRequest.model, provider: providerForModel(providerRequest.model), timeoutMs: budget, remainingMs: INVOCATION_BUDGET_MS - (Date.now() - invocationStarted), retryCount: recovery.failures || 0 });
      const result = await Promise.race([callAi({ ...providerRequest, signal: controller.signal }), deadline]);
      providerFinished = true;
      providerResult = result;
      resourceEvent(job, "provider.completed", { model: result?.model || providerRequest.model, provider: result?.provider, responseId: result?.responseId, durationMs: Date.now() - providerStarted, ...result?.usage });
      if (validate) await resourceStage(job, "validation", () => validate(result));
      await progress(`Saving stage ${completed + 1}`);
      await file.save(JSON.stringify(result), { resumable: false, metadata: { contentType: "application/json" } });
      completed += 1;
      resourceEvent(job, "checkpoint.saved", { completedStages: completed });
      await progress(`${completed} steps saved · preparing the next step`);
      // A caller can mutate parsed in place (diagram fills / verification).
      // Return an isolated value so replay always starts from the same bytes.
      return structuredClone(result);
    } catch (err) {
      if (!providerFinished) resourceEvent(job, "provider.failed", { model: activeModel, provider: providerForModel(activeModel),
        responseId: err?.responseId, errorCode: err?.code || "PROVIDER_FAILURE", durationMs: Date.now() - providerStarted, ...err?.usage }, signal?.aborted ? "info" : "error");
      if (providerResult?.usage) { err.usage = providerResult.usage; err.provider = providerResult.provider; }
      const recoverable = ["RESOURCE_STAGE_TIMEOUT", "RESOURCE_BATCH_INVALID", "RESOURCE_PLAN_INVALID"].includes(err?.code) ||
        (!err?.resourceControl && !err?.refusal && !signal?.aborted && (err?.modelFailure || [429, 503, 529].includes(err?.status)));
      if (job.generationVersion === 1 && recoverable) {
        const failures = (recovery.failures || 0) + 1;
        const next = { failures, ...(err.resourceControl && err.reason ? { lastReason: err.reason } : {}), split: Boolean(request.splitAllowed && err?.code === "RESOURCE_STAGE_TIMEOUT"),
          fallback: failures >= 2 && Boolean(fallbackModel), exhausted: failures >= (fallbackModel ? 3 : 2) };
        const count = await db.runTransaction(async (tx) => {
          const snap = await tx.get(job.ref);
          const current = snap.data() || {};
          if (!snap.exists || current.status !== "processing" || current.attemptId !== job.attemptId || current.cancelRequested) throw controlError("RESOURCE_SUPERSEDED", "This worker no longer owns the resource.");
          const count = (current.stageRecoveryCount || 0) + 1;
          tx.update(job.ref, { stageRecovery: { ...current.stageRecovery, [key]: next }, stageRecoveryCount: count,
            progress: { completedStages: completed, updatedAt: fromDate(clock()), message: count > MAX_STAGE_RECOVERIES || next.exhausted ? "Recovery limit reached" : next.split ? "Continuing in smaller batches" : next.fallback ? "Retrying this stage with the backup model" : "Retrying this stage from saved progress" } });
          return count;
        });
        resourceEvent(job, "recovery.decided", { errorCode: err?.code || "PROVIDER_FAILURE", reason: err?.resourceControl ? err?.reason : undefined, retryCount: failures,
          recoveryDecision: count > MAX_STAGE_RECOVERIES || next.exhausted ? "exhausted" : next.split ? "split" : next.fallback ? "fallback" : "retry" }, "warn");
        if (count > MAX_STAGE_RECOVERIES || next.exhausted) throw controlError("RESOURCE_RECOVERY_EXHAUSTED", "Generation reached its recovery limit. Completed stages are retained; reduce the request before retrying.");
        throw controlError("RESOURCE_STAGE_YIELD", next.split ? "Continuing in smaller batches" : next.fallback ? "Retrying this stage with the backup model" : "Retrying this stage from saved progress");
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
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
