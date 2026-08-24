"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { fillDiagrams } = require("../../src/resources/index");
const {
  CONSTRAINABLE_DIAGRAM_TYPES,
  FALLBACK_DIAGRAM_TYPES,
  FIXTURE_DIVERGENCES,
  buildDiagramFillSchema,
  buildDiagramSchema,
} = require("../../src/resources/diagramSchema");
const { DIAGRAM_REGISTRY } = require("../../src/resources/diagramRegistry");
const { validateDiagram } = require("../../src/resources/builder/validation");

const job = { jobId: "job-1", year: 9, subject: "maths" };

/** A stub that answers each diagram-fill call from a lookup of type -> diagrams. */
function stubCallAi(byType, calls = []) {
  return async ({ systemPrompt, responseSchema, userMessage }) => {
    const type = /producing "([^"]+)" diagram/.exec(systemPrompt)[1];
    calls.push({ type, constrained: Boolean(responseSchema), userMessage });
    const answer = byType[type];
    if (answer instanceof Error) throw answer;
    return { parsed: { diagrams: answer || [] }, raw: "{}" };
  };
}

// A worksheet-shaped document: one whole-question diagram and one on a sub-part.
function documentFixture() {
  return {
    title: "Measurement",
    questions: [
      { number: 1, stem: "Find the area.", marks: 2, diagram: null, diagramType: "rectangle", diagramRequired: true, parts: null },
      { number: 2, stem: "Algebra only.", marks: 1, diagram: null, diagramType: "none", diagramRequired: false, parts: null },
      {
        number: 3,
        stem: "Two parts.",
        marks: 4,
        diagram: null,
        diagramType: "none",
        diagramRequired: false,
        parts: [
          { label: "a", stem: "Read the clock.", marks: 2, diagram: null, diagramType: "clock", diagramRequired: true },
          { label: "b", stem: "No visual.", marks: 2, diagram: null, diagramType: "none", diagramRequired: false },
        ],
      },
    ],
  };
}

const run = (parsed, byType, calls) =>
  fillDiagrams({ job, parsed, callAi: stubCallAi(byType, calls), apiKey: "k", model: "m" });

describe("maths diagram fill pass", () => {
  it("fills whole-question and sub-part diagrams, one call per type", async () => {
    const parsed = documentFixture();
    const calls = [];
    const result = await run(parsed, {
      rectangle: [{ index: 1, diagram: { type: "rectangle", dimensions: { width: 4, height: 3 }, unit: "cm" } }],
      clock: [{ index: 1, diagram: { type: "clock", hour: 3, minute: 15 } }],
    }, calls);

    assert.deepEqual(result, { requested: 2, filled: 2 });
    assert.equal(parsed.questions[0].diagram.type, "rectangle");
    assert.equal(parsed.questions[2].parts[0].diagram.type, "clock");
    // One call per distinct type, not per diagram.
    assert.deepEqual(calls.map((c) => c.type).sort(), ["clock", "rectangle"]);
  });

  it("strips diagramType from every question, including the ones wanting none", async () => {
    const parsed = documentFixture();
    await run(parsed, {
      rectangle: [{ index: 1, diagram: { type: "rectangle", dimensions: { width: 1, height: 1 }, unit: "cm" } }],
      clock: [{ index: 1, diagram: { type: "clock", hour: 2, minute: 30 } }],
    });

    const scaffolding = JSON.stringify(parsed).includes("diagramType");
    assert.equal(scaffolding, false, "diagramType is scaffolding and must not reach the document");
  });

  it("fails when a required diagram never arrives", async () => {
    const parsed = documentFixture();
    await assert.rejects(
      () => run(parsed, { rectangle: [], clock: [] }),
      /required diagram/i
    );
  });

  it("fails when a required diagram call fails outright", async () => {
    const parsed = documentFixture();
    await assert.rejects(
      () => run(parsed, {
        rectangle: new Error("grammar exploded"),
        clock: [{ index: 1, diagram: { type: "clock", hour: 9, minute: 0 } }],
      }),
      /grammar exploded/
    );
  });

  it("treats an unmatched index as a missing required diagram", async () => {
    const parsed = documentFixture();
    await assert.rejects(() => run(parsed, {
      rectangle: [{ index: 99, diagram: { type: "rectangle", dimensions: { width: 1, height: 1 }, unit: "cm" } }],
      clock: [{ index: 1, diagram: { type: "clock", hour: 2, minute: 30 } }],
    }), /required diagram/i);
  });

  it("still degrades an explicitly optional diagram", async () => {
    const parsed = {
      questions: [
        { number: 1, stem: "Optional visual.", marks: 1, diagram: null, diagramType: "rectangle", diagramRequired: false, parts: null },
      ],
    };
    const result = await run(parsed, { rectangle: [] });
    assert.deepEqual(result, { requested: 1, filled: 0 });
    assert.equal(parsed.questions[0].diagramRequired, false);
  });

  it("runs the awkward types unconstrained rather than not at all", async () => {
    const parsed = {
      questions: [
        { number: 1, stem: "Probability tree.", marks: 3, diagram: null, diagramType: "tree-diagram", diagramRequired: true, parts: null },
      ],
    };
    const calls = [];
    await run(parsed, { "tree-diagram": [{ index: 1, diagram: { type: "tree-diagram", branches: [{ label: "H" }] } }] }, calls);

    assert.equal(calls[0].constrained, false);
    assert.equal(parsed.questions[0].diagram.type, "tree-diagram");
  });

  it("leaves English documents untouched", async () => {
    const parsed = { questions: [{ number: 1, stem: "Analyse.", marks: 3, diagram: null, diagramRequired: false, parts: null }] };
    const calls = [];
    const result = await run(parsed, {}, calls);

    assert.deepEqual(result, { requested: 0, filled: 0 });
    assert.equal(calls.length, 0);
    assert.equal(parsed.questions[0].diagramRequired, false);
  });
});

