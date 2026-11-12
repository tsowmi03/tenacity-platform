"use strict";

const { randomUUID } = require("node:crypto");
const { resourceEvent } = require("./resourceLog");

const PROVIDERS = ["anthropic", "openai"];
const WINDOW_MS = 60_000;
const LEASE_MS = 540_000;

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
  const headers = err.headers;
  const header = (name) => headers?.get?.(name) ?? headers?.[name];
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

  async function run(provider, call) {
    const release = await acquire(provider);
    let failure;
    try {
      return await call();
    } catch (err) {
      failure = err;
      throw err;
    } finally {
      await release?.(failure);
    }
  }

  return { acquire, run };
}

module.exports = { createProviderBudget, queuePolicy };
