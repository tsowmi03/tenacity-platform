"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ENGLISH_SCHEMA_BUILDERS,
  SINGLE_CALL_TOO_LARGE,
  SPLIT_SCHEMA_BUILDERS,
  buildResponseSchema,
  buildSplitResponseSchemas,
  buildVerifiedAnswersSchema,
} = require("../../src/resources/responseSchema");
const { RESOURCE_TYPES } = require("../../src/resources/modelMap");
const { FIXTURES } = require("../../../functions/scripts/renderResourceFixtures");
const {
  RESOURCE_BUILDERS,
} = require("../../src/resources/builder");

// Keywords this module must not emit. Most are rejected outright by structured
// outputs (the numeric and string constraints); `$ref`/`$defs` are accepted by
// the API but deliberately unused — they buy nothing (the grammar is inlined
// either way, measured on the topic booklet) and they are how a recursive
// schema would sneak past the ancestor check below.
const FORBIDDEN_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "multipleOf",
  "pattern",
  "$ref",
  "$defs",
  "definitions",
  "patternProperties",
];

/**
 * Walk a schema, asserting it stays inside the subset structured outputs
 * accepts. `ancestors` tracks the path (not every node seen) so shared leaf
 * constants like `str` appearing in two branches are fine, while a node that
 * contains itself — a recursive schema — is caught.
 */
function assertSchemaIsApiLegal(schema, path = "$", ancestors = new Set()) {
  assert.equal(typeof schema, "object", `${path} must be a schema object`);
  assert.ok(schema !== null, `${path} must not be null`);
  assert.ok(!ancestors.has(schema), `${path} is recursive; structured outputs forbids that`);

  for (const keyword of FORBIDDEN_KEYWORDS) {
    assert.ok(
      !(keyword in schema),
      `${path} uses "${keyword}", which structured outputs rejects`
    );
  }

  const nextAncestors = new Set(ancestors).add(schema);

  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((branch, index) =>
      assertSchemaIsApiLegal(branch, `${path}.anyOf[${index}]`, nextAncestors)
    );
    return;
  }

  // Optional fields widen `type` to a union with "null" rather than forking
  // with anyOf — see the nullable() comment in responseSchema.js. Only null may
  // be unioned in; anything else would be a schema saying two different things.
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length > 1) {
    assert.ok(
      types.includes("null") && types.length === 2,
      `${path} may only union a type with "null", got ${JSON.stringify(schema.type)}`
    );
  }
  const baseType = types.find((type) => type !== "null") ?? "null";

  if (baseType === "object") {
    assert.ok(schema.properties, `${path} object must declare properties`);
    assert.equal(
      schema.additionalProperties,
      false,
      `${path} must set additionalProperties: false`
    );
    // Every property is required; optionality is expressed as a null branch.
    assert.deepEqual(
      [...(schema.required || [])].sort(),
      Object.keys(schema.properties).sort(),
      `${path} must list every property in required`
    );
    for (const [key, child] of Object.entries(schema.properties)) {
      assertSchemaIsApiLegal(child, `${path}.${key}`, nextAncestors);
    }
    return;
  }

  if (baseType === "array") {
    assert.ok(schema.items, `${path} array must declare items`);
    assertSchemaIsApiLegal(schema.items, `${path}[]`, nextAncestors);
    return;
  }

  assert.ok(
    ["string", "number", "integer", "boolean", "null"].includes(baseType),
    `${path} has unsupported type ${JSON.stringify(schema.type)}`
  );
}

/**
 * A validator for the small JSON Schema subset this module emits. Purpose-built
 * rather than pulling in ajv: the subset is deliberately tiny (that is the whole
 * point of structured outputs), and the functions bundle does not need another
 * production dependency to satisfy a test.
 */
