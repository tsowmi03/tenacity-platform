"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const logger = require("firebase-functions/logger");
const { isCancellationError } = require("./cancellation");
const context = new AsyncLocalStorage();
const FIELDS = new Set(`jobId runId attemptId invocationId stageId stageExecutionId batchIndex batchCount event outcome reason errorCode recoveryDecision durationMs timeoutMs remainingMs completedStages retryCount fallbackCount model provider responseId inputTokens outputTokens reasoningTokens cachedInputTokens queueWaitMs totalElapsedMs generationVersion questionCount stageCount activeElapsedMs queueElapsedMs recoveryCount leaseRecoveryCount providerCallCount requiredTopicCount coveredTopicCount estimatedMinutes requestedMinutes issueCount scopePass timingPass difficultyPass missingTopicCount excludedTopicCount reviewStatus warningCount progressPhase progressFraction etaMs questionsDone diagramCount diagramsDone`.split(" "));

function resourceEvent(job, event, fields = {}, severity = "info") {
  const current = context.getStore() || {};
  const data = {
    schemaVersion: 1, event, timestamp: new Date().toISOString(),
    jobId: job?.jobId, runId: job?.runId || job?.jobId,
    attemptId: job?.attemptId, invocationId: job?.invocationId || current.invocationId,
    ...current, ...fields,
  };
  const safe = { schemaVersion: 1, timestamp: data.timestamp };
  for (const [key, value] of Object.entries(data)) {
    if (FIELDS.has(key) && value !== undefined && value !== null &&
        ["string", "number", "boolean"].includes(typeof value)) safe[key] = value;
  }
  // No raw exception messages or content: providers sometimes echo prompts.
  (job?.resourceLogSink || logger[severity] || logger.info)("resource_lifecycle", safe);
}

async function resourceStage(job, stageId, fn, fields = {}, outcomeFor = null) {
  const stageExecutionId = randomUUID();
  const started = Date.now();
  return context.run({ ...context.getStore(), invocationId: job?.invocationId || context.getStore()?.invocationId || randomUUID(), stageId, stageExecutionId }, async () => {
    resourceEvent(job, "stage.started", fields);
    try {
      const result = await fn();
      resourceEvent(job, "stage.completed", { ...fields, durationMs: Date.now() - started, outcome: outcomeFor ? outcomeFor(result) : "complete" });
      return result;
    } catch (err) {
      const yielded = err?.code === "RESOURCE_STAGE_YIELD";
      const stopped = yielded || err?.code === "RESOURCE_SUPERSEDED" || isCancellationError(err);
      resourceEvent(job, yielded ? "stage.yielded" : stopped ? "stage.stopped" : "stage.failed",
        { ...fields, durationMs: Date.now() - started, errorCode: err?.code || "UNCLASSIFIED", reason: err?.resourceControl ? err?.reason : undefined, outcome: yielded ? "pending" : isCancellationError(err) ? "cancelled" : err?.code === "RESOURCE_SUPERSEDED" ? "superseded" : "failed" }, stopped ? "info" : "error");
      throw err;
    }
  });
}

function timestampMs(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  return Number(value) || 0;
}

function terminalFields(job, outcome, at = new Date()) {
  const started = timestampMs(job.runStartedAt || job.createdAt);
  const total = started ? Math.max(0, timestampMs(at) - started) : 0;
  return { outcome, totalElapsedMs: total,
    activeElapsedMs: job.activeElapsedMs || 0, queueElapsedMs: job.queueElapsedMs || (!job.stageCount ? total : 0),
    completedStages: job.progress?.completedStages || 0, stageCount: job.stageCount || 0,
    retryCount: job.stageRetryCount || 0, recoveryCount: job.stageRecoveryCount || 0,
    leaseRecoveryCount: job.recoveryCount || 0,
    fallbackCount: (job.stageFallbackCount || 0) + (job.failover ? 1 : 0), providerCallCount: job.providerCallCount || 0 };
}

module.exports = { resourceEvent, resourceStage, terminalFields, timestampMs };
