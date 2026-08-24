"use strict";

const DEFAULT_RESOURCE_MODEL = "claude-opus-5";
const OPENAI_RESOURCE_MODEL = "gpt-5.6-sol";
const SOURCE_PLANNER_MODEL = "claude-sonnet-5";
const SOURCE_PLANNER_FALLBACK_MODEL = "gpt-5.6-terra";

const MAIN_MODEL_OPTIONS = Object.freeze([
  DEFAULT_RESOURCE_MODEL,
  OPENAI_RESOURCE_MODEL,
]);

const MAIN_MODEL_SET = new Set(MAIN_MODEL_OPTIONS);

const MODEL_REGISTRY = Object.freeze({
  [DEFAULT_RESOURCE_MODEL]: Object.freeze({
    provider: "anthropic",
    purpose: "resource-generation",
    backupModel: OPENAI_RESOURCE_MODEL,
  }),
  [OPENAI_RESOURCE_MODEL]: Object.freeze({
    provider: "openai",
    purpose: "resource-generation",
    backupModel: DEFAULT_RESOURCE_MODEL,
  }),
  [SOURCE_PLANNER_MODEL]: Object.freeze({
    provider: "anthropic",
    purpose: "public-domain-curation",
    backupModel: SOURCE_PLANNER_FALLBACK_MODEL,
  }),
  [SOURCE_PLANNER_FALLBACK_MODEL]: Object.freeze({
    provider: "openai",
    purpose: "public-domain-curation",
    backupModel: null,
  }),
});

function modelConfig(model) {
  return MODEL_REGISTRY[String(model || "").trim()] || null;
}

function providerForModel(model) {
  return modelConfig(model)?.provider || null;
}

function isAllowedMainModel(model) {
  return MAIN_MODEL_SET.has(String(model || "").trim());
}

function assertAllowedMainModel(model, field = "modelChoice") {
  const value = String(model || "").trim();
  if (!isAllowedMainModel(value)) {
    throw new TypeError(
      `${field} must be one of: ${MAIN_MODEL_OPTIONS.join(", ")}`
    );
  }
  return value;
}

function backupModelFor(model) {
  return modelConfig(model)?.backupModel || null;
}

function inferModelChoice(job = {}) {
  for (const candidate of [job.modelChoice, job.requestedModel, job.model]) {
    if (isAllowedMainModel(candidate)) return candidate;
  }
  return DEFAULT_RESOURCE_MODEL;
}

function displayNameForModel(model) {
  return {
    [DEFAULT_RESOURCE_MODEL]: "Claude Opus 5",
    [OPENAI_RESOURCE_MODEL]: "GPT-5.6 Sol",
    [SOURCE_PLANNER_MODEL]: "Claude Sonnet 5",
    [SOURCE_PLANNER_FALLBACK_MODEL]: "GPT-5.6 Terra",
  }[model] || String(model || "Unknown model");
}

module.exports = {
  DEFAULT_RESOURCE_MODEL,
  MAIN_MODEL_OPTIONS,
  MODEL_REGISTRY,
  OPENAI_RESOURCE_MODEL,
  SOURCE_PLANNER_FALLBACK_MODEL,
  SOURCE_PLANNER_MODEL,
  assertAllowedMainModel,
  backupModelFor,
  displayNameForModel,
  inferModelChoice,
  isAllowedMainModel,
  modelConfig,
  providerForModel,
};
