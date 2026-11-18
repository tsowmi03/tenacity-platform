"use strict";

// RES-117. A diagram question's stem doesn't repeat what its diagram shows.
// The values, labels and positions go in a "diagramBrief" that is never
// printed, and every step that draws, repairs, checks or replaces a diagram
// reads it.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildResponseSchema } = require("../../src/resources/responseSchema");
const { buildSystemPrompt } = require("../../src/resources/promptBuilder");
const { fillDiagrams } = require("../../src/resources/index");
const { collectDiagramOwners } = require("../../src/resources/diagramRepair");
const { settleOmittedDiagrams, safeRewording } = require("../../src/resources/omittedDiagrams");

const job = { jobId: "job-1", year: 7, subject: "maths" };
const BRIEF = "Parallel lines l (above) and m cut by transversal t. Angle below l, left of t: 52°. Angle above m, right of t: x.";

function findQuestionSchema(schema) {
  let found = null;
  const walk = (node) => {
    if (found || !node || typeof node !== "object") return;
    if (node.properties?.stem && node.properties?.marks) { found = node; return; }
    Object.values(node).forEach(walk);
  };
  walk(schema);
  return found;
}

describe("the diagram brief (RES-117)", () => {
  it("is a required maths field and absent from English questions", () => {
    const maths = findQuestionSchema(buildResponseSchema("worksheet", { subject: "maths", answerMode: "answers" }));
    assert.equal(maths.properties.diagramBrief.type, "string");
    assert.ok(maths.required.includes("diagramBrief"));
    const english = findQuestionSchema(buildResponseSchema("worksheet", { subject: "english", answerMode: "answers" }));
    assert.equal(english.properties.diagramBrief, undefined);
  });

  it("replaces the rule that made stems restate the diagram", () => {
    const prompt = buildSystemPrompt("worksheet", { year: 7, subject: "maths", answerMode: "answers" });
    assert.doesNotMatch(prompt, /stands on its own/);
    assert.match(prompt, /the stem does not repeat what it shows/);
    assert.match(prompt, /When "diagramType" is "none", set "diagramBrief" to ""/);
    assert.match(prompt, /sketch, draw or plot a graph keeps every given/);
  });

  it("is sent to the diagram fill, with a part's question and its brief", async () => {
    const part = { label: "a", stem: "Find x. Give a reason.", marks: 2, diagram: null, diagramType: "parallel-lines", diagramRequired: true, diagramBrief: "Angle above m, right of t: x." };
    const parsed = { questions: [{ number: 4, stem: "Lines l and m are parallel.", marks: 2, diagram: null, diagramType: "none", diagramRequired: false, diagramBrief: "Parallel lines l and m.", parts: [part] }] };
    const seen = [];
    await fillDiagrams({ job, parsed, apiKey: "k", model: "m", callAi: async ({ userMessage }) => {
      seen.push(userMessage);
      return { parsed: { diagrams: [{ index: 1, diagram: { type: "parallel-lines" } }] } };
    } });
    assert.match(seen[0], /Lines l and m are parallel\. Find x\. Give a reason\./);
    assert.match(seen[0], /Diagram brief: Parallel lines l and m\. Angle above m, right of t: x\./);
  });

  it("is shown to the repair and the faithfulness check", () => {
    const q = { number: 4, stem: "Find x. Give a reason.", marks: 2, diagram: { type: "parallel-lines" }, diagramBrief: BRIEF };
    const [owner] = collectDiagramOwners({ questions: [q] });
    assert.equal(owner.question, `Find x. Give a reason.\nDiagram brief: ${BRIEF}`);
    const plain = collectDiagramOwners({ questions: [{ number: 1, stem: "Find the area.", diagram: { type: "rectangle" } }] });
    assert.equal(plain[0].question, "Find the area.");
  });
});

describe("a question whose diagram is left out still works (RES-117)", () => {
  const run = (q, items, seen = []) => settleOmittedDiagrams({ job, parsed: { questions: [q] }, omissions: [{ label: "Question 4", owner: q }], model: "m", effort: "medium",
    callAi: async (req) => { seen.push(req); return { parsed: { items } }; } });

  it("is rewritten with the facts from its brief", async () => {
    const q = { number: 4, stem: "Find x in the diagram. Give a reason.", marks: 2, diagram: null, diagramBrief: BRIEF, parts: [] };
    const seen = [];
    const stem = "Lines l and m are parallel, cut by transversal t. The angle below l and left of t is 52°, and x is the angle above m and right of t. Find x. Give a reason.";
    const out = await run(q, [{ index: 1, outcome: "reworded", stem, parts: [] }], seen);
    assert.match(seen[0].userMessage, /"diagramBrief":"Parallel lines l/);
    assert.match(seen[0].systemPrompt, /facts from its diagramBrief/);
    assert.deepEqual(out.warnings, []);
    assert.equal(q.stem, stem);
  });

  it("refuses a rewording that brings in a number from neither the stem nor the brief", async () => {
    const q = { number: 4, stem: "Find x in the diagram.", marks: 2, diagram: null, diagramBrief: BRIEF, parts: [] };
    const out = await run(q, [{ index: 1, outcome: "reworded", stem: "The angle is 48°. Find x.", parts: [] }]);
    assert.equal(out.warnings.length, 1);
    assert.equal(q.stem, "Find x in the diagram.");
    assert.equal(safeRewording("Find x in the diagram.", "The angle is 52°. Find x.", BRIEF), true);
    assert.equal(safeRewording("Find x in the diagram.", "The angle is 48°. Find x.", BRIEF), false);
  });
});
