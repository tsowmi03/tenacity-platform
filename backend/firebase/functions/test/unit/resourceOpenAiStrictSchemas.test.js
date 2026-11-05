"use strict";

// RES-70. OpenAI's strict structured outputs reject a schema before the model
// runs (`invalid_json_schema`) when any object leaves a property out of
// `required` or allows additional properties. GPT is the default resource
// provider, so a schema that breaks these rules fails every call made with it.
// This walks every schema the generator sends and checks the rules locally.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CONSTRAINABLE_DIAGRAM_TYPES,
  buildDiagramFillSchema,
  buildDiagramJudgeSchema,
  buildDiagramRepairSchema,
  stripDiagramNulls,
} = require("../../src/resources/diagramSchema");
const {
  SCHEMA_BUILDERS,
  SPLIT_SCHEMA_BUILDERS,
  buildResponseSchema,
  buildSplitResponseSchemas,
  buildVerifiedAnswersSchema,
} = require("../../src/resources/responseSchema");
const { validateDiagram } = require("../../src/resources/builder/validation");
const { DIAGRAM_REGISTRY } = require("../../src/resources/diagramRegistry");

// Keywords strict mode does not support.
const UNSUPPORTED = ["oneOf", "allOf", "not", "if", "then", "else", "patternProperties", "dependentRequired", "dependentSchemas", "uniqueItems", "contains", "minProperties", "maxProperties"];

function strictViolations(schema, path = "$", out = []) {
  if (!schema || typeof schema !== "object") return out;
  for (const key of UNSUPPORTED) if (key in schema) out.push(`${path} uses ${key}`);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("object") || schema.properties) {
    if (schema.additionalProperties !== false) out.push(`${path} allows additional properties`);
    const required = new Set(schema.required || []);
    const missing = Object.keys(schema.properties || {}).filter((key) => !required.has(key));
    if (missing.length) out.push(`${path} does not require ${missing.join(", ")}`);
    for (const [key, value] of Object.entries(schema.properties || {})) strictViolations(value, `${path}.${key}`, out);
  }
  if (schema.items) strictViolations(schema.items, `${path}[]`, out);
  (schema.anyOf || []).forEach((branch, index) => strictViolations(branch, `${path}|${index}`, out));
  return out;
}

test("every constrained diagram schema passes OpenAI strict mode", () => {
  const failures = {};
  for (const type of CONSTRAINABLE_DIAGRAM_TYPES) {
    const problems = [
      ...strictViolations(buildDiagramFillSchema(type), "fill"),
      ...strictViolations(buildDiagramRepairSchema(type), "repair"),
    ];
    if (problems.length) failures[type] = problems;
  }
  assert.deepEqual(failures, {});
  assert.deepEqual(strictViolations(buildDiagramJudgeSchema()), []);
});

test("resource response schemas pass OpenAI strict mode", () => {
  const failures = [];
  for (const subject of ["maths", "english"]) {
    for (const answerMode of ["answers", "worked"]) {
      for (const hasStimulus of [false, true]) {
        const options = { subject, answerMode, hasStimulus };
        for (const type of Object.keys(SCHEMA_BUILDERS)) {
          failures.push(...strictViolations(buildResponseSchema(type, options), `${type}/${subject}/${answerMode}`));
        }
        for (const type of Object.keys(SPLIT_SCHEMA_BUILDERS)) {
          for (const [part, schema] of Object.entries(buildSplitResponseSchemas(type, options))) {
            failures.push(...strictViolations(schema, `${type}.${part}/${subject}/${answerMode}`));
          }
        }
      }
    }
  }
  failures.push(...strictViolations(buildVerifiedAnswersSchema(), "verifiedAnswers"));
  assert.deepEqual(failures, []);
});

test("optional diagram fields are nullable, and the nulls are removed before validation", () => {
  const schema = buildDiagramSchemaFor("triangle");
  assert.deepEqual(schema.properties.dimensionLabels.type, ["object", "null"]);
  assert.deepEqual(schema.properties.dimensionLabels.properties.base.type, ["string", "null"]);
  // A free-text unit is where GPT ran away ("cm 脚"); shapes take a fixed unit.
  assert.deepEqual(schema.properties.unit.enum, ["mm", "cm", "m", "km", "units"]);

  const filled = {
    type: "triangle",
    dimensions: { base: 8, height: 6 },
    unit: "cm",
    dimensionLabels: { base: null, height: "h" },
  };
  assert.deepEqual(stripDiagramNulls(filled).dimensionLabels, { height: "h" });
  assert.equal("dimensionLabels" in stripDiagramNulls({ ...filled, dimensionLabels: null }), false);
  assert.doesNotThrow(() => validateDiagram(stripDiagramNulls(filled), "diagram"));

  const venn = stripDiagramNulls({
    type: "venn-diagram",
    style: "2-set",
    sets: [{ label: "Tea" }, { label: "Coffee" }],
    counts: { A: 5, B: 3, C: null, AB: 2, AC: null, BC: null, ABC: null, none: 1 },
  });
  assert.deepEqual(venn.counts, { A: 5, B: 3, AB: 2, none: 1 });
  assert.doesNotThrow(() => validateDiagram(venn, "diagram"));
  assert.ok(DIAGRAM_REGISTRY["venn-diagram"]);
});

function buildDiagramSchemaFor(type) {
  return buildDiagramFillSchema(type).properties.diagrams.items.properties.diagram;
}
