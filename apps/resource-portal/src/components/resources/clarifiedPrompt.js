// The server rejects a customPrompt longer than this.
export const MAX_CUSTOM_PROMPT = 5000;

// The original request plus the tutor's answer to the planner's question.
export function clarifiedResourcePrompt(prompt, { topics = [], note = "" } = {}) {
  const parts = [String(prompt || "").trim()];
  if (topics.length) parts.push(`Topics to cover: ${topics.join("; ")}.`);
  if (note.trim()) parts.push(`Tutor's answer: ${note.trim()}`);
  return parts.filter(Boolean).join("\n\n");
}
