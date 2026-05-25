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

/**
 * More aggressive extraction for cases where the AI adds trailing text after
 * the closing code fence (e.g. "```\n\nHere's what I generated…").
 * First tries a non-greedy regex to pull the content from inside the fence
 * block; falls back to slicing between the outermost { … }.
 */
function extractJsonBlock(text) {
  const s = String(text || "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

function parseAiJsonResponse(raw) {
  // Attempt 1: strip a simple surrounding code fence
  const cleaned = stripJsonCodeFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // fall through to attempt 2
  }

  // Attempt 2: more aggressive extraction — handles trailing text after the
  // closing fence and other wrapping the AI sometimes adds
  const extracted = extractJsonBlock(raw);
  if (extracted !== cleaned) {
    try {
      return JSON.parse(extracted);
    } catch (_) {
      // fall through to throw
    }
  }

  // Both local attempts failed — throw with rawAiText set so the auto-repair
  // pipeline in runQueueForTutor can attempt an AI-assisted fix
  const wrapped = new Error(
    `AI response was not valid JSON. Raw response: ${String(raw || "").slice(0, 500)}`
  );
  wrapped.rawAiText = raw;
  throw wrapped;
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

function assertCompleteResponse(response, raw, maxTokens) {
  if (response?.stop_reason !== "max_tokens") return;
  const wrapped = new Error(
    `AI response was truncated at the ${maxTokens} token output limit. Retry with fewer questions or a higher output token limit.`
  );
  wrapped.rawAiText = raw;
  wrapped.stopReason = response.stop_reason;
  wrapped.maxTokens = maxTokens;
  throw wrapped;
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
  assertCompleteResponse(response, raw, maxTokens);
  return { parsed: parseAiJsonResponse(raw), raw };
}

module.exports = {
  assertCompleteResponse,
  buildAnthropicSystemParam,
  callAnthropicForResource,
  extractJsonBlock,
  parseAiJsonResponse,
  responseText,
  stripJsonCodeFence,
};
