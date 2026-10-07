"use strict";

const logger = require("firebase-functions/logger");

// RES-35 / RES-39. Jobs and the portal deal in model CHOICES - "the Anthropic
// model" or "the OpenAI model" - never in model IDs, and this module is the
// only place a choice (or an internal role such as the chat) is mapped to the
// concrete model it runs on.
//
// The mapping is live: DEFAULT_MODELS below is what runs out of the box, and
// the Firestore doc config/resourceModels can override any of its fields
// without a deploy. Each function instance re-reads that doc at most once a
// minute (refreshModelConfig), so an edit in the Firebase console takes
// effect within about a minute. A field that is missing keeps its default; a
// field that is malformed, or names a model from the wrong provider, is
// ignored with a warning, so a typo cannot take generation down.
//
// A model's provider is read from its ID prefix (claude- / gpt-), which is
// also how a job that recorded an older model ID is matched back to its
// choice. Retiring a model therefore needs no code change.
//
// The concrete ID each job actually ran on is still recorded on the job
// (requestedModel / effectiveModel / attemptedModels) as its audit trail.
const DEFAULT_MODELS = Object.freeze({
  // The two tutor-facing choices. Each must stay on its own provider: the
  // other choice is its backup, so they cannot share an outage.
  anthropic: "claude-opus-5-5",
  openai: "gpt-6.1-sol",
  // The choice a new submission gets when the caller omits modelChoice (RES-27).
  defaultChoice: "openai",
  // RES-24. The pre-generation chat runs on Sonnet, whatever generation model
  // the tutor picked: a tutor waits on every turn and the replies are short.
  // Measured live on 2026-10-07, Sonnet 5.5 replied in ~4.4s against Opus
  // 5.5's ~7.2s and Sol's ~5.6s, with briefs as good as either. GPT-6 Luna was
  // faster but wrote noticeably vaguer briefs, and Haiku 4.5 invented a mark
  // total when summarising files, so summaries use Sonnet too.
  chat: "claude-sonnet-5-5",
  // The public-domain source planner is a separate, internal lookup with its
  // own primary and fallback; it is never a tutor-facing choice.
  sourcePlanner: "claude-sonnet-5",
  sourcePlannerFallback: "gpt-5.6-terra",
});

const MODEL_CONFIG_COLLECTION = "config";
const MODEL_CONFIG_DOC = "resourceModels";
const MODEL_CONFIG_TTL_MS = 60 * 1000;

const PROVIDER_PREFIXES = Object.freeze({ anthropic: "claude-", openai: "gpt-" });
// A choice is named after its provider, and each backs up onto the other.
const MAIN_MODEL_CHOICES = Object.freeze(["anthropic", "openai"]);
const BACKUP_CHOICE = Object.freeze({ anthropic: "openai", openai: "anthropic" });
// The choice inferred for a job that predates modelChoice entirely. Every such
// job ran on Anthropic, so that is what it resolves to - not the current
// submission default, which would relabel history.
const LEGACY_CHOICE = "anthropic";

const MODEL_ID_PATTERN = /^(claude|gpt)-[a-z0-9][a-z0-9.-]*$/;

// Names for the smoke scripts' output. An ID missing here prints as itself.
const DISPLAY_NAMES = Object.freeze({
  "claude-opus-5": "Claude Opus 5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-6.1-sol": "GPT-6.1 Sol",
});

let liveModels = DEFAULT_MODELS;
let lastFetchedAt = null;

function clean(value) {
  return String(value || "").trim();
}

function providerForModel(model) {
  const key = clean(model);
  return Object.keys(PROVIDER_PREFIXES).find((provider) =>
    key.startsWith(PROVIDER_PREFIXES[provider])
  ) || null;
}

function isModelChoice(value) {
  return MAIN_MODEL_CHOICES.includes(clean(value));
}

function validField(field, value) {
  if (typeof value !== "string") return false;
  if (field === "defaultChoice") return isModelChoice(value);
  if (!MODEL_ID_PATTERN.test(value)) return false;
  return !isModelChoice(field) || providerForModel(value) === field;
}

/**
 * Merges a config/resourceModels document over DEFAULT_MODELS. Returns the
 * resulting models and the fields that were present but unusable.
 */
function resolveModelConfig(data) {
  const models = { ...DEFAULT_MODELS };
  const ignored = [];
  for (const field of Object.keys(DEFAULT_MODELS)) {
    const raw = data?.[field];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (validField(field, value)) {
      models[field] = value;
    } else {
      ignored.push(field);
    }
  }
  return { models: Object.freeze(models), ignored };
}

