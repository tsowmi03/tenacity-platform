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

describe("resource prompt builder", () => {
  it("builds the worksheet system prompt from the spec schema", () => {
    const prompt = buildSystemPrompt("worksheet", { year: 8, subject: "maths" });
    assert.match(prompt, /Tenacity Tutoring/);
    assert.match(prompt, /Year 8 maths student/);
    assert.match(prompt, /Return ONLY valid JSON/);
    assert.match(prompt, /"questions"/);
    assert.match(prompt, /"answers"/);
    assert.ok(prompt.startsWith(GLOBAL_RULES));
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

  it("rejects prompts that have no implemented schema yet", () => {
    assert.throws(
      () => buildSystemPrompt("practice-paper", { year: 8, subject: "maths" }),
      /Unsupported system prompt resource type/
    );
  });
});

describe("resource Anthropic client", () => {
  it("adds prompt caching for Sonnet system prompts", () => {
    assert.deepEqual(
      buildAnthropicSystemParam({
        model: "claude-sonnet-4-20250514",
        systemPrompt: "SYSTEM",
      }),
      [{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }]
    );
  });

  it("passes Haiku system prompts as plain text", () => {
    assert.equal(
      buildAnthropicSystemParam({
        model: "claude-3-5-haiku-20241022",
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
      model: "claude-3-5-haiku-20241022",
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
      model: "claude-3-5-haiku-20241022",
      max_tokens: 8000,
      system: "SYSTEM",
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
