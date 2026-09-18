"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_DIAGRAM_REPAIR_ATTEMPTS,
  collectDiagramOwners,
  repairDiagrams,
  verifyDiagram,
} = require("../../src/resources/diagramRepair");

const job = { jobId: "job-1", year: 9, subject: "maths" };

// A rectangle whose width label cannot be placed: real input, real layout
// failure (DIAGRAM_LAYOUT_ERROR), so the tests below exercise the production
// validator and renderer rather than a stand-in for them.
const UNPLACEABLE_RECTANGLE = Object.freeze({
  type: "rectangle",
  dimensions: { width: 8, height: 4 },
  unit: "cm",
  dimensionLabels: {
    width: "a very long label indeed that will never fit anywhere at all",
  },
});

const GOOD_RECTANGLE = Object.freeze({
  type: "rectangle",
  dimensions: { width: 8, height: 4 },
  unit: "cm",
  dimensionLabels: { width: "x" },
});

/** A worksheet carrying one diagram, required unless told otherwise. */
function documentFixture({ required = true, diagram = UNPLACEABLE_RECTANGLE } = {}) {
  return {
    title: "Measurement",
    questions: [
      {
        number: 1,
        stem: "The rectangle has an area of 32 cm². Find the width x.",
        marks: 3,
        skill: "Area of a rectangle",
        difficulty: "medium",
        diagram: { ...diagram },
        diagramRequired: required,
        parts: null,
      },
    ],
    answers: [{ number: 1, answer: "x = 8 cm", workingOut: "32 ÷ 4 = 8", marks: 3 }],
  };
}

/**
 * A callAi stub that answers the two kinds of call this pass makes, told apart
 * by their system prompt. `repairs` is consumed one per repair call; `verdicts`
 * one per faithfulness check. An Error in either list is thrown instead.
 */
function stubCallAi({ repairs = [], verdicts = [], calls = [] } = {}) {
  const repairQueue = [...repairs];
  const verdictQueue = [...verdicts];
  return async ({ systemPrompt, userMessage, responseSchema, signal }) => {
    const kind = systemPrompt.startsWith("You are repairing") ? "repair" : "judge";
    calls.push({ kind, userMessage, constrained: Boolean(responseSchema), signal });
    const next = kind === "repair" ? repairQueue.shift() : verdictQueue.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) {
      throw new Error(`stub ran out of ${kind} answers`);
    }
    return { parsed: kind === "repair" ? { diagram: next } : next, raw: "{}" };
  };
}

const faithful = { faithful: true, reason: "8 cm base and 4 cm height match the question" };
const unfaithful = { faithful: false, reason: "the diagram shows 10 cm, the question says 8 cm" };

const run = (parsed, stub, overrides = {}) =>
  repairDiagrams({ job, parsed, callAi: stub, model: "claude-opus-5", ...overrides });

describe("diagram repair: finding the diagrams to check", () => {
  it("finds diagrams on questions, sub-parts, and nested booklet sections", () => {
    const owners = collectDiagramOwners({
      questions: [
        { number: 1, stem: "Whole question.", diagram: { type: "rectangle" } },
        {
          number: 4,
          stem: "Has parts.",
          parts: [
            { label: "a", stem: "Part with a clock.", diagram: { type: "clock" } },
            { label: "b", stem: "No visual.", diagram: null },
          ],
        },
      ],
      subTopics: [
        {
          practiceQuestions: [
            { number: 2, stem: "Booklet question.", diagram: { type: "number-line" } },
          ],
        },
      ],
    });

    assert.deepEqual(
      owners.map((entry) => [entry.label, entry.owner.diagram.type]),
      [
        ["Question 1", "rectangle"],
        ["Question 4 part a", "clock"],
        ["Question 2", "number-line"],
      ]
    );
  });

  it("reads a question's requirement, marks, and text off the owner", () => {
    const [entry] = collectDiagramOwners(documentFixture({ required: false }));
    assert.equal(entry.required, false);
    assert.equal(entry.marks, 3);
    assert.match(entry.question, /area of 32 cm/);
  });
});

