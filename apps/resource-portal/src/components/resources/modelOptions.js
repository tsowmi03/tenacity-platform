// The portal deliberately keeps the generation model out of sight: tutors pick
// a resource, not a provider. The selector still exists behind the collapsed
// "Generation settings" disclosure for the rare manual override, and these
// labels are the only place in the UI a model is named.
export const DEFAULT_GENERATION_MODEL = "gpt-5.6-sol";

// Jobs queued before the portal recorded a model choice were all generated on
// Opus, so that is what an unrecorded job is inferred as - not the current
// default, which would relabel history.
export const LEGACY_MODEL_FALLBACK = "claude-opus-5";

export const GENERATION_MODELS = [
  { value: DEFAULT_GENERATION_MODEL, label: "Sol" },
  { value: LEGACY_MODEL_FALLBACK, label: "Opus 5" },
];

export function requestedModelForJob(job = {}) {
  const allowed = new Set(GENERATION_MODELS.map((model) => model.value));
  for (const candidate of [job.modelChoice, job.requestedModel, job.model]) {
    if (allowed.has(candidate)) return candidate;
  }
  return LEGACY_MODEL_FALLBACK;
}
