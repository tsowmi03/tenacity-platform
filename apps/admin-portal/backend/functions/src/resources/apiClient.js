"use strict";

const Anthropic = require("@anthropic-ai/sdk").default;

function buildAnthropicSystemParam({ model, systemPrompt }) {
  if (model === "claude-sonnet-4-6") {
    return [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];
  }
  return systemPrompt;
}

function stripJsonCodeFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseAiJsonResponse(raw) {
  const cleaned = stripJsonCodeFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const wrapped = new Error(
      `AI response was not valid JSON. Raw response: ${String(raw || "").slice(0, 500)}`
    );
    wrapped.cause = err;
    wrapped.rawAiText = raw;
    throw wrapped;
  }
}

function responseText(response) {
  const textBlocks = Array.isArray(response?.content)
    ? response.content.filter((block) => block?.type === "text" && block.text)
    : [];
  if (!textBlocks.length) {
    throw new Error("AI response did not include a text content block");
  }
  return textBlocks.map((block) => block.text).join("");
}

async function callAnthropicForResource({
  apiKey,
  model,
  systemPrompt,
  userMessage,
  maxTokens = 8000,
  createClient = (key) => new Anthropic({ apiKey: key }),
}) {
  if (!apiKey) throw new TypeError("callAnthropicForResource requires apiKey");
  if (!model) throw new TypeError("callAnthropicForResource requires model");
  if (!systemPrompt) throw new TypeError("callAnthropicForResource requires systemPrompt");
  if (!userMessage) throw new TypeError("callAnthropicForResource requires userMessage");

  const client = createClient(apiKey);
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: buildAnthropicSystemParam({ model, systemPrompt }),
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = responseText(response);
  return { parsed: parseAiJsonResponse(raw), raw };
}

module.exports = {
  buildAnthropicSystemParam,
  callAnthropicForResource,
  parseAiJsonResponse,
  responseText,
  stripJsonCodeFence,
};