describe("diagram repair: a failure that repairs", () => {
  it("replaces a diagram that fails layout with one that validates and renders", async () => {
    const parsed = documentFixture();
    const calls = [];
    const result = await run(
      parsed,
      stubCallAi({ repairs: [GOOD_RECTANGLE], verdicts: [faithful], calls })
    );

    assert.equal(result.changed, true);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(parsed.questions[0].diagram, GOOD_RECTANGLE);
    assert.equal(result.summary.attempted, 1);
    assert.equal(result.summary.repaired, 1);
    assert.equal(result.summary.calls, 1);
    // One repair call and one faithfulness check, in that order.
    assert.deepEqual(calls.map((call) => call.kind), ["repair", "judge"]);
  });

  it("keeps trying, up to three attempts, until one is accepted", async () => {
    const parsed = documentFixture();
    const calls = [];
    const result = await run(
      parsed,
      stubCallAi({
        // First comes back still unplaceable, second is rejected as wrong, third lands.
        repairs: [UNPLACEABLE_RECTANGLE, GOOD_RECTANGLE, GOOD_RECTANGLE],
        verdicts: [unfaithful, faithful],
        calls,
      })
    );

    assert.equal(result.summary.repaired, 1);
    assert.equal(result.summary.calls, 3);
    assert.equal(result.summary.attempts[0].attempts, 3);
    assert.equal(result.summary.attempts[0].outcome, "repaired");
    assert.deepEqual(
      result.summary.attempts[0].trail.map((row) => row.outcome),
      ["detected", "invalid", "rejected", "accepted"]
    );
  });

  it("changes the diagram and nothing else about the question", async () => {
    const parsed = documentFixture();
    const before = JSON.parse(JSON.stringify(parsed));

    await run(parsed, stubCallAi({ repairs: [GOOD_RECTANGLE], verdicts: [faithful] }));

    before.questions[0].diagram = GOOD_RECTANGLE;
    assert.deepEqual(parsed, before);
  });

  it("never puts the answer in front of the model it asks for a diagram", async () => {
    const parsed = documentFixture();
    const calls = [];
    await run(parsed, stubCallAi({ repairs: [GOOD_RECTANGLE], verdicts: [faithful], calls }));

    for (const call of calls) {
      assert.equal(call.userMessage.includes("32 ÷ 4 = 8"), false);
      assert.equal(call.userMessage.includes("x = 8 cm"), false);
    }
  });

  it("costs nothing when every diagram is already sound", async () => {
    const parsed = documentFixture({ diagram: GOOD_RECTANGLE });
    const calls = [];
    const result = await run(parsed, stubCallAi({ calls }));

    assert.equal(result.changed, false);
    assert.equal(result.summary.checked, 1);
    assert.equal(result.summary.attempted, 0);
    assert.deepEqual(calls, []);
  });
});

describe("diagram repair: exhausted attempts", () => {
  it("omits an optional diagram with the existing warning after three attempts", async () => {
    const parsed = documentFixture({ required: false });
    const result = await run(
      parsed,
      stubCallAi({
        repairs: [UNPLACEABLE_RECTANGLE, UNPLACEABLE_RECTANGLE, UNPLACEABLE_RECTANGLE],
      })
    );

    assert.equal(parsed.questions[0].diagram, null);
    assert.equal(parsed.questions[0].diagramRequired, false);
    assert.equal(result.summary.omitted, 1);
    assert.equal(result.summary.calls, MAX_DIAGRAM_REPAIR_ATTEMPTS);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].code, "OPTIONAL_DIAGRAM_OMITTED");
    assert.equal(result.warnings[0].diagramType, "rectangle");
    assert.match(result.warnings[0].message, /Question 1/);
  });

  it("hard-fails a required diagram with an actionable error and its record", async () => {
    const parsed = documentFixture({ required: true });
    const thrown = await run(
      parsed,
      stubCallAi({
        repairs: [UNPLACEABLE_RECTANGLE, UNPLACEABLE_RECTANGLE, UNPLACEABLE_RECTANGLE],
      })
    ).then(
      () => null,
      (error) => error
    );

    assert.ok(thrown, "a required diagram must not be delivered unrepaired");
    assert.match(
      thrown.message,
      /Required diagram for Question 1 could not be produced after 3 repair attempts/
    );
    assert.equal(thrown.code, "DIAGRAM_RENDER_ERROR");
    assert.equal(thrown.diagramRequired, true);
    assert.equal(thrown.diagramRepairExhausted, true);
    assert.equal(thrown.diagramRepairAttempts, MAX_DIAGRAM_REPAIR_ATTEMPTS);
    assert.equal(thrown.diagramRepairs.failed, 1);
    assert.equal(thrown.diagramRepairs.attempts[0].outcome, "failed");
    // The question keeps its diagram: nothing was quietly dropped on the way out.
    assert.ok(parsed.questions[0].diagram);
  });

  it("does not repair towards a diagram type the renderer does not have", async () => {
    const parsed = documentFixture({ required: false, diagram: { type: "hologram" } });
    const calls = [];
    const result = await run(parsed, stubCallAi({ calls }));

    assert.deepEqual(calls, [], "there is no corrected spec of an unsupported type to ask for");
    assert.equal(parsed.questions[0].diagram, null);
    assert.equal(result.summary.omitted, 1);
  });
});

