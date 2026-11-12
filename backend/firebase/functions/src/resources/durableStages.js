"use strict";

const { checkpointFor } = require("./resourceCheckpoints");
const { withTransientRetries } = require("./providerBudget");
const { providerForModel } = require("./modelRegistry");
const { resourceEvent, resourceStage } = require("./resourceLog");
const { fromDate } = require("../shared/timestamps");
const { estimateProgress, loadTimingStats, noteProgress, phaseForStage, phaseIndex, trackWait } = require("./progressModel");

const STAGE_TIMEOUT_MS = 360_000;
// Optional work (a content review, an optional diagram fill) never gets the full
// six minutes (RES-70): a GPT cone fill once ran 256s to its token limit and
// failed anyway, more than half of that worksheet's whole run.
const OPTIONAL_STAGE_TIMEOUT_MS = 120_000;
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
function createDurableCaller({ job, db, storage, callAi, providerBudget = null, fallbackModel = null, clock = () => new Date(), timeoutMs = STAGE_TIMEOUT_MS, optionalTimeoutMs = OPTIONAL_STAGE_TIMEOUT_MS, transientRetryDelayMs }) {
  let inFlight = null;
  let completed = 0;
  const invocationStarted = Date.now();
  // RES-73. Shared by reference with the pipeline's copies of the job, which
  // report the step they are on and how many questions are written. Each
  // invocation replays saved stages from the start, so this rebuilds itself.
  const tracker = job.progressTracker || (job.progressTracker = { phase: null, questionsDone: 0, questionCount: 0 });
  const advance = (phase) => { if (phase && (!tracker.phase || phaseIndex(phase) > phaseIndex(tracker.phase))) tracker.phase = phase; };
  let statsLoad = null;
  const timingStats = () => (statsLoad ||= (job.timingStats ? Promise.resolve(job.timingStats) : loadTimingStats(db, job)));
  const requestedQuestions = requestedQuestionCount(job.customPrompt);
  const progressFields = (current, message, stats) => {
    const now = clock();
    // RES-84. A manual Retry starts a new run (new runId, worker time reset)
    // but may keep the last run's progress; nothing carries over from it.
    const runId = current.runId || null;
    const prev = (current.progress?.runId ?? null) === runId ? current.progress || {} : {};
    const startedMs = typeof current.startedAt?.toMillis === "function" ? current.startedAt.toMillis()
      : current.startedAt instanceof Date ? current.startedAt.getTime() : null;
    const activeMs = (current.activeElapsedMs || 0) + (startedMs ? Math.max(0, now.getTime() - startedMs) : 0);
    const firstStartedAtMs = prev.firstStartedAtMs || now.getTime();
    const phaseStarts = { ...(prev.phaseStarts || {}) };
    if (tracker.phase && phaseStarts[tracker.phase] == null) phaseStarts[tracker.phase] = activeMs;
    const prevUpdatedMs = typeof prev.updatedAt?.toMillis === "function" ? prev.updatedAt.toMillis()
      : prev.updatedAt instanceof Date ? prev.updatedAt.getTime() : null;
    const previous = Number.isFinite(prev.fraction) ? { fraction: prev.fraction, remainingMs: prev.remainingMs,
      elapsedMs: prevUpdatedMs ? now.getTime() - prevUpdatedMs : 0 } : null;
    const wait = trackWait(prev.wait, { nowMs: now.getTime(), activeMs });
    // When the current step's count (questions written, diagram questions
    // settled) last moved, in worker time.
    const countKey = `${tracker.phase}:${tracker.questionsDone || 0}:${tracker.diagramsDone || 0}`;
    const countChangedAtMs = prev.countKey === countKey && Number.isFinite(prev.countChangedAtMs) ? prev.countChangedAtMs : activeMs;
    const estimate = estimateProgress({ job: current.resourceType ? current : job, statsByKey: stats, tracker, activeMs,
      wallMs: Math.max(activeMs, now.getTime() - firstStartedAtMs), phaseStarts, requestedQuestions, previous, recentWait: wait, countChangedAtMs });
    return { message, completedStages: completed, updatedAt: fromDate(now), runId, firstStartedAtMs, phaseStarts, wait, countKey, countChangedAtMs, ...estimate,
      initialEstimateMs: prev.initialEstimateMs || estimate.expectedTotalMs };
  };
  const progress = async (message, executing = false, recovery = {}) => {
    const stats = await timingStats();
    let reported = null;
    const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(job.ref);
    const current = snap.data() || {};
    if (!snap.exists || current.status !== "processing" || current.attemptId !== job.attemptId || current.cancelRequested) {
      throw controlError("RESOURCE_SUPERSEDED", "This worker no longer owns the resource.");
    }
    const fields = progressFields(current, message, stats);
    reported = fields;
    tx.update(job.ref, { progress: fields,
      ...(executing ? { providerCallCount: (current.providerCallCount || 0) + 1,
        stageRetryCount: (current.stageRetryCount || 0) + (recovery.failures && !recovery.fallback ? 1 : 0),
        stageFallbackCount: (current.stageFallbackCount || 0) + (recovery.fallback ? 1 : 0) } : {}) });
    });
    // RES-84. What the tutor was shown, so ETA accuracy can be measured
    // against when the resource actually finished.
    if (reported) resourceEvent(job, "progress.reported", { progressPhase: reported.phase, progressFraction: reported.fraction,
      etaMs: reported.remainingMs, questionsDone: reported.questionsDone, questionCount: reported.questionCount,
      diagramsDone: reported.diagramsDone, diagramCount: reported.diagramCount });
    return result;
  };
  const durableCall = async (request) => {
    const { signal, apiKey, anthropicApiKey, openaiApiKey, stageLabel, stageId, splitAllowed, optionalReview, bestEffort, concurrent, validateStageResult, progressPhase, checkpointContract, ...publicRequest } = request;
    // RES-84. Work before the first named step (English passage and stimulus
    // sourcing, reference reading) is preparation: it counts as planning, so
    // the bar moves and its time is not mistaken for slow progress.
    advance(phaseForStage({ progressPhase, stageId, stageLabel }) || (tracker.phase ? null : "plan"));
    for (const key of Object.keys(publicRequest)) {
      if (key.startsWith("posthog") || key === "safetyIdentifier") delete publicRequest[key];
    }
    // Versioned planned artifacts are reusable across providers. Legacy hashes stay exact.
    if (job.generationVersion === 1) { delete publicRequest.model; if (stageId) publicRequest.logicalStageId = stageId; }
    const checkpoint = checkpointFor({ bucket: storage.bucket(), job, stageId, request: publicRequest, contract: checkpointContract });
    const { key, legacyKey } = checkpoint;
    const cached = await checkpoint.read(validateStageResult, () => progress("Preserving saved generation progress"));
    if (cached) {
      completed += 1;
      resourceEvent(job, "checkpoint.reused", { stageId: stageId || key, completedStages: completed });
      return cached;
    }
    if (request.optionalReview && (job.optionalReviewFailures?.[key] || job.optionalReviewFailures?.[legacyKey])) {
      throw controlError("RESOURCE_REVIEW_UNAVAILABLE", "This optional review could not finish; the draft is retained.");
    }
    const optionalFailure = job.optionalStageFailures?.[key] || job.optionalStageFailures?.[legacyKey];
    if (bestEffort && bestEffortGivenUp(optionalFailure)) {
      resourceEvent(job, "stage.skipped", { stageId: stageId || key, reason: "best_effort_failed_before" });
      throw bestEffortSkipped(optionalFailure.code);
    }
    // Concurrent stages (diagram fills run under Promise.all) reach here
    // together. The slot is taken before any await, so only one provider call
    // starts per invocation; the others wait for it to be saved, then yield.
    // A failed call saved nothing, so yielding after it would replay the same
    // failure every invocation (a best-effort caller swallows it): the slot
    // passes to the next stage instead.
    // RES-71. Independent best-effort calls (the question bank's) may run side
    // by side: each is saved as it finishes, and the invocation budget below
    // still stops a new one starting too late.
    while (inFlight && !(concurrent && bestEffort)) {
      const current = inFlight;
      const saved = await current.then(() => true, (err) => {
        if (err.queueNotBeforeMs) throw err;
        return false;
      });
      if (saved) throw controlError("RESOURCE_STAGE_YIELD", "Continuing from saved progress");
      if (inFlight === current) break;
    }
    if (completed >= (job.generationVersion === 1 ? MAX_PLANNED_STAGE_COUNT : MAX_STAGE_COUNT)) {
      throw controlError("RESOURCE_STAGE_LIMIT", "This request needs too many generation stages. Split it into smaller resources.");
    }
    const recovery = job.stageRecovery?.[key] || job.stageRecovery?.[legacyKey] || {};
    if ((job.stageRecoveryCount || 0) > MAX_STAGE_RECOVERIES) throw controlError("RESOURCE_RECOVERY_EXHAUSTED", "Generation reached its recovery limit. Reduce the request before retrying.");
    if (recovery.split) throw controlError("RESOURCE_STAGE_SPLIT", "Continuing in smaller batches.");
    if (recovery.exhausted) throw controlError("RESOURCE_RECOVERY_EXHAUSTED", "This stage could not finish after bounded retries. Completed stages are retained; reduce the request before retrying.");
    if (INVOCATION_BUDGET_MS - (Date.now() - invocationStarted) < MIN_CALL_BUDGET_MS) throw controlError("RESOURCE_STAGE_YIELD", "Continuing in a fresh worker.");
    const running = resourceStage(job, stageId || key, () => runFreshStage({ request, signal, stageLabel, checkpoint, key, legacyKey, recovery }), { model: recovery.fallback ? fallbackModel : request.model, batchIndex: /^(questions|solutions)\./.test(stageId || "") ? Number(stageId.split(".")[1]) : undefined });
    if (!(concurrent && bestEffort)) inFlight = running;
    return running;
  };
  // A step with no provider call (building the PDF) still moves the display on.
  durableCall.markPhase = async (phase, message) => {
    advance(phase);
    try { await progress(message); } catch (err) { if (err?.code === "RESOURCE_SUPERSEDED") throw err; }
  };
  tracker.markPhase = durableCall.markPhase;
  durableCall.progressTracker = tracker;
  return durableCall;

  async function runFreshStage({ request, signal, stageLabel, checkpoint, key, legacyKey, recovery }) {
    const activeModel = recovery.fallback && fallbackModel ? fallbackModel : request.model;
    const provider = providerForModel(activeModel);
    const release = await providerBudget?.acquire(provider);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    let timer;
    let providerFinished = false;
    let providerResult;
    let providerStarted;
    let failure;
    try {
      await progress(stageLabel || `Generating · ${completed} steps saved`, true, recovery);
      providerStarted = Date.now();
      const budget = Math.max(1, Math.min(timeoutMs, request.optionalReview || request.bestEffort ? optionalTimeoutMs : timeoutMs, INVOCATION_BUDGET_MS - (Date.now() - invocationStarted)));
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(controlError("RESOURCE_STAGE_TIMEOUT", `A generation stage exceeded its time limit. ${completed ? `${completed} completed stages are saved.` : "No stages have been saved yet."} Retry or split the request into smaller resources.`));
          controller.abort();
        }, budget);
      });
      const { stageLabel: _label, stageId: _stageId, splitAllowed: _split, optionalReview: _optional, bestEffort: _bestEffort, concurrent: _concurrent, validateStageResult: validate, progressPhase: _phase, checkpointContract: _contract, ...providerRequest } = request;
      if (recovery.fallback && fallbackModel) providerRequest.model = fallbackModel;
      if (recovery.lastReason) providerRequest.userMessage += `\n\nThe prior response failed validation (${recovery.lastReason}). Correct that issue while preserving the original scope and requested limits.`;
      resourceEvent(job, "provider.started", { model: providerRequest.model, provider: providerForModel(providerRequest.model), timeoutMs: budget, remainingMs: INVOCATION_BUDGET_MS - (Date.now() - invocationStarted), retryCount: recovery.failures || 0 });
      // Under a shared budget the SDK retries nothing, so a 429 sets the shared
      // cooldown; other transient failures are retried here inside the permit.
      const send = () => callAi({ ...providerRequest, signal: controller.signal, ...(release ? { maxRetries: 0 } : {}) });
      const call = release
        ? withTransientRetries(send, { signal: controller.signal, delayMs: transientRetryDelayMs,
          onRetry: (err, retry) => resourceEvent(job, "provider.retried", { model: providerRequest.model, provider: providerForModel(providerRequest.model), httpStatus: err?.status, retryCount: retry }, "warn") })
        : send();
      const result = await Promise.race([call, deadline]);
      providerFinished = true;
      providerResult = result;
      resourceEvent(job, "provider.completed", { model: result?.model || providerRequest.model, provider: result?.provider, responseId: result?.responseId, durationMs: Date.now() - providerStarted, ...result?.usage });
      if (validate) await resourceStage(job, "validation", () => validate(result));
      await progress(`Saving stage ${completed + 1}`);
      const saveMs = await checkpoint.save(result);
      completed += 1;
      resourceEvent(job, "checkpoint.saved", { completedStages: completed, durationMs: saveMs });
      await progress(`${completed} steps saved · preparing the next step`);
      // A caller can mutate parsed in place (diagram fills / verification).
      // Return an isolated value so replay always starts from the same bytes.
      return structuredClone(result);
    } catch (err) {
      failure = err;
      if (providerStarted !== undefined && !providerFinished) resourceEvent(job, "provider.failed", { model: activeModel, provider: providerForModel(activeModel),
        responseId: err?.responseId, errorCode: err?.code || "PROVIDER_FAILURE", httpStatus: err?.status, durationMs: Date.now() - providerStarted, ...err?.usage }, signal?.aborted ? "info" : "error");
      if (providerResult?.usage) { err.usage = providerResult.usage; err.provider = providerResult.provider; }
      const recoverable = ["RESOURCE_STAGE_TIMEOUT", "RESOURCE_BATCH_INVALID", "RESOURCE_PLAN_INVALID"].includes(err?.code) ||
        (!err?.resourceControl && !err?.refusal && !signal?.aborted && (err?.modelFailure || [429, 503, 529].includes(err?.status)));
      if (request.optionalReview && recoverable && !signal?.aborted) {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(job.ref);
          const current = snap.data() || {};
          if (!snap.exists || current.status !== "processing" || current.attemptId !== job.attemptId || current.cancelRequested) throw controlError("RESOURCE_SUPERSEDED", "This worker no longer owns the resource.");
          tx.update(job.ref, { optionalReviewFailures: { ...current.optionalReviewFailures, [key]: err?.code || "REVIEW_FAILED" } });
        });
        resourceEvent(job, "review.unavailable_saved", { errorCode: err?.code || "REVIEW_FAILED", outcome: "draft", recoveryDecision: "keep_draft" }, "warn");
        throw controlError("RESOURCE_REVIEW_UNAVAILABLE", "This optional review could not finish; the draft is retained.");
      }
      // RES-70. A best-effort stage (an optional diagram fill) that fails saves
      // nothing, so without a record every later worker sent it again: one job
      // re-sent 11 failing fills on each of 16 hand-offs. Record the failure;
      // a deterministic one is given up at once, a transient one after two.
      if (request.bestEffort && !signal?.aborted && (!err?.resourceControl || err?.code === "RESOURCE_STAGE_TIMEOUT")) {
        const entry = await db.runTransaction(async (tx) => {
          const snap = await tx.get(job.ref);
          const current = snap.data() || {};
          if (!snap.exists || current.status !== "processing" || current.attemptId !== job.attemptId || current.cancelRequested) throw controlError("RESOURCE_SUPERSEDED", "This worker no longer owns the resource.");
          const previous = current.optionalStageFailures?.[key] || current.optionalStageFailures?.[legacyKey] || {};
          // RES-80: a refusal of a best-effort call is random (Sonnet refused
          // 0–3 question bank calls per resource, and the same prompt usually
          // went through the second time), so it earns the second attempt a
          // busy provider gets.
          const next = { code: String(err?.code || err?.status || "PROVIDER_FAILURE").slice(0, 60), failures: (previous.failures || 0) + 1, transient: isTransient(err) || err?.refusal === true };
          tx.update(job.ref, { optionalStageFailures: { ...current.optionalStageFailures, [key]: next } });
          return next;
        });
        job.optionalStageFailures = { ...job.optionalStageFailures, [key]: entry };
        resourceEvent(job, "recovery.decided", { errorCode: entry.code, retryCount: entry.failures, recoveryDecision: bestEffortGivenUp(entry) ? "omit_optional" : "retry_optional" }, "warn");
        throw err;
      }
      if (job.generationVersion === 1 && recoverable && !request.optionalReview) {
        const failures = (recovery.failures || 0) + 1;
        const next = { failures, ...(err.resourceControl && err.reason ? { lastReason: err.reason } : {}), split: Boolean(request.splitAllowed && err?.code === "RESOURCE_STAGE_TIMEOUT"),
          fallback: failures >= 2 && Boolean(fallbackModel), exhausted: failures >= (fallbackModel ? 3 : 2) };
        const stats = await timingStats();
        const count = await db.runTransaction(async (tx) => {
          const snap = await tx.get(job.ref);
          const current = snap.data() || {};
          if (!snap.exists || current.status !== "processing" || current.attemptId !== job.attemptId || current.cancelRequested) throw controlError("RESOURCE_SUPERSEDED", "This worker no longer owns the resource.");
          const count = (current.stageRecoveryCount || 0) + 1;
          tx.update(job.ref, { stageRecovery: { ...current.stageRecovery, [key]: next }, stageRecoveryCount: count,
            progress: { ...progressFields(current, count > MAX_STAGE_RECOVERIES || next.exhausted ? "Recovery limit reached" : next.split ? "Continuing in smaller batches" : next.fallback ? "Retrying this stage with the backup model" : "Retrying this stage from saved progress", stats), retrying: true } });
          return count;
        });
        resourceEvent(job, "recovery.decided", { errorCode: err?.code || "PROVIDER_FAILURE", reason: err?.resourceControl ? err?.reason : undefined, retryCount: failures,
          recoveryDecision: count > MAX_STAGE_RECOVERIES || next.exhausted ? "exhausted" : next.split ? "split" : next.fallback ? "fallback" : "retry" }, "warn");
        if (count > MAX_STAGE_RECOVERIES || next.exhausted) {
          // A plan that never validates is usually an under-specified request,
          // not an oversized one (RES-70), so say what to add.
          if (err?.code === "RESOURCE_PLAN_INVALID") throw Object.assign(controlError("RESOURCE_RECOVERY_EXHAUSTED", "The generator couldn't plan this resource. Add the topics, number of questions and, for a paper, the sitting time, then submit again."), { reason: err.reason });
          throw controlError("RESOURCE_RECOVERY_EXHAUSTED", "Generation reached its recovery limit. Completed stages are retained; reduce the request before retrying.");
        }
        throw controlError("RESOURCE_STAGE_YIELD", next.split ? "Continuing in smaller batches" : next.fallback ? "Retrying this stage with the backup model" : "Retrying this stage from saved progress");
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      await release?.(failure);
    }
  }
}

function isTransient(err) {
  const status = Number(err?.status);
  return status === 429 || status >= 500 || err?.stopReason === "max_tokens";
}

// A deterministic failure (a rejected schema, an invalid response) will fail the
// same way again, and so, in practice, does an optional stage that ran out its
// two minutes. A busy or failing provider deserves one more attempt, and so
// does a response cut off at its token limit: that is a runaway generation,
// which the same request usually does not repeat.
function bestEffortGivenUp(entry) {
  return Boolean(entry) && entry.failures >= (entry.transient ? 2 : 1);
}

function bestEffortSkipped(code) {
  // Deliberately not a resourceControl error: the caller treats this as the
  // optional stage failing (the diagram is omitted), not as the job stopping.
  return Object.assign(new Error("This optional step failed earlier and is not retried."), { code: "RESOURCE_OPTIONAL_SKIPPED", previousCode: code || null, modelFailure: true });
}

async function generateWorksheetBatches({ job, request, callAi, count }) {
  const chunks = [];
  noteProgress(job, { questionCount: count });
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
    noteProgress(job, { questionsWritten: end - start + 1 });
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
