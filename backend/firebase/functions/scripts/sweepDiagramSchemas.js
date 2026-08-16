"use strict";

// Compile sweep for the maths diagram schemas (AWP-15 part 2).
//
// For every constrainable diagram type: send one small constrained request and
// check that (a) the API compiles the schema at all, and (b) what comes back
// passes builder/validation.js. A schema the API accepts but the validator
// rejects is worse than no schema, so both halves matter.
//
// Usage: ANTHROPIC_API_KEY=... node scripts/sweepDiagramSchemas.js [type ...]

const { callAnthropicForResource } = require("../src/resources/apiClient");
const {
  CONSTRAINABLE_DIAGRAM_TYPES,
  FALLBACK_DIAGRAM_TYPES,
  buildDiagramFillSchema,
} = require("../src/resources/diagramSchema");
const { DIAGRAM_REGISTRY } = require("../src/resources/diagramRegistry");
const { validateDiagram } = require("../src/resources/builder/validation");

const MODEL = process.env.RESOURCE_LLM_MODEL || "claude-opus-5";

function countOptional(schema, acc = { n: 0 }) {
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
  for (const branch of schema.anyOf || []) countOptional(branch, acc);
  return acc.n;
}

function errorClass(message) {
  if (/too many optional parameters/.test(message)) return "optional-param limit";
  if (/union types/.test(message)) return "union-type limit";
  if (/grammar is too large/.test(message)) return "grammar too large";
  if (/too complex/.test(message)) return "too complex";
  if (/compilation timed out/.test(message)) return "compile timeout";
  const m = /"message":"([^"]+)"/.exec(message);
  return m ? m[1].slice(0, 110) : message.slice(0, 110);
}

async function sweepType(type) {
  const schema = buildDiagramFillSchema(type);
  const optional = countOptional(schema);
  const example = JSON.stringify(DIAGRAM_REGISTRY[type].promptExample);
  const started = Date.now();
  try {
    const { parsed } = await callAnthropicForResource({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: MODEL,
      maxTokens: 3000,
      systemPrompt:
        "You produce diagram specifications for NSW maths teaching resources. Return JSON only.",
      userMessage: [
        `Produce one "${type}" diagram for item 1.`,
        `Here is the shape of a valid ${type}, for reference:`,
        example,
        "Use realistic Year 9 values.",
      ].join("\n\n"),
      responseSchema: schema,
      mathBearing: true,
    });
    const ms = Date.now() - started;
    const entry = parsed?.diagrams?.[0];
    if (!entry?.diagram) {
      return { type, ok: false, ms, optional, why: "no diagram in response" };
    }
    try {
      validateDiagram(entry.diagram, `${type}.diagram`);
    } catch (err) {
      return { type, ok: false, ms, optional, why: `validator: ${err.message.slice(0, 90)}` };
    }
    return { type, ok: true, ms, optional };
  } catch (err) {
    return {
      type,
      ok: false,
      ms: Date.now() - started,
      optional,
      why: errorClass(err.message),
    };
  }
}

(async () => {
  // Fail loudly on a key that is obviously not a key. This script is usually
  // fed from `firebase functions:secrets:access`, and an expired Firebase
  // session makes that print an error message to stdout instead — which then
  // sails through as the API key and reports every single type as failing.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  if (!/^sk-[\w-]+$/.test(apiKey)) {
    throw new Error(
      `ANTHROPIC_API_KEY does not look like an API key (${apiKey.length} chars, starts "${apiKey.slice(0, 12)}"). ` +
        "If it came from `firebase functions:secrets:access`, the Firebase session has probably expired — run `firebase login --reauth`."
    );
  }
  const requested = process.argv.slice(2);
  const types = requested.length ? requested : CONSTRAINABLE_DIAGRAM_TYPES;

  console.log(`sweeping ${types.length} constrainable types on ${MODEL}`);
  console.log(`(${FALLBACK_DIAGRAM_TYPES.size} on the unconstrained fallback: ${[...FALLBACK_DIAGRAM_TYPES].join(", ")})\n`);

  const results = [];
  for (const type of types) {
    const result = await sweepType(type);
    results.push(result);
    console.log(
      `${result.ok ? "OK  " : "FAIL"} ${type.padEnd(18)} ${String(result.ms).padStart(6)}ms  ` +
        `${String(result.optional).padStart(2)} optional${result.ok ? "" : `  -> ${result.why}`}`
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} compiled and validated`);
  if (failed.length) {
    console.log("move to FALLBACK_DIAGRAM_TYPES:", failed.map((r) => r.type).join(", "));
    process.exitCode = 1;
  }
})();