function validate(schema, value, path = "$") {
  if (Array.isArray(schema.anyOf)) {
    const failures = [];
    for (const branch of schema.anyOf) {
      const errors = validate(branch, value, path);
      if (!errors.length) return [];
      failures.push(...errors);
    }
    return [`${path} matched none of the allowed shapes (${failures.length} branch failures)`];
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("null") && value === null) return [];
  const baseType = types.find((type) => type !== "null") || "null";

  switch (baseType) {
    case "null":
      return value === null ? [] : [`${path} must be null`];
    case "string":
      if (typeof value !== "string") return [`${path} must be a string`];
      if (schema.enum && !schema.enum.includes(value)) {
        return [`${path} must be one of ${schema.enum.join(", ")}, got ${value}`];
      }
      return [];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path} must be a boolean`];
    case "integer":
      return Number.isInteger(value) ? [] : [`${path} must be an integer`];
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? []
        : [`${path} must be a number`];
    case "array": {
      if (!Array.isArray(value)) return [`${path} must be an array`];
      return value.flatMap((item, index) =>
        validate(schema.items, item, `${path}[${index}]`)
      );
    }
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [`${path} must be an object`];
      }
      const errors = [];
      for (const key of schema.required || []) {
        if (!(key in value)) errors.push(`${path}.${key} is required`);
      }
      for (const key of Object.keys(value)) {
        if (!schema.properties[key]) {
          errors.push(`${path}.${key} is not allowed`);
          continue;
        }
        errors.push(...validate(schema.properties[key], value[key], `${path}.${key}`));
      }
      return errors;
    }
    default:
      return [`${path} has unsupported schema type ${schema.type}`];
  }
}

const ENGLISH_FIXTURES = FIXTURES.filter(([, resource]) => resource.subject === "english");

describe("resource response schemas", () => {
  it("covers every resource type the builders can render", () => {
    for (const resourceType of RESOURCE_TYPES) {
      assert.ok(
        ENGLISH_SCHEMA_BUILDERS[resourceType],
        `${resourceType} has no English response schema`
      );
      // Drift guard the other way: a schema for a type nothing can build.
      assert.ok(
        RESOURCE_BUILDERS[resourceType],
        `${resourceType} has a schema but no builder`
      );
    }
  });

  it("emits only schema constructs structured outputs accepts", () => {
    // Walks every schema, including the topic booklet's — it is withheld from
    // generation for size, not because it is malformed, and it should stay
    // well-formed for when the grammar budget allows it.
    for (const [resourceType, build] of Object.entries(ENGLISH_SCHEMA_BUILDERS)) {
      assertSchemaIsApiLegal(build(), resourceType);
    }
    assertSchemaIsApiLegal(buildVerifiedAnswersSchema(), "verifiedAnswers");
  });

  it("has no single-call schema for types generated in two calls", () => {
    // Verified against the live API: the whole booklet schema returns
    // 400 "compiled grammar is too large", so it is never sent as one.
    for (const resourceType of [...SINGLE_CALL_TOO_LARGE]) {
      assert.equal(
        buildResponseSchema(resourceType, { subject: "english" }),
        null,
        `${resourceType} must not be sent as a single schema`
      );
      assert.ok(
        SPLIT_SCHEMA_BUILDERS[resourceType],
        `${resourceType} needs split schemas to be generated at all`
      );
    }
  });

  it("splits the booklet into two halves that together cover the whole shape", () => {
    const { content, assessment } = buildSplitResponseSchemas("topic-booklet", {
      subject: "english",
    });
    assertSchemaIsApiLegal(content, "topic-booklet.content");
    assertSchemaIsApiLegal(assessment, "topic-booklet.assessment");

    // Merging the halves must reproduce the single-call shape exactly — that is
    // what makes the merged document indistinguishable from an unsplit one.
    const whole = ENGLISH_SCHEMA_BUILDERS["topic-booklet"]();
    assert.deepEqual(
      [...Object.keys(content.properties), ...Object.keys(assessment.properties)].sort(),
      Object.keys(whole.properties).sort()
    );
    // ...and the halves must not overlap, or the merge would silently pick one.
    const overlap = Object.keys(content.properties).filter(
      (key) => key in assessment.properties
    );
    assert.deepEqual(overlap, []);
  });

  it("constrains every English resource type, one way or the other", () => {
    for (const resourceType of RESOURCE_TYPES) {
      const single = buildResponseSchema(resourceType, { subject: "english" });
      const split = buildSplitResponseSchemas(resourceType, { subject: "english" });
      assert.ok(
        single || split,
        `${resourceType} is generated unconstrained`
      );
    }
  });

  it("does not split maths generation", () => {
    for (const resourceType of RESOURCE_TYPES) {
      assert.equal(
        buildSplitResponseSchemas(resourceType, { subject: "maths" }),
        null
      );
    }
  });

  it("leaves maths generation unconstrained until the diagram union lands", () => {
    for (const resourceType of RESOURCE_TYPES) {
      assert.equal(
        buildResponseSchema(resourceType, { subject: "maths" }),
        null,
        `${resourceType} must not be constrained for maths yet`
      );
    }
  });

  it("returns null for an unknown resource type rather than throwing", () => {
    assert.equal(buildResponseSchema("not-a-type", { subject: "english" }), null);
  });

  it("accepts the English render fixtures", () => {
    assert.ok(ENGLISH_FIXTURES.length >= 3, "expected English fixtures to cover the schema");
    for (const [resourceType, resource] of ENGLISH_FIXTURES) {
      const schema = buildResponseSchema(resourceType, { subject: resource.subject });
      const errors = validate(schema, resource, resourceType);
      assert.deepEqual(errors, [], `${resourceType} fixture does not match its schema`);
    }
  });

  it("only offers a stimulus when one was actually sourced", () => {
    // The point of the flag: a resource the planner judged not to need reading
    // texts cannot be handed the field, so the model cannot substitute its own
    // writing for verified public-domain text.
    const withStimulus = ["practice-paper", "study-guide", "worksheet", "diagnostic-test", "mixed-review", "essay-scaffold"];
    for (const resourceType of withStimulus) {
      const sourced = buildResponseSchema(resourceType, { subject: "english", hasStimulus: true });
      const unsourced = buildResponseSchema(resourceType, { subject: "english", hasStimulus: false });
      assert.ok("stimulus" in sourced.properties, `${resourceType} should offer a stimulus when sourced`);
      assert.ok(!("stimulus" in unsourced.properties), `${resourceType} must not offer a stimulus unsourced`);
      assert.ok(!unsourced.required.includes("stimulus"));
      assertSchemaIsApiLegal(sourced, `${resourceType}.sourced`);
    }
  });

  it("never offers a stimulus for topic booklets", () => {
    const { content } = buildSplitResponseSchemas("topic-booklet", { subject: "english" });
    assert.ok(!("stimulus" in content.properties));
    assert.ok(!("stimulus" in ENGLISH_SCHEMA_BUILDERS["topic-booklet"]().properties));
  });

  it("validates a sourced stimulus payload", () => {
    const schema = buildResponseSchema("practice-paper", { subject: "english", hasStimulus: true });
    const [, fixture] = ENGLISH_FIXTURES.find(([type]) => type === "practice-paper");
    const sourced = {
      ...fixture,
      stimulus: [
        {
          label: "Text 1",
          textType: "poem",
          title: "The Listeners",
          author: "Walter de la Mare",
          source: "Wikisource",
          body: "'Is there anybody there?' said the Traveller,\nKnocking on the moonlit door;",
        },
      ],
    };
    assert.deepEqual(validate(schema, sourced, "practice-paper"), []);
  });

  it("rejects a field the model invented", () => {
    const schema = buildResponseSchema("annotation-task", { subject: "english" });
    const [, fixture] = ENGLISH_FIXTURES.find(([type]) => type === "annotation-task");
    const errors = validate(schema, { ...fixture, mysteryField: "surprise" }, "$");
    assert.ok(
      errors.some((error) => error.includes("mysteryField")),
      "additionalProperties: false should reject unknown fields"
    );
  });
});
