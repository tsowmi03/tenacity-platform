"use strict";

const Anthropic = require("@anthropic-ai/sdk").default;
const {
  LATEX_COMMANDS,
  EMPTY_COMMANDS,
  repairJsonBackslashes,
} = require("./aiJsonRepair");

/**
 * Wrap the system prompt so it can be served from the prompt cache.
 *
 * This used to be gated on an exact `model === "claude-sonnet-4-6"` match, which
 * silently disabled caching the moment the model changed. Caching is supported
 * on every model we use, and a prompt below the cache minimum is simply not
 * cached rather than rejected, so applying it unconditionally is safe.
 */
function buildAnthropicSystemParam({ systemPrompt }) {
  return [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];
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

/**
 * Parse the model's JSON response, repairing single-backslash LaTeX first.
 *
 * `mathBearing` selects the backslash-repair vocabulary (see aiJsonRepair.js):
 * maths content (the default) preserves LaTeX commands as literal backslashes,
 * while prose content (English) treats \n/\t/etc. as the JSON escapes they are
 * so paragraph breaks survive. Defaulting to maths keeps every existing
 * maths/worksheet path unchanged; only English generation opts into prose mode.
 */
function parseAiJsonResponse(raw, { mathBearing = true } = {}) {
  const latexCommands = mathBearing ? LATEX_COMMANDS : EMPTY_COMMANDS;
  const repair = (text) => repairJsonBackslashes(text, { latexCommands });

  // Attempt 1: strip a simple surrounding code fence
  const cleaned = stripJsonCodeFence(raw);
  try {
    return JSON.parse(repair(cleaned));
  } catch (_) {
    // fall through to attempt 2
  }

  // Attempt 2: more aggressive extraction — handles trailing text after the
  // closing fence and other wrapping the AI sometimes adds
  const extracted = extractJsonBlock(raw);
  if (extracted !== cleaned) {
    try {
      return JSON.parse(repair(extracted));
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

/**
 * Opus 5 runs safety classifiers that can decline a request. That comes back as
 * a successful HTTP 200 with stop_reason "refusal" and a possibly-empty content
 * array — so without this check the next thing to fail would be responseText(),
 * reporting "AI response did not include a text content block", which tells a
 * tutor nothing useful. Teaching material should essentially never trip this;
 * the guard exists so that if it ever does, the message says so plainly.
 */
function assertNotRefused(response) {
  if (response?.stop_reason !== "refusal") return;
  const category = response?.stop_details?.category || null;
  const wrapped = new Error(
    `AI declined to generate this resource${category ? ` (${category})` : ""}.`
  );
  wrapped.refusal = true;
  wrapped.refusalCategory = category;
  wrapped.stopReason = "refusal";
  throw wrapped;
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

function shouldStreamResponse(maxTokens) {
  return maxTokens > 21000;
}

async function streamResponseText(stream) {
  let raw = "";
  let stopReason = null;

  for await (const event of stream) {
    if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
      raw += event.delta.text || "";
    }
    if (event?.type === "message_delta" && event.delta?.stop_reason) {
      stopReason = event.delta.stop_reason;
    }
  }

  return {
    content: [{ type: "text", text: raw }],
    stop_reason: stopReason,
  };
}

async function callAnthropicForResource({
  apiKey,
  model,
  systemPrompt,
  userMessage,
  maxTokens = 8000,
  signal,
  mathBearing = true,
  // Thinking is opt-in: pass an effort level to enable it. It stays off by
  // default because thinking tokens are drawn from max_tokens, so switching it
  // on globally would silently truncate the small-budget callers (the
  // public-domain text lookups run on a 1024-token ceiling).
  effort = null,
  createClient = (key) => new Anthropic({ apiKey: key }),
}) {
  if (!apiKey) throw new TypeError("callAnthropicForResource requires apiKey");
  if (!model) throw new TypeError("callAnthropicForResource requires model");
  if (!systemPrompt) throw new TypeError("callAnthropicForResource requires systemPrompt");
  if (!userMessage) throw new TypeError("callAnthropicForResource requires userMessage");

  const client = createClient(apiKey);
  const request = {
    model,
    max_tokens: maxTokens,
    system: buildAnthropicSystemParam({ systemPrompt }),
    messages: [{ role: "user", content: userMessage }],
  };
  if (effort) {
    // Adaptive thinking lets the model decide how much to reason per request,
    // which is what lifts arithmetic accuracy in worked solutions and JSON
    // validity on long documents. Thinking tokens are drawn from max_tokens,
    // which is why the ceilings in index.js sit well above the output size we
    // actually expect. `effort` trades depth against latency — see
    // RESOURCE_GENERATION_EFFORT for why generation sits at "high", not "xhigh".
    request.thinking = { type: "adaptive" };
    request.output_config = { effort };
  }
  // Passing `signal` lets the caller abort an in-flight generation (e.g. when a
  // tutor stops a job). When aborted the SDK rejects with APIUserAbortError.
  const options = signal ? { signal } : undefined;
  const response = shouldStreamResponse(maxTokens)
    ? await streamResponseText(await client.messages.create({ ...request, stream: true }, options))
    : await client.messages.create(request, options);

  // Check refusal before reading content: a refused response can carry no text
  // block at all, so responseText() would otherwise mask the real reason.
  assertNotRefused(response);
  const raw = responseText(response);
  assertCompleteResponse(response, raw, maxTokens);
  return { parsed: parseAiJsonResponse(raw, { mathBearing }), raw };
}

module.exports = {
  assertCompleteResponse,
  assertNotRefused,
  buildAnthropicSystemParam,
  callAnthropicForResource,
  extractJsonBlock,
  parseAiJsonResponse,
  repairJsonBackslashes,
  responseText,
  shouldStreamResponse,
  stripJsonCodeFence,
  streamResponseText,
};
