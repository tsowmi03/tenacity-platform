// The portal deliberately keeps the generation model out of sight: tutors pick
// a resource, not a provider. The selector still exists behind the collapsed
// "Generation settings" disclosure for the rare manual override.
//
// RES-35: the portal deals in model CHOICES, never model IDs. The backend
// registry (functions/src/resources/modelRegistry.js) maps each choice to the
// model it currently runs on, so a model upgrade needs no portal change - which
// is also why the labels name the provider, not a model version.
export const DEFAULT_GENERATION_MODEL = "openai";

// Jobs queued before the portal recorded a model choice were all generated on
// Anthropic, so that is what an unrecorded job is inferred as - not the current
// default, which would relabel history.
export const LEGACY_MODEL_FALLBACK = "anthropic";

export const GENERATION_MODELS = [
  { value: DEFAULT_GENERATION_MODEL, label: "GPT" },
  { value: LEGACY_MODEL_FALLBACK, label: "Claude" },
];

const CHOICES = new Set(GENERATION_MODELS.map((model) => model.value));

// Jobs written before RES-35 store a model ID where the choice now goes, and
// every job still records the concrete model it ran on. Recognise both by
// provider prefix, so a future model ID resolves without a portal change.
function choiceForValue(value) {
  const key = String(value || "").trim();
  if (CHOICES.has(key)) return key;
  if (key.startsWith("claude-")) return "anthropic";
  if (key.startsWith("gpt-")) return "openai";
  return null;
}

export function requestedModelForJob(job = {}) {
  for (const candidate of [job.modelChoice, job.requestedModel, job.model]) {
    const choice = choiceForValue(candidate);
    if (choice) return choice;
  }
  return LEGACY_MODEL_FALLBACK;
}
