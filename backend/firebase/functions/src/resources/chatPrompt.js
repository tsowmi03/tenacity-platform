"use strict";

// RES-24: the pre-generation chat. A tutor talks a resource through with the
// model, which drafts the job's custom prompt. The chat never generates the
// resource itself and nothing here is stored: the portal holds the transcript
// and sends it back each turn. This module is pure; index.js does the I/O.

const CHAT_LIMITS = Object.freeze({
  maxMessages: 40,
  maxMessageChars: 4000,
  // Matches the customPrompt limit on submit, so a draft always fits.
  maxPromptChars: 5000,
  maxSummaryChars: 1500,
  // Extracted text sent per file when summarising. Enough for a long past
  // paper; the summary only needs the gist.
  maxFileChars: 40000,
  maxHistoryJobs: 10,
  maxSuggestions: 3,
  maxSuggestionChars: 80,
});

// Every property is required and none are nullable so the same schema works
// under OpenAI strict mode and Anthropic structured outputs. An empty
// proposedPrompt means "no new draft this turn".
const CHAT_RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["reply", "proposedPrompt", "suggestions"],
  properties: {
    reply: { type: "string" },
    proposedPrompt: { type: "string" },
    suggestions: { type: "array", items: { type: "string" } },
  },
});

const FILE_SUMMARY_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["summaries"],
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "summary"],
        properties: {
          index: { type: "integer" },
          summary: { type: "string" },
        },
      },
    },
  },
});

const UNSUMMARISED_FILE = "This document could not be summarised.";

const ANSWER_MODE_TEXT = {
  none: "questions only, no answer section",
  answers: "final answers only",
  worked: "fully worked solutions",
};

function typeLabel(resourceType) {
  return String(resourceType || "resource").replace(/-/g, " ");
}

function subjectLabel(subject) {
  return subject === "english" ? "English" : "Maths";
}

function clip(text, max) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function isoDate(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : value;
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : "unknown date";
}

function historyLine(job) {
  const topics = Array.isArray(job.extractedTopics) && job.extractedTopics.length
    ? ` · topics: ${job.extractedTopics.slice(0, 6).join(", ")}`
    : "";
  const prompt = job.customPrompt ? ` · tutor asked for: "${clip(job.customPrompt, 160)}"` : "";
  return `- ${isoDate(job.createdAt)} · ${typeLabel(job.resourceType)} (Year ${job.year} ${subjectLabel(job.subject)})${topics}${prompt}`;
}

function buildChatSystemPrompt({ form, studentName, customPrompt, files, history }) {
  const type = typeLabel(form.resourceType);
  const fileLines = files.length
    ? files.map((file, i) => `${i + 1}. ${file.name}: ${file.summary}`).join("\n")
    : "None attached.";
  const historyLines = history.length
    ? history.map(historyLine).join("\n")
    : "No completed resources yet.";

  return `You are helping a tutor at Tenacity Tutoring plan a ${type} for ${studentName}, a Year ${form.year} ${subjectLabel(form.subject)} student, before it is generated.

What you do:
- Ask short clarifying questions when the brief is unclear: topic focus, difficulty, length, question styles.
- Propose an outline when asked, or once you know enough.
- Discuss freely if the tutor wants to think something through.
- Write a brief for the resource generator in proposedPrompt as soon as you know the topic focus. Don't hold it back to ask about details you could reasonably assume: write the draft, say what you assumed, and ask at most one question about it. Never ask about something the tutor has already told you.

The brief:
- It is passed to the generator as the tutor's custom instructions for this ${type}. Write it as direct instructions in plain prose.
- Keep it under 1500 characters. The hard limit is ${CHAT_LIMITS.maxPromptChars}.
- Don't restate settings the generator already has: student, year, subject, resource type, answer section and marks.
- When revising, return the whole updated brief, not just the change.
- Leave proposedPrompt as "" on turns where you have no new or changed draft.

Your reply:
- Conversational and concise, under about 150 words, plain text. Simple numbered or "•" lists are fine; no headings or bold.
- Base claims about the reference documents and past resources only on the context below. If something isn't there, say you can't see it.
- suggestions: up to ${CHAT_LIMITS.maxSuggestions} short replies the tutor might send next, each under 8 words, or [] if none fit.
- Use Australian English.

Form settings: ${type}, Year ${form.year} ${subjectLabel(form.subject)}, ${ANSWER_MODE_TEXT[form.answerMode] || ANSWER_MODE_TEXT.none}, marks ${form.showMarks ? "shown" : "hidden"}.

Current custom prompt: ${customPrompt ? `"${customPrompt}"` : "(empty)"}

Reference documents (summaries):
${fileLines}

${studentName}'s recent completed resources, newest first:
${historyLines}`;
}