describe("diagram repair: the faithfulness gate", () => {
  it("rejects a diagram that renders perfectly but contradicts its question", async () => {
    const parsed = documentFixture({ required: false });
    const calls = [];
    const result = await run(
      parsed,
      stubCallAi({
        repairs: [GOOD_RECTANGLE, GOOD_RECTANGLE, GOOD_RECTANGLE],
        verdicts: [unfaithful, unfaithful, unfaithful],
        calls,
      })
    );

    assert.equal(parsed.questions[0].diagram, null, "a mismatched diagram is not delivered");
    assert.equal(result.summary.repaired, 0);
    assert.equal(result.summary.omitted, 1);
    assert.equal(calls.filter((call) => call.kind === "judge").length, 3);
    assert.match(result.warnings[0].message, /did not match the question/);
  });

  it("tells the next attempt why the last one was rejected", async () => {
    const parsed = documentFixture();
    const calls = [];
    await run(
      parsed,
      stubCallAi({
        repairs: [GOOD_RECTANGLE, GOOD_RECTANGLE],
        verdicts: [unfaithful, faithful],
        calls,
      })
    );

    const secondRepair = calls.filter((call) => call.kind === "repair")[1];
    assert.match(secondRepair.userMessage, /the diagram shows 10 cm, the question says 8 cm/);
  });

  it("does not accept a diagram it could not check, and stops rather than looping", async () => {
    const parsed = documentFixture({ required: false });
    const calls = [];
    const result = await run(
      parsed,
      stubCallAi({
        repairs: Array(8).fill(GOOD_RECTANGLE),
        verdicts: Array(8).fill(new Error("checker unavailable")),
        calls,
      })
    );

    assert.equal(parsed.questions[0].diagram, null);
    assert.equal(result.summary.repaired, 0);
    // The outage gives the attempt back, so the cap that ends this is the
    // outage cap — bounded, not unbounded.
    assert.equal(calls.filter((call) => call.kind === "judge").length, MAX_DIAGRAM_REPAIR_ATTEMPTS);
  });
});

describe("diagram repair: budgets and cancellation", () => {
  it("stops spending once the resource-wide call ceiling is reached", async () => {
    const parsed = {
      title: "Many diagrams",
      questions: [1, 2, 3].map((number) => ({
        number,
        stem: `Question ${number}.`,
        marks: 2,
        diagram: { ...UNPLACEABLE_RECTANGLE },
        diagramRequired: false,
      })),
    };
    const calls = [];
    const result = await run(
      parsed,
      stubCallAi({ repairs: Array(12).fill(UNPLACEABLE_RECTANGLE), calls }),
      { maxRepairCalls: 4 }
    );

    assert.equal(calls.filter((call) => call.kind === "repair").length, 4);
    assert.equal(result.summary.calls, 4);
    assert.equal(result.summary.omitted, 3, "every diagram still reaches a final outcome");
    // Q1 spends three attempts, Q2 gets one before the ceiling, Q3 gets none —
    // and the two that ran into it say so rather than looking like three
    // genuine failures.
    const budgeted = result.summary.attempts.filter((row) => row.budgetExhausted);
    assert.equal(budgeted.length, 2);
    assert.deepEqual(
      result.summary.attempts.map((row) => row.attempts),
      [3, 1, 0]
    );
  });

  it("aborts as soon as the tutor cancels, without spending another call", async () => {
    const parsed = documentFixture({ required: false });
    const calls = [];
    let cancelled = false;
    const stub = stubCallAi({ repairs: Array(3).fill(UNPLACEABLE_RECTANGLE), calls });

    await assert.rejects(
      () =>
        run(parsed, async (args) => {
          cancelled = true;
          return stub(args);
        }, { isCancelled: () => cancelled }),
      /cancelled/i
    );

    assert.equal(calls.length, 1, "the cancel is noticed before the next attempt is bought");
    assert.ok(parsed.questions[0].diagram, "a cancelled job leaves the document alone");
  });

  it("checks for a cancel before it touches the first diagram", async () => {
    const parsed = documentFixture();
    await assert.rejects(
      () => run(parsed, stubCallAi({}), { isCancelled: () => true }),
      /cancelled/i
    );
  });
});

