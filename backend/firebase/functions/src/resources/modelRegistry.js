"use strict";

// RES-35. Jobs and the portal deal in model CHOICES - a stable name for "the
// Anthropic model" or "the OpenAI model" - never in model IDs. This table is
// the only place a choice is mapped to the concrete model it runs on, so
// moving to a newer model is one edit here:
//
//   1. change the choice's `model` (and `displayName`);
//   2. add the outgoing ID to RETIRED_MODELS so jobs that recorded it still
//      resolve to the right choice.
//
// The concrete ID each job actually ran on is still recorded on the job
// (requestedModel / effectiveModel / attemptedModels) as its audit trail.
const MODEL_CHOICES = Object.freeze({
  anthropic: Object.freeze({
    model: "claude-opus-5-5",
    provider: "anthropic",
    displayName: "Claude Opus 5.5",
    backupChoice: "openai",
  }),
  openai: Object.freeze({
    model: "gpt-5.6-sol",
    provider: "openai",
    displayName: "GPT-5.6 Sol",
    backupChoice: "anthropic",
  }),
});

// Model IDs a choice used to run on. A job that stored one of these (as its
// choice on pre-RES-35 jobs, or as its active model mid-flight across a
// deploy) keeps its choice and carries on with that choice's current model.
const RETIRED_MODELS = Object.freeze({
  "claude-opus-5": Object.freeze({ choice: "anthropic", displayName: "Claude Opus 5" }),
});

const MAIN_MODEL_CHOICES = Object.freeze(Object.keys(MODEL_CHOICES));

// The choice a new submission gets when the caller omits modelChoice (RES-27).
const DEFAULT_SUBMISSION_CHOICE = "openai";
// The choice inferred for a job that predates modelChoice entirely. Every such
// job ran on Anthropic, so that is what it resolves to - not the current
// submission default, which would relabel history.
const LEGACY_CHOICE = "anthropic";

const DEFAULT_RESOURCE_MODEL = MODEL_CHOICES.anthropic.model;
const OPENAI_RESOURCE_MODEL = MODEL_CHOICES.openai.model;
const MAIN_MODEL_OPTIONS = Object.freeze(
  MAIN_MODEL_CHOICES.map((choice) => MODEL_CHOICES[choice].model)
);
const MAIN_MODEL_SET = new Set(MAIN_MODEL_OPTIONS);

// The public-domain source planner is a separate, internal lookup with its own
// primary and fallback; it is never a tutor-facing choice.
const SOURCE_PLANNER_MODEL = "claude-sonnet-5";
const SOURCE_PLANNER_FALLBACK_MODEL = "gpt-5.6-terra";

const MODEL_REGISTRY = Object.freeze({
  ...Object.fromEntries(
    Object.values(MODEL_CHOICES).map((entry) => [
      entry.model,
      Object.freeze({
        provider: entry.provider,
        purpose: "resource-generation",
        backupModel: MODEL_CHOICES[entry.backupChoice].model,
      }),
    ])
  ),
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

function clean(value) {
  return String(value || "").trim();
}

function modelConfig(model) {
  return MODEL_REGISTRY[clean(model)] || null;
}

function providerForModel(model) {
  return modelConfig(model)?.provider || null;
}

function isModelChoice(value) {
  return Object.prototype.hasOwnProperty.call(MODEL_CHOICES, clean(value));
}

function isAllowedMainModel(model) {
  return MAIN_MODEL_SET.has(clean(model));
}

function assertAllowedMainModel(model, field = "model") {
  const value = clean(model);
  if (!isAllowedMainModel(value)) {
    throw new TypeError(`${field} must be one of: ${MAIN_MODEL_OPTIONS.join(", ")}`);
  }
  return value;
}

/**
 * The choice a stored value belongs to: a choice name, a current model ID, or
 * a retired model ID. Null for anything unrecognised.
 */
function choiceForValue(value) {
  const key = clean(value);
  if (isModelChoice(key)) return key;
  const current = MAIN_MODEL_CHOICES.find((choice) => MODEL_CHOICES[choice].model === key);
  if (current) return current;
  return RETIRED_MODELS[key]?.choice || null;
}

/**
 * Validates a submitted modelChoice. Pre-RES-35 portal builds send a model ID
 * rather than a choice name; those are accepted and normalised so a cached
 * portal keeps working across the deploy.
 */
function assertModelChoice(value, field = "modelChoice") {
  const choice = choiceForValue(value);
  if (!choice) {
    throw new TypeError(`${field} must be one of: ${MAIN_MODEL_CHOICES.join(", ")}`);
  }
  return choice;
}

function modelForChoice(choice) {
  const entry = MODEL_CHOICES[clean(choice)];
  if (!entry) throw new TypeError(`Unknown model choice: ${choice}`);
  return entry.model;
}

/**
 * The current model for a stored model ID: itself when current, its choice's
 * current model when retired, null when unrecognised.
 */
function currentModelFor(model) {
  if (isAllowedMainModel(model)) return clean(model);
  const choice = RETIRED_MODELS[clean(model)]?.choice;
  return choice ? MODEL_CHOICES[choice].model : null;
}

function backupModelFor(model) {
  return modelConfig(model)?.backupModel || null;
}

// The choice an EXISTING job was made with. Reads the recorded choice first,
// then the model fields older jobs carry; a job with none of them ran on
// Anthropic (see LEGACY_CHOICE).
function inferModelChoice(job = {}) {
  for (const candidate of [job.modelChoice, job.requestedModel, job.model]) {
    const choice = choiceForValue(candidate);
    if (choice) return choice;
  }
  return LEGACY_CHOICE;
}

function displayNameForModel(model) {
  const key = clean(model);
  const choice = MAIN_MODEL_CHOICES.find((name) => MODEL_CHOICES[name].model === key);
  if (choice) return MODEL_CHOICES[choice].displayName;
  if (RETIRED_MODELS[key]) return RETIRED_MODELS[key].displayName;
  return {
    [SOURCE_PLANNER_MODEL]: "Claude Sonnet 5",
    [SOURCE_PLANNER_FALLBACK_MODEL]: "GPT-5.6 Terra",
  }[key] || String(model || "Unknown model");
}

module.exports = {
  DEFAULT_RESOURCE_MODEL,
  DEFAULT_SUBMISSION_CHOICE,
  LEGACY_CHOICE,
  MAIN_MODEL_CHOICES,
  MAIN_MODEL_OPTIONS,
  MODEL_CHOICES,
  MODEL_REGISTRY,
  OPENAI_RESOURCE_MODEL,
  RETIRED_MODELS,
  SOURCE_PLANNER_FALLBACK_MODEL,
  SOURCE_PLANNER_MODEL,
  assertAllowedMainModel,
  assertModelChoice,
  backupModelFor,
  choiceForValue,
  currentModelFor,
  displayNameForModel,
  inferModelChoice,
  isAllowedMainModel,
  isModelChoice,
  modelConfig,
  modelForChoice,
  providerForModel,
};
