"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAnthropicSystemParam,
  callAnthropicForResource,
  parseAiJsonResponse,
  stripJsonCodeFence,
} = require("../../src/resources/apiClient");
const {
  GLOBAL_RULES,
  buildSystemPrompt,
  buildUserMessage,
} = require("../../src/resources/promptBuilder");
const { DISABLED_SHAPE_DIAGRAM_TYPES } = require("../../src/resources/diagramPolicy");

describe("resource prompt builder", () => {
  it("builds the worksheet system prompt from the spec schema", () => {
    const prompt = buildSystemPrompt("worksheet", { year: 8, subject: "maths" });
    assert.match(prompt, /Tenacity Tutoring/);
    assert.match(prompt, /Year 8 maths student/);
    assert.match(prompt, /Return ONLY valid JSON/);
    assert.match(prompt, /"questions"/);
    assert.match(prompt, /"diagram": null \| object/);
    assert.match(prompt, /"answers"/);
    assert.ok(prompt.startsWith(GLOBAL_RULES));
  });

  it("documents allowed worksheet diagram types and excludes disabled shapes", () => {
    const prompt = buildSystemPrompt("worksheet", { year: 8, subject: "maths" });

    for (const type of ["number-line", "coordinate-plane", "function-plot", "two-way-table"]) {
      assert.match(prompt, new RegExp(`\\b${type}\\b`));
    }
    for (const type of DISABLED_SHAPE_DIAGRAM_TYPES) {
      assert.doesNotMatch(prompt, new RegExp(`- ${type}:`));
    }
    assert.match(prompt, /Do not include diagrams for pure algebra or linear equations questions/);
  });

  it("does not ask practice, topic, or diagnostic templates for instruction fields", () => {
    for (const resourceType of ["practice-paper", "topic-booklet", "diagnostic-test"]) {
      const prompt = buildSystemPrompt(resourceType, { year: 8, subject: "maths" });
      assert.doesNotMatch(prompt, /"instructions"\s*:/);
    }
  });

  it("builds user messages with optional uploaded content and tutor instructions", () => {
    const message = buildUserMessage(
      {
        resourceType: "worksheet",
        year: 8,
        subject: "maths",
        customPrompt: "Focus on simultaneous equations.",
        uploadedFileName: "notification.pdf",
      },
      "Assessment reference text."
    );

    assert.match(message, /REFERENCE DOCUMENT \(notification\.pdf\)/);
    assert.match(message, /TUTOR INSTRUCTIONS/);
    assert.match(message, /Generate a worksheet for a Year 8 maths student/);
  });

  it("builds prompts for every exposed resource type", () => {
    const resourceTypes = [
      "practice-paper",
      "topic-booklet",
      "study-guide",
      "worksheet",
      "diagnostic-test",
      "mixed-review",
      "annotation-task",
      "essay-scaffold",
      "custom",
    ];

    for (const resourceType of resourceTypes) {
      const prompt = buildSystemPrompt(resourceType, {
        year: 8,
        subject: resourceType.includes("essay") || resourceType.includes("annotation") ? "english" : "maths",
      });
      assert.match(prompt, /Return JSON matching this schema exactly/);
      assert.match(prompt, /"title": string/);
    }
  });

  it("uses marking guides instead of answer keys for English practice resources", () => {
    const resourceTypes = [
      "practice-paper",
      "topic-booklet",
      "worksheet",
      "diagnostic-test",
      "mixed-review",
      "annotation-task",
    ];

    for (const resourceType of resourceTypes) {
      const prompt = buildSystemPrompt(resourceType, { year: 8, subject: "english" });
      assert.match(prompt, /"markingGuide"/);
      assert.match(prompt, /marking guide/i);
      assert.doesNotMatch(prompt, /"workingOut"/);
    }
  });
});

describe("resource Anthropic client", () => {
  it("adds prompt caching for Sonnet system prompts", () => {
    assert.deepEqual(
      buildAnthropicSystemParam({
        model: "claude-sonnet-4-6",
        systemPrompt: "SYSTEM",
      }),
      [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }]
    );
  });

  it("passes non-Sonnet system prompts as plain text", () => {
    assert.equal(
      buildAnthropicSystemParam({
        model: "claude-3-haiku-20240307",
        systemPrompt: "SYSTEM",
      }),
      "SYSTEM"
    );
  });

  it("strips JSON code fences before parsing", () => {
    assert.equal(stripJsonCodeFence("```json\n{\"ok\":true}\n```"), "{\"ok\":true}");
    assert.deepEqual(parseAiJsonResponse("```json\n{\"ok\":true}\n```"), { ok: true });
  });

  it("returns parsed JSON and raw text from the SDK response", async () => {
    const calls = [];
    const result = await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return { content: [{ type: "text", text: "{\"title\":\"Worksheet\"}" }] };
          },
        },
      }),
    });

    assert.deepEqual(result, {
      parsed: { title: "Worksheet" },
      raw: "{\"title\":\"Worksheet\"}",
    });
    assert.deepEqual(calls[0], {
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "USER" }],
    });
  });

  it("attaches raw text when JSON parsing fails", () => {
    assert.throws(
      () => parseAiJsonResponse("not json"),
      (err) => err.rawAiText === "not json" && /not valid JSON/.test(err.message)
    );
  });
});