function applyModelConfig(data) {
  const { models, ignored } = resolveModelConfig(data);
  liveModels = models;
  return ignored;
}

/**
 * Re-reads config/resourceModels when the cached copy is over a minute old.
 * Never throws: if the read fails, the models already in use stay in use.
 */
async function refreshModelConfig(db, { now = Date.now } = {}) {
  const at = now();
  if (lastFetchedAt !== null && at - lastFetchedAt < MODEL_CONFIG_TTL_MS) {
    return liveModels;
  }
  lastFetchedAt = at;
  try {
    const snap = await db.collection(MODEL_CONFIG_COLLECTION).doc(MODEL_CONFIG_DOC).get();
    const ignored = applyModelConfig(snap.exists ? snap.data() : {});
    if (ignored.length) {
      logger.warn("[modelRegistry] ignored unusable model config fields", { ignored });
    }
  } catch (err) {
    logger.warn("[modelRegistry] model config could not be loaded; keeping current models", {
      errorMessage: err?.message,
    });
  }
  return liveModels;
}

// Back to the code defaults, as if no config had ever been read (tests only).
function resetModelConfig() {
  liveModels = DEFAULT_MODELS;
  lastFetchedAt = null;
}

function currentModels() {
  return liveModels;
}

function chatModel() {
  return liveModels.chat;
}

function sourcePlannerModel() {
  return liveModels.sourcePlanner;
}

function sourcePlannerFallbackModel() {
  return liveModels.sourcePlannerFallback;
}

function defaultSubmissionChoice() {
  return liveModels.defaultChoice;
}

function modelForChoice(choice) {
  const key = clean(choice);
  if (!isModelChoice(key)) throw new TypeError(`Unknown model choice: ${choice}`);
  return liveModels[key];
}

// The model a job with no recorded choice runs on.
function defaultResourceModel() {
  return modelForChoice(LEGACY_CHOICE);
}

function mainModelOptions() {
  return MAIN_MODEL_CHOICES.map(modelForChoice);
}

function isAllowedMainModel(model) {
  return mainModelOptions().includes(clean(model));
}

function assertAllowedMainModel(model, field = "model") {
  const value = clean(model);
  if (!isAllowedMainModel(value)) {
    throw new TypeError(`${field} must be one of: ${mainModelOptions().join(", ")}`);
  }
  return value;
}

/**
 * The choice a stored value belongs to: a choice name, or any model ID from
 * that choice's provider (current or retired). Null for anything else.
 */
function choiceForValue(value) {
  const key = clean(value);
  if (isModelChoice(key)) return key;
  const provider = providerForModel(key);
  return isModelChoice(provider) ? provider : null;
}

/**
 * Validates a submitted modelChoice. Pre-RES-35 portal builds send a model ID
 * rather than a choice name; those are accepted and normalised to their
 * choice so a cached portal keeps working.
 */
function assertModelChoice(value, field = "modelChoice") {
  const choice = choiceForValue(value);
  if (!choice) {
    throw new TypeError(`${field} must be one of: ${MAIN_MODEL_CHOICES.join(", ")}`);
  }
  return choice;
}

/**
 * The current model for a stored generation model ID: its choice's model
 * today, so a job that recorded a since-replaced model carries on with its
 * replacement. Null when the ID belongs to no choice.
 */
function currentModelFor(model) {
  if (!clean(model)) return null;
  const choice = choiceForValue(model);
  return choice ? modelForChoice(choice) : null;
}

function backupModelFor(model) {
  const choice = choiceForValue(model);
  return choice ? modelForChoice(BACKUP_CHOICE[choice]) : null;
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
  return DISPLAY_NAMES[clean(model)] || String(model || "Unknown model");
}

module.exports = {
  DEFAULT_MODELS,
  LEGACY_CHOICE,
  MAIN_MODEL_CHOICES,
  MODEL_CONFIG_COLLECTION,
  MODEL_CONFIG_DOC,
  MODEL_CONFIG_TTL_MS,
  applyModelConfig,
  assertAllowedMainModel,
  assertModelChoice,
  backupModelFor,
  chatModel,
  choiceForValue,
  currentModelFor,
  currentModels,
  defaultResourceModel,
  defaultSubmissionChoice,
  displayNameForModel,
  inferModelChoice,
  isAllowedMainModel,
  isModelChoice,
  modelForChoice,
  providerForModel,
  refreshModelConfig,
  resetModelConfig,
  resolveModelConfig,
  sourcePlannerFallbackModel,
  sourcePlannerModel,
};