describe("maths diagram schemas", () => {
  it("covers every registry type as constrained or explicit fallback", () => {
    for (const type of Object.keys(DIAGRAM_REGISTRY)) {
      const handled =
        CONSTRAINABLE_DIAGRAM_TYPES.includes(type) || FALLBACK_DIAGRAM_TYPES.has(type);
      assert.ok(handled, `${type} is neither constrained nor an explicit fallback`);
    }
    for (const type of FALLBACK_DIAGRAM_TYPES) {
      assert.equal(buildDiagramSchema(type), null, `${type} must not have a schema`);
      assert.equal(buildDiagramFillSchema(type), null);
    }
  });

  it("keeps every diagram schema inside the 24 optional-parameter budget", () => {
    const countOptional = (schema, acc = { n: 0 }) => {
      if (!schema || typeof schema !== "object") return acc.n;
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (types.includes("object")) {
        const required = new Set(schema.required || []);
        for (const [key, value] of Object.entries(schema.properties || {})) {
          const valueTypes = Array.isArray(value.type) ? value.type : [value.type];
          if (!required.has(key) || valueTypes.includes("null")) acc.n += 1;
          countOptional(value, acc);
        }
        return acc.n;
      }
      if (schema.items) countOptional(schema.items, acc);
      return acc.n;
    };

    for (const type of CONSTRAINABLE_DIAGRAM_TYPES) {
      const optional = countOptional(buildDiagramFillSchema(type));
      assert.ok(optional <= 24, `${type} spends ${optional} optional params, over the limit of 24`);
    }
  });

  it("accepts its own registry fixture, except where a form was dropped on purpose", () => {
    for (const type of CONSTRAINABLE_DIAGRAM_TYPES) {
      const fixture = DIAGRAM_REGISTRY[type].fixture;
      // The fixture must remain valid to the renderer either way.
      validateDiagram(fixture, type);
      if (FIXTURE_DIVERGENCES.has(type)) continue;
      const schema = buildDiagramSchema(type);
      for (const key of schema.required) {
        assert.ok(key in fixture, `${type} schema requires "${key}" but its fixture omits it`);
      }
      for (const key of Object.keys(fixture)) {
        assert.ok(schema.properties[key], `${type} fixture has "${key}" but the schema forbids it`);
      }
    }
  });

  it("lists only genuine divergences as allowed", () => {
    for (const type of FIXTURE_DIVERGENCES) {
      assert.ok(
        CONSTRAINABLE_DIAGRAM_TYPES.includes(type),
        `${type} is listed as diverging but is not constrained`
      );
    }
  });
});

describe("answer mode reaches the generation schema", () => {
  // Regression guard. The pipeline built its schema without the job's answer
  // mode, so `workingOut` was pinned to null even for a "worked" job. It went
  // unnoticed because the verification pass used to replace whole answer rows
  // against a schema that required working, quietly filling it back in.
  const { buildResponseSchema, buildSplitResponseSchemas } = require("../../src/resources/responseSchema");

  it("asks for working out when the tutor wants worked solutions", () => {
    const worksheet = buildResponseSchema("worksheet", { subject: "maths", answerMode: "worked" });
    assert.deepEqual(worksheet.properties.answers.items.properties.workingOut, { type: "string" });

    const { assessment } = buildSplitResponseSchemas("topic-booklet", {
      subject: "maths",
      answerMode: "worked",
    });
    const groups = assessment.properties.answers.properties;
    for (const key of ["subTopicAnswers", "endQuizAnswers"]) {
      assert.deepEqual(groups[key].items.properties.workingOut, { type: "string" });
    }
  });

  it("forbids working out when the tutor only wants final answers", () => {
    const worksheet = buildResponseSchema("worksheet", { subject: "maths", answerMode: "answers" });
    assert.deepEqual(worksheet.properties.answers.items.properties.workingOut, { type: "null" });
  });
});
