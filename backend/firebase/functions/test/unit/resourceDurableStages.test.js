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
  return { current, values, db, storage, callAi, make: (job = {}) => createDurableCaller({ job: { jobId: "j", attemptId: "a", ref: {}, ...job }, db, storage, callAi, timeoutMs }) };
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

it("starts one provider call when stages arrive together, saving it before yielding", async () => {
  let calls = 0;
  const h = harness(async (request) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { parsed: { diagram: request.userMessage } };
  });
  const caller = h.make();
  const results = await Promise.allSettled(["a", "b", "c"].map((userMessage) => caller({ userMessage })));
  assert.equal(calls, 1);
  assert.equal(results[0].status, "fulfilled");
  assert.deepEqual(results.slice(1).map((r) => r.reason.code), ["RESOURCE_STAGE_YIELD", "RESOURCE_STAGE_YIELD"]);
  assert.equal(h.values.size, 1, "the started call was saved before the others yielded");
});

it("reads explicit question counts that name a topic", () => {
  const { requestedQuestionCount } = require("../../src/resources/durableStages");
  assert.equal(requestedQuestionCount("250 algebra questions"), 250);
  assert.equal(requestedQuestionCount("30 geometry problems"), 30);
  assert.equal(requestedQuestionCount("Year 9, 180 worked maths questions"), 180);
  assert.equal(requestedQuestionCount("Year 9 questions on Chapter 16 problems"), null);
});

it("lets the next stage run after a failed call, and still yields once one is saved", async () => {
  const calls = [];
  const h = harness(async (request) => {
    calls.push(request.userMessage);
    if (request.userMessage === "text-1") throw new Error("provider rejected");
    return { parsed: { text: request.userMessage } };
  });
  const caller = h.make();
  await assert.rejects(caller({ userMessage: "text-1" }), /provider rejected/);
  assert.equal((await caller({ userMessage: "text-2" })).parsed.text, "text-2");
  await assert.rejects(caller({ userMessage: "text-3" }), { code: "RESOURCE_STAGE_YIELD" });
  assert.deepEqual(calls, ["text-1", "text-2"]);
  assert.equal(h.values.size, 1, "only the successful stage is saved");

  // The next invocation replays text-2 and reaches text-3; it never loops on text-1's failure alone.
  const next = h.make();
  await assert.rejects(next({ userMessage: "text-1" }), /provider rejected/);
  assert.equal((await next({ userMessage: "text-2" })).parsed.text, "text-2");
  assert.equal((await next({ userMessage: "text-3" })).parsed.text, "text-3");
});

it("starts one call at a time when concurrent stages wait on a failed one", async () => {
  let running = 0;
  let maxRunning = 0;
  const h = harness(async (request) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    if (request.userMessage === "a") throw new Error("provider rejected");
    return { parsed: { diagram: request.userMessage } };
  });
  const caller = h.make();
  const results = await Promise.allSettled(["a", "b", "c"].map((userMessage) => caller({ userMessage })));
  assert.equal(maxRunning, 1);
  assert.equal(results[0].reason.message, "provider rejected");
  assert.equal(results[1].status, "fulfilled");
  assert.equal(results[2].reason.code, "RESOURCE_STAGE_YIELD");
});

// RES-70. Optional diagram fills that failed were re-sent by every later
// worker, because a failure saves no checkpoint: one job re-sent 11 failing
// fills on each of 16 hand-offs.
it("records a failed best-effort stage and never sends it again in a later worker", async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; throw Object.assign(new Error("Invalid schema"), { status: 400, code: "invalid_json_schema" }); });
  const request = { userMessage: "fill triangles", model: "m", bestEffort: true };
  await assert.rejects(h.make()(request), { code: "invalid_json_schema" });
  const [entry] = Object.values(h.current.optionalStageFailures);
  assert.deepEqual(entry, { code: "invalid_json_schema", failures: 1, transient: false });

  const nextWorker = h.make({ optionalStageFailures: h.current.optionalStageFailures });
  await assert.rejects(nextWorker(request), (err) => err.code === "RESOURCE_OPTIONAL_SKIPPED" && !err.resourceControl);
  assert.equal(calls, 1);
});

it("gives a transient best-effort failure one more attempt", async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; throw Object.assign(new Error("busy"), { status: 529 }); });
  const request = { userMessage: "fill cones", model: "m", bestEffort: true };
  await assert.rejects(h.make()(request), /busy/);
  await assert.rejects(h.make({ optionalStageFailures: h.current.optionalStageFailures })(request), /busy/);
  await assert.rejects(h.make({ optionalStageFailures: h.current.optionalStageFailures })(request), { code: "RESOURCE_OPTIONAL_SKIPPED" });
  assert.equal(calls, 2);
});

it("leaves the checkpoint key unchanged by the best-effort flag", async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; return { parsed: { ok: true } }; });
  await h.make()({ userMessage: "fill", model: "m" });
  assert.deepEqual((await h.make()({ userMessage: "fill", model: "m", bestEffort: true })).parsed, { ok: true });
  assert.equal(calls, 1);
});

it("caps a best-effort stage at the optional time limit and gives it up after one timeout", async () => {
  let calls = 0;
  const h = harness(() => { calls += 1; return new Promise(() => {}); }, 60_000);
  const caller = (job = {}) => createDurableCaller({ job: { jobId: "j", attemptId: "a", ref: {}, ...job }, db: h.db, storage: h.storage, callAi: h.callAi, timeoutMs: 60_000, optionalTimeoutMs: 10 });
  const request = { userMessage: "fill cones", model: "m", bestEffort: true };
  const started = Date.now();
  await assert.rejects(caller()(request), { code: "RESOURCE_STAGE_TIMEOUT" });
  assert.ok(Date.now() - started < 5_000);
  assert.deepEqual(Object.values(h.current.optionalStageFailures)[0], { code: "RESOURCE_STAGE_TIMEOUT", failures: 1, transient: false });
  await assert.rejects(caller({ optionalStageFailures: h.current.optionalStageFailures })(request), { code: "RESOURCE_OPTIONAL_SKIPPED" });
  assert.equal(calls, 1);
});

it("retries a best-effort stage once after a runaway response hit its token limit", async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; throw Object.assign(new Error("AI response was truncated at the 8000 token output limit."), { stopReason: "max_tokens", modelFailure: true }); });
  const request = { userMessage: "fill cones", model: "m", bestEffort: true };
  await assert.rejects(h.make()(request), /truncated/);
  assert.equal(Object.values(h.current.optionalStageFailures)[0].transient, true);
  await assert.rejects(h.make({ optionalStageFailures: h.current.optionalStageFailures })(request), /truncated/);
  await assert.rejects(h.make({ optionalStageFailures: h.current.optionalStageFailures })(request), { code: "RESOURCE_OPTIONAL_SKIPPED" });
  assert.equal(calls, 2);
});
