"use strict";
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { Timestamp } = require("firebase-admin/firestore");
const { runQueueForTutor, cancelResourceJobImpl } = require("../../src/resources");
const { createMemoryDb, createSmokeJob } = require("../../scripts/liveResourceSmoke");
const { controlError } = require("../../src/resources/durableStages");
const { ResourceCancelledError } = require("../../src/resources/cancellation");
const { terminalFields, resourceStage } = require("../../src/resources/resourceLog");

for (const outcome of ["complete", "failed", "cancelled"]) it(`emits a fresh complete terminal summary after ${outcome}`, async () => {
  let at = new Date("2026-11-02T00:00:01Z");
  const job = { ...createSmokeJob("gpt-6.1-sol"), createdAt: Timestamp.fromMillis(at.getTime() - 1000) };
  const db = createMemoryDb([job]);
  const events = [];
  const storage = { bucket: () => ({ file: () => ({ download: async () => { throw Object.assign(new Error("missing"), { code: 404 }); }, save: async () => {} }) }) };
  await runQueueForTutor(job.createdBy, { db, storage, durableStages: true, clock: () => at,
    resourceLogSink: (_m, event) => events.push(event), callAi: async () => ({ parsed: { saved: true } }),
    generationPipeline: async (_job, deps) => {
      await deps.callAi({ model: "gpt-6.1-sol", userMessage: "synthetic" });
      at = new Date(at.getTime() + 250);
      if (outcome === "failed") throw controlError("RESOURCE_TEST_FAILURE", "private failure text");
      if (outcome === "cancelled") throw new ResourceCancelledError();
      return { outputPath: "local.docx", model: "gpt-6.1-sol" };
    } });
  const terminal = events.find((e) => e.event === `job.${outcome === "complete" ? "completed" : outcome}`);
  assert.ok(terminal);
  assert.equal(terminal.completedStages, 1, "summary uses the latest committed stage count");
  assert.equal(terminal.providerCallCount, 1);
  assert.equal(terminal.activeElapsedMs, 250);
  assert.equal(terminal.queueElapsedMs, 1000);
  assert.equal(terminal.totalElapsedMs, 1250);
  for (const field of ["retryCount", "fallbackCount", "recoveryCount", "leaseRecoveryCount"]) assert.equal(terminal[field], 0);
  assert.equal(db.jobs[0].status, outcome);
  assert.ok(!JSON.stringify(events).includes("private failure text"));
});

it("counts actual retry/fallback executions rather than future recovery decisions", () => {
  const fields = terminalFields({ createdAt: new Date(1000), stageRecoveryCount: 4, stageRetryCount: 1,
    stageFallbackCount: 1, recoveryCount: 2, failover: { toModel: "backup" }, progress: { completedStages: 3 } }, "failed", new Date(2000));
  assert.equal(fields.fallbackCount, 2);
  assert.equal(fields.retryCount, 1);
  assert.equal(fields.recoveryCount, 4);
  assert.equal(fields.leaseRecoveryCount, 2);
  assert.equal(fields.completedStages, 3);
});

it("pairs cancellation with a stopped stage and a cancelled outcome", async () => {
  const events = [];
  await assert.rejects(resourceStage({ jobId: "job", resourceLogSink: (_m, e) => events.push(e) }, "stage", async () => { throw new ResourceCancelledError(); }));
  assert.equal(events.at(-1).event, "stage.stopped");
  assert.equal(events.at(-1).outcome, "cancelled");
});

it("never bypasses a planned content review through whole-document repair", async () => {
  const job = { ...createSmokeJob("gpt-6.1-sol"), generationVersion: 1, resourceType: "practice-paper" };
  const db = createMemoryDb([job]);
  let repairs = 0;
  await runQueueForTutor(job.createdBy, { db, storage: { bucket: () => ({}) }, durableStages: true, enableFailover: false,
    resourceLogSink: () => {},
    generationPipeline: async () => { throw Object.assign(new Error("bad generated shape"), { rawAiText: '{"title":"partial"}', modelFailure: true }); },
    repairPipeline: async () => { repairs++; return { outputPath: "must-not-ship.docx" }; } });
  assert.equal(repairs, 0);
  assert.equal(db.jobs[0].status, "failed");
});