describe("diagram repair: the production verify path", () => {
  it("rejects invalid, unrenderable, and unplaceable specifications alike", async () => {
    const cases = [
      { type: "rectangle", dimensions: { width: "3x + 1", height: 4 }, unit: "cm" },
      { type: "not-a-diagram" },
      UNPLACEABLE_RECTANGLE,
    ];
    for (const spec of cases) {
      await assert.rejects(
        () => verifyDiagram(spec, { label: "Q1", required: true }),
        (err) => ["DIAGRAM_RENDER_ERROR", "DIAGRAM_LAYOUT_ERROR"].includes(err.code)
      );
    }
  });

  it("accepts a diagram the document builder can draw", async () => {
    await verifyDiagram(GOOD_RECTANGLE, { label: "Q1", required: true });
  });
});

describe("diagram repair: wired into the generation pipeline", () => {
  const { runGenerationPipeline } = require("../../src/resources");

  function fakeStorage() {
    const saved = [];
    return {
      saved,
      bucket: () => ({
        file: (path) => ({
          async save(buffer, options) {
            saved.push({ path, buffer, options });
          },
        }),
      }),
    };
  }

  const worksheetJson = {
    title: "Area Worksheet",
    subject: "maths",
    year: 9,
    topic: "Area of rectangles",
    totalMarks: 3,
    questions: [
      {
        number: 1,
        stem: "The rectangle has an area of 32 cm². Find the width x.",
        marks: 3,
        workingLines: 2,
        parts: null,
        diagram: { ...UNPLACEABLE_RECTANGLE },
        diagramRequired: true,
      },
    ],
    answers: [{ questionNumber: 1, partLabel: null, answer: "x = 8 cm" }],
  };

  const pipelineJob = {
    jobId: "job-1",
    attemptId: "attempt-1",
    createdBy: "tutor-1",
    studentName: "Mei Tanaka",
    subject: "maths",
    year: 9,
    resourceType: "worksheet",
    model: "claude-opus-5",
    customPrompt: "One area question.",
  };

  it("repairs a broken diagram before the document is built, and stores what it built", async () => {
    const storage = fakeStorage();
    const kinds = [];

    const result = await runGenerationPipeline(pipelineJob, {
      storage,
      anthropicApiKey: "test-key",
      clock: () => new Date("2026-05-23T00:00:00.000Z"),
      callAi: async ({ systemPrompt }) => {
        if (systemPrompt.startsWith("You are repairing")) {
          kinds.push("repair");
          return { parsed: { diagram: GOOD_RECTANGLE }, raw: "{}" };
        }
        if (systemPrompt.startsWith("You are checking whether")) {
          kinds.push("judge");
          return { parsed: faithful, raw: "{}" };
        }
        kinds.push("generate");
        return {
          parsed: JSON.parse(JSON.stringify(worksheetJson)),
          raw: JSON.stringify(worksheetJson),
        };
      },
    });

    assert.deepEqual(kinds, ["generate", "repair", "judge"]);
    // A real DOCX came out the other side — the repaired diagram rendered.
    assert.equal(storage.saved[0].buffer.subarray(0, 2).toString("utf8"), "PK");
    // generatedJson is what was built, not what the model first said, so a
    // retry or a revision reads the document the tutor actually received.
    const stored = JSON.parse(result.generatedJson);
    assert.deepEqual(stored.questions[0].diagram, GOOD_RECTANGLE);
    assert.equal(result.diagramRepairs.repaired, 1);
    assert.equal(result.diagramRepairs.provider, "anthropic");
  });

  it("fails the job, with the record attached, when a required diagram cannot be saved", async () => {
    const thrown = await runGenerationPipeline(pipelineJob, {
      storage: fakeStorage(),
      anthropicApiKey: "test-key",
      clock: () => new Date("2026-05-23T00:00:00.000Z"),
      callAi: async ({ systemPrompt }) => {
        if (systemPrompt.startsWith("You are repairing")) {
          return { parsed: { diagram: UNPLACEABLE_RECTANGLE }, raw: "{}" };
        }
        return {
          parsed: JSON.parse(JSON.stringify(worksheetJson)),
          raw: JSON.stringify(worksheetJson),
        };
      },
    }).then(
      () => null,
      (error) => error
    );

    assert.ok(thrown);
    assert.equal(thrown.diagramRepairExhausted, true);
    assert.equal(thrown.diagramRepairs.failed, 1);
    // The generation is kept so the failed job can still be inspected.
    assert.ok(thrown.rawAiText);
  });
});
