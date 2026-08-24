"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { callAiForResource } = require("../../src/resources/aiClient");
const {
  callOpenAiForResource,
  normaliseOpenAiUsage,
  responseFormat,
} = require("../../src/resources/openaiClient");

function clientReturning(response, calls = []) {
  return () => ({
    responses: {
      async create(payload, options) {
        calls.push({ payload, options });
        return response;
      },
    },
  });
}

describe("resource OpenAI Responses adapter", () => {
  it("translates the shared request into strict Responses API fields", async () => {
    const calls = [];
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: { title: { type: "string" } },
    };
    const result = await callOpenAiForResource({
      apiKey: "openai-key",
      model: "gpt-5.6-sol",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      maxTokens: 12000,
      effort: "high",
      responseSchema: schema,
      safetyIdentifier: "hashed-user",
      createClient: clientReturning({
        id: "resp_1",
        model: "gpt-5.6-sol",
        status: "completed",
        output_text: "{\"title\":\"Worksheet\"}",
        output: [],
        usage: {
          input_tokens: 50,
          input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 },
          output_tokens: 30,
          output_tokens_details: { reasoning_tokens: 8 },
        },
      }, calls),
    });

    assert.deepEqual(calls[0].payload, {
      model: "gpt-5.6-sol",
      instructions: "SYSTEM",
      input: "USER",
      max_output_tokens: 12000,
      store: false,
      stream: false,
      reasoning: { effort: "high" },
      text: { format: responseFormat(schema) },
      safety_identifier: "hashed-user",
    });
    assert.deepEqual(result, {
      parsed: { title: "Worksheet" },
      raw: "{\"title\":\"Worksheet\"}",
      provider: "openai",
      model: "gpt-5.6-sol",
      responseId: "resp_1",
      usage: {
        inputTokens: 50,
        cachedInputTokens: 20,
        cacheWriteTokens: 10,
        outputTokens: 30,
        reasoningTokens: 8,
      },
    });
  });

  it("aggregates streaming text and final usage", async () => {
    const stream = [
      { type: "response.output_text.delta", delta: "{\"ok\":" },
      { type: "response.output_text.delta", delta: "true}" },
      {
        type: "response.completed",
        response: {
          id: "resp_stream",
          model: "gpt-5.6-sol",
          status: "completed",
          output: [],
          usage: {
            input_tokens: 4,
            input_tokens_details: { cached_tokens: 1, cache_write_tokens: 0 },
            output_tokens: 5,
            output_tokens_details: { reasoning_tokens: 2 },
          },
        },
      },
    ];
    const result = await callOpenAiForResource({
      apiKey: "openai-key",
      model: "gpt-5.6-sol",
      systemPrompt: "SYSTEM",
      userMessage: "USER",
      maxTokens: 96000,
      createClient: clientReturning(stream),
    });
    assert.equal(result.raw, "{\"ok\":true}");
    assert.deepEqual(result.parsed, { ok: true });
    assert.equal(result.usage.reasoningTokens, 2);
  });

  it("classifies streaming and non-streaming refusals", async () => {
    const refusalResponse = {
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }],
    };
    await assert.rejects(
      () => callOpenAiForResource({
        apiKey: "k",
        model: "gpt-5.6-sol",
        systemPrompt: "S",
        userMessage: "U",
        createClient: clientReturning(refusalResponse),
      }),
      (err) => err.refusal === true && err.modelFailure === true
    );

    const refusalStream = [
      { type: "response.refusal.delta", delta: "No" },
      { type: "response.completed", response: { status: "completed", output: [] } },
    ];
    await assert.rejects(
      () => callOpenAiForResource({
        apiKey: "k",
        model: "gpt-5.6-sol",
        systemPrompt: "S",
        userMessage: "U",
        maxTokens: 96000,
        createClient: clientReturning(refusalStream),
      }),
      (err) => err.stopReason === "refusal"
    );
  });

  it("reports incomplete max-output responses as truncation", async () => {
    await assert.rejects(
      () => callOpenAiForResource({
        apiKey: "k",
        model: "gpt-5.6-sol",
        systemPrompt: "S",
        userMessage: "U",
        createClient: clientReturning({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [],
          usage: { output_tokens: 12 },
        }),
      }),
      (err) =>
        err.stopReason === "max_tokens" &&
        err.modelFailure === true &&
        err.usage.outputTokens === 12
    );
  });

  it("normalizes absent usage and propagates abort options", async () => {
    assert.deepEqual(normaliseOpenAiUsage(), {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    });
    const calls = [];
    const signal = new AbortController().signal;
    await callOpenAiForResource({
      apiKey: "k",
      model: "gpt-5.6-terra",
      systemPrompt: "S",
      userMessage: "U",
      signal,
      createClient: clientReturning({
        status: "completed",
        model: "gpt-5.6-terra",
        output_text: "{\"ok\":true}",
        output: [],
      }, calls),
    });
    assert.equal(calls[0].options.signal, signal);
  });

  it("routes only registered models to the corresponding provider", async () => {
    const openAiCalls = [];
    const result = await callAiForResource({
      openaiApiKey: "openai-key",
      model: "gpt-5.6-sol",
      systemPrompt: "S",
      userMessage: "U",
      createOpenAiClient: clientReturning({
        status: "completed",
        model: "gpt-5.6-sol",
        output_text: "{\"ok\":true}",
        output: [],
      }, openAiCalls),
    });
    assert.equal(result.provider, "openai");
    assert.equal(openAiCalls.length, 1);
    await assert.rejects(
      () => callAiForResource({ model: "arbitrary-model", systemPrompt: "S", userMessage: "U" }),
      /Unsupported resource model/
    );
  });
});
