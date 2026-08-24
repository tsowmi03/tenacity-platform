"use strict";

const { callAnthropicForResource } = require("./apiClient");
const { callOpenAiForResource } = require("./openaiClient");
const { providerForModel } = require("./modelRegistry");

function isAbortError(err) {
  return ["APIUserAbortError", "AbortError"].includes(err?.name);
}

async function callAiForResource({
  anthropicApiKey,
  openaiApiKey,
  apiKey,
  model,
  createAnthropicClient,
  createOpenAiClient,
  ...request
}) {
  const provider = providerForModel(model);
  if (!provider) throw new TypeError(`Unsupported resource model: ${model}`);
  try {
    if (provider === "anthropic") {
      return await callAnthropicForResource({
        ...request,
        model,
        apiKey: anthropicApiKey || apiKey,
        ...(createAnthropicClient ? { createClient: createAnthropicClient } : {}),
      });
    }
    return await callOpenAiForResource({
      ...request,
      model,
      apiKey: openaiApiKey || apiKey,
      ...(createOpenAiClient ? { createClient: createOpenAiClient } : {}),
    });
  } catch (err) {
    if (!isAbortError(err)) err.modelFailure = true;
    err.provider = err.provider || provider;
    err.model = err.model || model;
    throw err;
  }
}

module.exports = { callAiForResource };