// The model needs a user turn to answer first. The portal opens the chat with
// an empty transcript, so this stands in for the tutor's opening message.
function openingMessage({ customPrompt }) {
  return customPrompt
    ? "I'd like to refine the current custom prompt. Briefly confirm what you're working from, then ask what I'd like to change."
    : "Let's plan this resource. Briefly summarise what you're working from, then ask your most important clarifying questions.";
}

// Earlier assistant turns are replayed in the shape the model produced them,
// so it sees its own previous drafts.
function buildChatMessages({ customPrompt, transcript }) {
  return [
    { role: "user", content: openingMessage({ customPrompt }) },
    ...transcript.map((message) =>
      message.role === "assistant"
        ? {
            role: "assistant",
            content: JSON.stringify({
              reply: message.content,
              proposedPrompt: message.proposedPrompt || "",
              suggestions: [],
            }),
          }
        : { role: "user", content: message.content }
    ),
  ];
}

function normaliseChatReply(parsed) {
  // The portal sends each reply back as part of the transcript, which is
  // validated at maxMessageChars; an over-long reply would block the next turn.
  const reply = String(parsed?.reply || "").trim().slice(0, CHAT_LIMITS.maxMessageChars);
  if (!reply) {
    const err = new Error("AI chat reply was empty");
    err.modelFailure = true;
    throw err;
  }
  const suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions
        .map((s) => String(s || "").trim())
        .filter((s) => s && s.length <= CHAT_LIMITS.maxSuggestionChars)
        .slice(0, CHAT_LIMITS.maxSuggestions)
    : [];
  return {
    reply,
    proposedPrompt: String(parsed?.proposedPrompt || "").trim().slice(0, CHAT_LIMITS.maxPromptChars),
    suggestions,
  };
}

const FILE_SUMMARY_SYSTEM_PROMPT = `You summarise reference documents for a tutor at Tenacity Tutoring who is planning a resource for a student.

For each document, write about 100 words of plain text covering: what it is (past paper, assessment notification, class notes…), the topics it covers, question styles and marks, difficulty, length or timing, and anything notable such as test dates or "no calculators". Don't invent details that aren't in the text.

Return one summary per document, using the document's index.`;

function buildFileSummaryMessage(contents) {
  return contents
    .map((file, index) =>
      `Document ${index}: ${file.fileName}\n"""\n${String(file.content || "").slice(0, CHAT_LIMITS.maxFileChars)}\n"""`
    )
    .join("\n\n");
}

// Maps the model's summaries back onto files by index. A file the model skipped
// still gets a placeholder so the portal doesn't ask for it again every turn.
function normaliseFileSummaries(parsed, files) {
  const byIndex = new Map();
  for (const entry of Array.isArray(parsed?.summaries) ? parsed.summaries : []) {
    const summary = String(entry?.summary || "").trim();
    if (Number.isInteger(entry?.index) && summary) byIndex.set(entry.index, summary);
  }
  return files.map((file, index) => ({
    path: file.path,
    name: file.name,
    summary: clip(byIndex.get(index) || UNSUMMARISED_FILE, CHAT_LIMITS.maxSummaryChars),
  }));
}

module.exports = {
  CHAT_LIMITS,
  CHAT_RESPONSE_SCHEMA,
  FILE_SUMMARY_SCHEMA,
  FILE_SUMMARY_SYSTEM_PROMPT,
  UNSUMMARISED_FILE,
  buildChatMessages,
  buildChatSystemPrompt,
  buildFileSummaryMessage,
  normaliseChatReply,
  normaliseFileSummaries,
  openingMessage,
};
