"use strict";

// RES-24: the pre-generation chat's limits and reference-file summaries. The
// chat itself is the resource assistant (RES-102, resourceAssistant.js). The
// chat never generates the resource and nothing here is stored: the portal
// holds the transcript and sends it back each turn. This module is pure.

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

function clip(text, max) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
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
  FILE_SUMMARY_SCHEMA,
  FILE_SUMMARY_SYSTEM_PROMPT,
  UNSUMMARISED_FILE,
  buildFileSummaryMessage,
  normaliseFileSummaries,
};
