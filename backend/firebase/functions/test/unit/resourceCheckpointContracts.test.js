"use strict";
// RES-111. A versioned checkpoint is identified by its contract and inputs, not
// by its prompt text, so a saved result survives a worker deploy. The cost is
// that a prompt change no longer invalidates old results by itself. This test
// makes that a deliberate decision: it fingerprints every contracted stage's
// prompts on a fixed job and fails when they change under the same version.
//
// When it fails, decide whether results saved under the old prompt are still
// fit to use:
//   - No  -> bump that stage's checkpointContract.version.
//   - Yes -> keep the version and record the new fingerprint.
// Then refresh the file:
//   UPDATE_CHECKPOINT_FINGERPRINTS=1 node --test test/unit/resourceCheckpointContracts.test.js
const { it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { generatePlannedResource } = require("../../src/resources/plannedGeneration");

const SNAPSHOT = path.join(__dirname, "../fixtures/checkpointContractFingerprints.json");
const prompt = "Exclude all of chapter 2 and everything after 10H. Create 7 word problems per topic of varying difficulties for the remaining topics. Supplied contents: Algebra; Geometry.";
const paperPrompt = "Write a paper for a 90-minute sitting. Algebra; Geometry.";

function plan(count = 14) {
  return { title: "Practice", clarification: "", timeAllowed: "90 minutes",
    topics: [{ name: "Algebra", evidence: "Algebra" }, { name: "Geometry", evidence: "Geometry" }],
    questions: Array.from({ length: count }, (_, i) => ({ number: i + 1, topic: i < count / 2 ? "Algebra" : "Geometry", section: i < count / 2 ? "A" : "B", difficulty: "increasing", marks: 2, sourceIds: [], estimatedMinutes: 6 })) };
}

// Deterministic stand-in for the model. The first review reports one issue so
// the repair stage and the re-check run too.
function recordingProvider(requests) {
  let reviews = 0;
  return async (req) => {
    requests.push(req);
    if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: plan() };
    if (req.systemPrompt.startsWith("Independently audit")) {
      reviews += 1;
      const parsed = JSON.parse(req.userMessage.split("GENERATED RESOURCE TO CHECK: ")[1]);
      const questions = parsed.topics ? parsed.sections.flatMap((s) => s.questions) : parsed.questions;
      return { parsed: { scopePass: true, difficultyPass: true,
        issues: reviews === 1 ? [{ questions: [1], problem: "Question 1 repeats question 2.", fix: "Use a different context." }] : [],
        questions: questions.map((q) => ({ number: q.number, coveredSourceIds: [], estimatedMinutes: 6 })) } };
    }
    if (req.userMessage.includes("A review of the finished resource found the problems below")) {
      return { parsed: {
        questions: [{ number: 1, marks: 2, stem: "Repaired problem 1", type: "short-answer", diagram: null, diagramType: "none", diagramRequired: false, parts: null }],
        answers: [{ questionNumber: 1, partLabel: null, answer: "3", workingOut: "1 + 2 = 3", marks: 2 }],
      } };
    }
    const specs = req.userMessage.match(/SAVED PLAN .*?: (\[.*\])\nGenerate/);
    if (specs) {
      const questions = JSON.parse(specs[1]).map((q) => ({ number: q.number, marks: q.marks, stem: `Unique problem ${q.number}`, type: "short-answer", diagram: null, diagramType: "none", diagramRequired: false, parts: null }));
      return { parsed: { title: "Practice", subject: "maths", year: 10, topic: "Algebra", totalMarks: 2 * questions.length, timeAllowed: "90 minutes", questions, sections: [{ title: "batch", questions }], answers: [] } };
    }
    const questions = JSON.parse(req.userMessage.split("\n").at(-1));
    return { parsed: { answers: questions.map((q) => ({ questionNumber: q.number, partLabel: null, answer: "2", workingOut: "1 + 1 = 2", marks: q.marks })) } };
  };
}

// questions.1.2 -> questions, content.repair.1 -> content.repair; plan.v2 and
// content.review.v1(.rN) keep their names.
const family = (stageId) => stageId.replace(/(\.\d+)+$/, "").replace(/\.r\d+$/, "");

async function currentFingerprints() {
  const requests = [];
  for (const type of ["worksheet", "practice-paper"]) {
    const job = { jobId: "fingerprint", generationVersion: 1, resourceType: type, year: "10", subject: "maths", answerMode: "worked",
      customPrompt: type === "worksheet" ? prompt : paperPrompt, resourceLogSink: () => {} };
    await generatePlannedResource({ job, callAi: recordingProvider(requests),
      request: { model: "gpt-test", systemPrompt: "normal", maxTokens: 96000, userMessage: job.customPrompt } });
  }
  const groups = {};
  for (const req of requests.filter((r) => r.checkpointContract)) {
    const name = `${family(req.stageId)}@v${req.checkpointContract.version}`;
    (groups[name] ||= []).push(`${req.stageId}\n${req.systemPrompt}\n${req.userMessage}`);
  }
  return Object.fromEntries(Object.keys(groups).sort().map((name) => [name,
    createHash("sha256").update(JSON.stringify(groups[name].sort())).digest("hex").slice(0, 16)]));
}

it("requires a checkpoint version decision whenever a contracted stage's prompt changes", async () => {
  const current = await currentFingerprints();
  for (const stage of ["plan.v2", "questions", "solutions", "content.review.v1", "content.repair"]) {
    assert.ok(Object.keys(current).some((name) => name.startsWith(`${stage}@`)), `${stage} ran without a checkpoint contract`);
  }
  if (process.env.UPDATE_CHECKPOINT_FINGERPRINTS) {
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(current, null, 2)}\n`);
    return;
  }
  const recorded = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const changed = Object.keys(current).filter((name) => recorded[name] && recorded[name] !== current[name]);
  const unrecorded = Object.keys(current).filter((name) => !recorded[name]);
  assert.deepEqual({ changed, unrecorded }, { changed: [], unrecorded: [] },
    "A checkpointed stage's prompt changed. Bump its checkpointContract.version if results saved under the old " +
    "prompt are unsuitable; otherwise keep the version. Then run: UPDATE_CHECKPOINT_FINGERPRINTS=1 node --test " +
    "test/unit/resourceCheckpointContracts.test.js (see the header of this file).");
});

it("fingerprints are stable from run to run", async () => {
  assert.deepEqual(await currentFingerprints(), await currentFingerprints());
});
