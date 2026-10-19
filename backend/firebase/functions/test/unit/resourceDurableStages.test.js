"use strict";
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { createDurableCaller } = require("../../src/resources/durableStages");

function harness(callAi, timeoutMs) {
  const values = new Map();
  const current = { status: "processing", attemptId: "a" };
  const db = { runTransaction: async (fn) => fn({
    get: async () => ({ exists: true, data: () => current }), update: (_ref, patch) => Object.assign(current, patch),
  }) };
  const storage = { bucket: () => ({ file: (path) => ({
    download: async () => { if (!values.has(path)) throw Object.assign(new Error("missing"), { code: 404 }); return [Buffer.from(values.get(path))]; },
    save: async (data) => values.set(path, data),
  }) }) };
  return { current, values, make: () => createDurableCaller({ job: { jobId: "j", attemptId: "a", ref: {} }, db, storage, callAi, timeoutMs }) };
}

it("bounds a hung provider, aborts it, and never checkpoints its late result", async () => {
  let signal;
  let finish;
  const h = harness((request) => { signal = request.signal; return new Promise((resolve) => { finish = resolve; }); }, 10);
  await assert.rejects(h.make()({ userMessage: "slow" }), { code: "RESOURCE_STAGE_TIMEOUT" });
  assert.equal(signal.aborted, true);
  finish({ parsed: { stale: true } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.values.size, 0);
});

it("never publishes a checkpoint from a superseded worker", async () => {
  const h = harness(async () => { h.current.attemptId = "new"; return { parsed: {} }; });
  await assert.rejects(h.make()({ userMessage: "old" }), { code: "RESOURCE_SUPERSEDED" });
  assert.equal(h.values.size, 0);
});

it("resumes exact completed responses without sending another provider request", async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; return { parsed: { value: "original" } }; });
  const request = { userMessage: "same", model: "m" };
  const first = h.make();
  const result = await first(request);
  result.parsed.value = "mutated";
  await assert.rejects(first({ ...request, userMessage: "next" }), { code: "RESOURCE_STAGE_YIELD" });
  assert.equal((await h.make()(request)).parsed.value, "original");
  assert.equal(calls, 1);
});

it("does not cache an invalid batch, allowing a later retry to regenerate it", async () => {
  let calls = 0;
  const h = harness(async () => ({ parsed: { valid: ++calls > 1 } }));
  const request = { userMessage: "batch", validateStageResult: (result) => {
    if (!result.parsed.valid) throw Object.assign(new Error("invalid batch"), { resourceControl: true });
  } };
  await assert.rejects(h.make()(request), /invalid batch/);
  assert.equal(h.values.size, 0);
  assert.equal((await h.make()(request)).parsed.valid, true);
});
