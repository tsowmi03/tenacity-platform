"use strict";

const OpenAI = require("openai").default;
const { parseAiJsonResponse } = require("./apiClient");

function normaliseOpenAiUsage(usage = {}) {
  usage = usage || {};
  return {
    inputTokens: Number(usage.input_tokens) || 0,
    cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens) || 0,
    cacheWriteTokens: Number(usage.input_tokens_details?.cache_write_tokens) || 0,
    outputTokens: Number(usage.output_tokens) || 0,
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens) || 0,
  };
}

function responseText(response) {
  const raw = responseTextOrEmpty(response);
  if (raw) return raw;
  const wrapped = new Error("AI response did not include an output text block");
  wrapped.modelFailure = true;
  throw wrapped;
}

function responseTextOrEmpty(response) {
  if (typeof response?.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("");
}

function refusalText(response) {
  const refusals = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "refusal" && content.refusal) refusals.push(content.refusal);
    }
  }
  return refusals.join("\n");
}

function assertOpenAiResponseComplete(response, raw, maxTokens) {
  const refusal = refusalText(response);
  if (refusal || response?.incomplete_details?.reason === "content_filter") {
    const wrapped = new Error("AI declined to generate this resource.");
    wrapped.refusal = true;
    wrapped.stopReason = "refusal";
    wrapped.modelFailure = true;
    wrapped.rawAiText = raw || null;
    throw wrapped;
  }
  if (response?.status === "incomplete") {
    const reason = response?.incomplete_details?.reason || "incomplete";
    const wrapped = new Error(
      reason === "max_output_tokens"
        ? `AI response was truncated at the ${maxTokens} token output limit.`
        : `AI response was incomplete (${reason}).`
    );
    wrapped.stopReason = reason === "max_output_tokens" ? "max_tokens" : reason;
    wrapped.modelFailure = true;
    wrapped.rawAiText = raw || null;
    wrapped.maxTokens = maxTokens;
    throw wrapped;
  }
  if (response?.status === "failed" || response?.error) {
    const wrapped = new Error(response?.error?.message || "OpenAI response failed");
    wrapped.code = response?.error?.code || null;
    wrapped.modelFailure = true;
    wrapped.rawAiText = raw || null;
    throw wrapped;
  }
}

async function aggregateOpenAiStream(stream) {
  let raw = "";
  let refusal = "";
  let finalResponse = null;
  for await (const event of stream) {
    if (event?.type === "response.output_text.delta") raw += event.delta || "";
    if (event?.type === "response.refusal.delta") refusal += event.delta || "";
    if (
      event?.type === "response.completed" ||
      event?.type === "response.incomplete" ||
      event?.type === "response.failed"
    ) {
      finalResponse = event.response || finalResponse;
    }
    if (event?.type === "error") {
      const wrapped = new Error(event.message || "OpenAI response stream failed");
      wrapped.code = event.code || null;
      wrapped.modelFailure = true;
      throw wrapped;
    }
  }
  const response = finalResponse || { status: "completed", output: [], output_text: raw };
  if (raw && !response.output_text) response.output_text = raw;
  if (refusal) {
    response.output = [
      ...(response.output || []),
      { type: "message", content: [{ type: "refusal", refusal }] },
    ];
  }
  return response;
}

function responseFormat(responseSchema) {
  if (!responseSchema) return undefined;
  return {
    type: "json_schema",
    name: "resource_response",
    strict: true,
    schema: responseSchema,
  };
}

async function callOpenAiForResource({
  apiKey,
  model,
  systemPrompt,
  userMessage,
  maxTokens = 8000,
  signal,
  mathBearing = true,
  effort = null,
  responseSchema = null,
  safetyIdentifier = null,
  createClient = (key) => new OpenAI({ apiKey: key, maxRetries: 1 }),
}) {
  if (!apiKey) throw new TypeError("callOpenAiForResource requires apiKey");
  if (!model) throw new TypeError("callOpenAiForResource requires model");
  if (!systemPrompt) throw new TypeError("callOpenAiForResource requires systemPrompt");
  if (!userMessage) throw new TypeError("callOpenAiForResource requires userMessage");

  const client = createClient(apiKey);
  const request = {
    model,
    instructions: systemPrompt,
    input: userMessage,
    max_output_tokens: maxTokens,
    store: false,
    stream: maxTokens > 21000,
  };
  if (effort) request.reasoning = { effort };
  if (responseSchema) request.text = { format: responseFormat(responseSchema) };
  if (safetyIdentifier) request.safety_identifier = safetyIdentifier;

  const options = signal ? { signal } : undefined;
  let response;
  try {
    const result = await client.responses.create(request, options);
    response = request.stream ? await aggregateOpenAiStream(result) : result;
  } catch (err) {
    err.modelFailure = true;
    throw err;
  }

  const usage = normaliseOpenAiUsage(response.usage);
  let raw = "";
  let parsed;
  try {
    const refusal = refusalText(response);
    raw = refusal ? "" : responseTextOrEmpty(response);
    assertOpenAiResponseComplete(response, raw, maxTokens);
    if (!raw) responseText(response);
    parsed = parseAiJsonResponse(raw, { mathBearing });
  } catch (err) {
    err.modelFailure = true;
    err.usage = usage;
    err.responseId = response.id || null;
    throw err;
  }
  return {
    parsed,
    raw,
    provider: "openai",
    model: response.model || model,
    responseId: response.id || null,
    usage,
  };
}

module.exports = {
  aggregateOpenAiStream,
  assertOpenAiResponseComplete,
  callOpenAiForResource,
  normaliseOpenAiUsage,
  refusalText,
  responseFormat,
  responseText,
  responseTextOrEmpty,
};
