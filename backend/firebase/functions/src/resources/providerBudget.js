"use strict";

const { randomUUID } = require("node:crypto");
const { resourceEvent } = require("./resourceLog");

const PROVIDERS = ["anthropic", "openai"];
const WINDOW_MS = 60_000;
const LEASE_MS = 540_000;

// With a shared budget the SDKs' own retries are off (maxRetries: 0), so a 429
// reaches the budget and sets one shared cooldown instead of every worker
// retrying it blind. Every other failure the SDK would have retried (overload,
// 5xx, a dropped connection) is retried here, inside the permit, on the same
// schedule. Without this a single 529 counted as a failed stage: two moved the
// stage to the fallback model and an optional review gave up at once.
const TRANSIENT_STATUSES = new Set([408, 409, 500, 502, 503, 504, 529]);
const CONNECTION_ERRORS = new Set(["APIConnectionError", "APIConnectionTimeoutError"]);
const TRANSIENT_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 20_000;

function headerValue(err, name) {
  const headers = err?.headers;
  return headers?.get?.(name) ?? headers?.[name];
}

function isTransientProviderError(err) {
  if (!err || err.resourceControl || err.refusal) return false;
  const shouldRetry = headerValue(err, "x-should-retry");
  if (shouldRetry === "false") return false;
  const status = Number(err.status);
  if (status === 429) return false;
  if (shouldRetry === "true") return true;
  if (status) return TRANSIENT_STATUSES.has(status) || status >= 500;
  return CONNECTION_ERRORS.has(err.constructor?.name) || CONNECTION_ERRORS.has(err.name);
}

function transientRetryDelayMs(err, attempt) {
  const ms = Number(headerValue(err, "retry-after-ms"));
  if (ms > 0 && ms <= MAX_RETRY_DELAY_MS) return ms;
  const seconds = Number(headerValue(err, "retry-after"));
  if (seconds > 0 && seconds * 1000 <= MAX_RETRY_DELAY_MS) return seconds * 1000;
  // The SDKs' schedule: 0.5s doubling, capped at 8s, with up to 25% jitter off.
  return Math.min(500 * 2 ** attempt, 8_000) * (1 - Math.random() * 0.25);
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error("aborted"));
    const onAbort = () => { clearTimeout(timer); reject(signal.reason || new Error("aborted")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function withTransientRetries(call, { signal, delayMs = transientRetryDelayMs, onRetry } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= TRANSIENT_RETRIES || signal?.aborted || !isTransientProviderError(err)) throw err;
      onRetry?.(err, attempt + 1);
      await abortableSleep(delayMs(err, attempt), signal);
    }
  }
}

function queuePolicy(config, tutor) {
  const providerLimits = {};
  for (const provider of PROVIDERS) {
    const limit = config?.providerLimits?.[provider];
    if (Number.isInteger(limit?.maxConcurrent) && limit.maxConcurrent >= 2 && limit.maxConcurrent <= 80 &&
        Number.isInteger(limit.maxStartsPerMinute) && limit.maxStartsPerMinute >= 2 && limit.maxStartsPerMinute <= 1000) {
      providerLimits[provider] = limit;
    }
  }
  // A bad or incomplete configuration cannot switch on a second turn.
  if (PROVIDERS.some((provider) => !providerLimits[provider])) return { maxTurns: 1, providerLimits: {} };
  const twoTurns = Array.isArray(config?.twoTurnTutorUids) && config.twoTurnTutorUids.includes(tutor);
  return { maxTurns: twoTurns ? 2 : 1, providerLimits };
}

function retryAfter(err, now) {
  if (Number(err?.status) !== 429) return 0;
  const header = (name) => headerValue(err, name);
  const ms = Number(header("retry-after-ms"));
  if (ms > 0 && Number.isFinite(ms)) return now + ms;
  const value = header("retry-after");
  const seconds = Number(value);
  if (seconds > 0 && Number.isFinite(seconds)) return now + seconds * 1000;
  const date = Date.parse(value);
  return date > now ? date : now + 5_000;
}

function createProviderBudget({ db, job, limits, extraTurn, clock = Date.now }) {
  async function acquire(provider) {
    const limit = limits[provider];
    if (!limit) return null;
    const ref = db.collection("resourceProviderBudgets").doc(provider);
    const leaseId = randomUUID();
    const state = await db.runTransaction(async (tx) => {
      const now = clock();
      const snapshot = await tx.get(ref);
      const data = snapshot.data() || {};
      const leases = Object.fromEntries(Object.entries(data.leases || {}).filter(([, expiry]) => expiry > now));
      const starts = (data.starts || []).filter((start) => start > now - WINDOW_MS).sort((a, b) => a - b);
      // A second turn cannot exhaust the capacity available to first turns.
      const concurrentCap = limit.maxConcurrent - (extraTurn ? 1 : 0);
      const startsCap = limit.maxStartsPerMinute - (extraTurn ? Math.ceil(limit.maxStartsPerMinute / 4) : 0);
      if (data.blockedUntil > now) return { retryAt: data.blockedUntil, reason: "provider_backoff" };
      if (starts.length >= startsCap) return { retryAt: starts[starts.length - startsCap] + WINDOW_MS, reason: "request_rate" };
      if (Object.keys(leases).length >= concurrentCap) return { retryAt: now + 2_000, reason: "concurrent_calls" };
      tx.set(ref, { leases: { ...leases, [leaseId]: now + LEASE_MS }, starts: [...starts, now], blockedUntil: data.blockedUntil || 0 });
      return { leaseId };
    });
    if (state.retryAt) {
      resourceEvent(job, "provider.deferred", { provider, reason: state.reason, durationMs: Math.max(0, state.retryAt - clock()) });
      throw Object.assign(new Error("Waiting for model capacity"), {
        code: "RESOURCE_STAGE_YIELD", resourceControl: true, queueNotBeforeMs: state.retryAt,
      });
    }

    return async (error) => {
      try {
        await db.runTransaction(async (tx) => {
          const data = (await tx.get(ref)).data();
          if (!data?.leases?.[leaseId]) return;
          const { [leaseId]: _released, ...leases } = data.leases;
          tx.update(ref, { leases, blockedUntil: Math.max(data.blockedUntil || 0, retryAfter(error, clock())) });
        });
      } catch {
        // Expiry also releases the slot after an invocation or release failure.
        resourceEvent(job, "provider.permit_release_failed", { provider }, "warn");
      }
    };
  }

  async function run(provider, call, { delayMs } = {}) {
    const release = await acquire(provider);
    let failure;
    try {
      return await withTransientRetries(call, { delayMs });
    } catch (err) {
      failure = err;
      throw err;
    } finally {
      await release?.(failure);
    }
  }

  return { acquire, run };
}

module.exports = { createProviderBudget, isTransientProviderError, queuePolicy, withTransientRetries };
