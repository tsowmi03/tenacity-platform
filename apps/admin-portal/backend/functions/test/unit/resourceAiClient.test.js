"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  assertCompleteResponse,
  buildAnthropicSystemParam,
  callAnthropicForResource,
  extractJsonBlock,
  parseAiJsonResponse,
  responseText,
  shouldStreamResponse,
  stripJsonCodeFence,
  streamResponseText,
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
    assert.match(prompt, /"diagramRequired": boolean/);
    assert.match(prompt, /true when the question cannot be answered correctly without seeing the diagram/);
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

  it("extracts JSON from within a code fence block (extractJsonBlock)", () => {
    // Standard fence
    assert.equal(extractJsonBlock("```json\n{\"a\":1}\n```"), "{\"a\":1}");
    // Fence without language tag
    assert.equal(extractJsonBlock("```\n{\"a\":1}\n```"), "{\"a\":1}");
    // Falls back to brace extraction when no fence present
    assert.equal(extractJsonBlock("Here is the JSON: {\"a\":1} done."), "{\"a\":1}");
    // Returns original string when nothing to extract
    assert.equal(extractJsonBlock("no json here"), "no json here");
  });

  it("parses JSON even when the AI adds trailing text after the closing fence", () => {
    const withTrailing = "```json\n{\"ok\":true}\n```\n\nHere is a summary of what I generated.";
    assert.deepEqual(parseAiJsonResponse(withTrailing), { ok: true });
  });

  it("parses JSON when there is explanatory text before the fence", () => {
    const withLeading = "Sure, here is the JSON:\n```json\n{\"ok\":true}\n```";
    assert.deepEqual(parseAiJsonResponse(withLeading), { ok: true });
  });

  it("falls back to brace extraction when fence markers are absent", () => {
    const noFence = "Here is your output: {\"title\":\"Test\",\"questions\":[]} — enjoy!";
    assert.deepEqual(parseAiJsonResponse(noFence), { title: "Test", questions: [] });
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

  it("streams long responses while keeping the same parsed result shape", async () => {
    const calls = [];
    const result = await callAnthropicForResource({
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      maxTokens: 24000,
      createClient: () => ({
        messages: {
          async create(payload) {
            calls.push(payload);
            return [
              { type: "content_block_delta", delta: { type: "text_delta", text: "{\"title\":" } },
              { type: "content_block_delta", delta: { type: "text_delta", text: "\"Worksheet\"}" } },
              { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null } },
            ];
          },
        },
      }),
    });

    assert.deepEqual(result, {
      parsed: { title: "Worksheet" },
      raw: "{\"title\":\"Worksheet\"}",
    });
    assert.equal(calls[0].stream, true);
    assert.equal(calls[0].max_tokens, 24000);
  });

  it("detects truncated streamed responses", async () => {
    const stream = [
      { type: "content_block_delta", delta: { type: "text_delta", text: "{\"title\":\"Worksheet\"" } },
      { type: "message_delta", delta: { stop_reason: "max_tokens", stop_sequence: null } },
    ];
    const response = await streamResponseText(stream);

    assert.throws(
      () => assertCompleteResponse(response, responseText(response), 24000),
      (err) => err.stopReason === "max_tokens" && /truncated/.test(err.message)
    );
  });

  it("streams only when the non-streaming SDK timeout guard would apply", () => {
    assert.equal(shouldStreamResponse(8000), false);
    assert.equal(shouldStreamResponse(21000), false);
    assert.equal(shouldStreamResponse(24000), true);
  });

  it("rejects responses cut off by max_tokens before JSON parsing", async () => {
    await assert.rejects(
      () =>
        callAnthropicForResource({
          apiKey: "test-key",
          model: "claude-sonnet-4-6",
          systemPrompt: "SYSTEM",
          userMessage: "USER",
          maxTokens: 12,
          createClient: () => ({
            messages: {
              async create() {
                return {
                  content: [{ type: "text", text: "{\"title\":\"Worksheet\"" }],
                  stop_reason: "max_tokens",
                };
              },
            },
          }),
        }),
      (err) =>
        err.rawAiText === "{\"title\":\"Worksheet\"" &&
        err.stopReason === "max_tokens" &&
        err.maxTokens === 12 &&
        /truncated/.test(err.message)
    );
  });

  it("passes through complete responses regardless of stop metadata", () => {
    assert.doesNotThrow(() => assertCompleteResponse({ stop_reason: "end_turn" }, "{}", 8000));
  });

  it("attaches raw text when JSON parsing fails", () => {
    assert.throws(
      () => parseAiJsonResponse("not json"),
      (err) => err.rawAiText === "not json" && /not valid JSON/.test(err.message)
    );
  });
});
