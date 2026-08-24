export const DEFAULT_GENERATION_MODEL = "claude-opus-5";

export const GENERATION_MODELS = [
  {
    value: DEFAULT_GENERATION_MODEL,
    label: "Claude Opus 5",
    shortLabel: "Opus 5",
    description: "Default",
  },
  {
    value: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    shortLabel: "GPT-5.6 Sol",
    description: "OpenAI alternative",
  },
];

const MODEL_LABELS = {
  "claude-opus-5": "Claude Opus 5",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "claude-sonnet-5": "Claude Sonnet 5",
  "gpt-5.6-terra": "GPT-5.6 Terra",
};

export function modelLabel(model) {
  return MODEL_LABELS[model] || model || "Not recorded";
}

export function requestedModelForJob(job = {}) {
  const allowed = new Set(GENERATION_MODELS.map((model) => model.value));
  for (const candidate of [job.modelChoice, job.requestedModel, job.model]) {
    if (allowed.has(candidate)) return candidate;
  }
  return DEFAULT_GENERATION_MODEL;
}
