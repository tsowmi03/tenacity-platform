"use strict";

// RES-67. The set-text reference bank: one record per text studied from the
// LitCharts guides in Resources/English/LitCharts, with its themes,
// characters, symbols and key quotes, so resources about a set text get its
// themes and quotes right. Kept apart from the stimulus bank: these are study
// guides, not texts students respond to.

const { SET_TEXTS_COLLECTION } = require("./collections");
const { ALL_TECHNIQUES } = require("./taxonomy");

const SET_TEXT_FORMS = Object.freeze(["novel", "play", "poem", "short_story", "nonfiction", "other"]);
const MAX_SOURCE_CHARS = 300000;

/**
 * The main LitChart file for each set text in a listing of English/LitCharts:
 * a PDF named "...LitChart..." (not the Shakescleare translation), the
 * shortest path per top-level entry, one per title.
 */
function chooseLitChartFiles(files) {
  const byEntry = new Map();
  for (const file of files) {
    const parts = file.path.split("/");
    if (parts[1] !== "LitCharts" || !/\.pdf$/i.test(file.name)) continue;
    if (!/lit-?charts?/i.test(file.name) || /translation/i.test(file.name)) continue;
    const entry = parts[2];
    const current = byEntry.get(entry);
    if (!current || file.path.length < current.path.length) byEntry.set(entry, file);
  }
  const byTitle = new Map();
  for (const file of byEntry.values()) {
    const key = titleKey(file.name);
    if (!byTitle.has(key)) byTitle.set(key, file);
  }
  return [...byTitle.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// "Mr-Pip-LitChart.pdf" and "LitCharts-mr-pip.pdf" are both "mr pip".
function titleKey(name) {
  return String(name)
    .replace(/\.pdf$/i, "")
    .replace(/\(\d+\)/g, "")
    .replace(/lit-?charts?/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugOf(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const named = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description"],
  properties: { name: { type: "string" }, description: { type: "string" } },
};

const SET_TEXT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["title", "author", "form", "summary", "context", "themes", "characters", "symbols", "quotes"],
  properties: {
    title: { type: "string" },
    author: { type: ["string", "null"] },
    form: { type: "string", enum: SET_TEXT_FORMS },
    summary: { type: "string" },
    context: { type: ["string", "null"] },
    themes: { type: "array", items: named },
    characters: { type: "array", items: named },
    symbols: { type: "array", items: named },
    quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "speaker", "location", "themes", "techniques", "explanation"],
        properties: {
          quote: { type: "string" },
          speaker: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          themes: { type: "array", items: { type: "string" } },
          techniques: { type: "array", items: { type: "string", enum: ALL_TECHNIQUES } },
          explanation: { type: "string" },
        },
      },
    },
  },
});

function setTextPrompt({ path, text }) {
  return `Below is the text of a LitCharts study guide (${path}). Build a reference record for the text it is about, for tutors writing resources on it.

- title, author: of the text studied (not of LitCharts). form: ${SET_TEXT_FORMS.join(", ")}.
- summary: what happens or what it is about, in at most 120 words of your own.
- context: one or two sentences on when and where it was written, if the guide says.
- themes: every theme the guide lists, each with a one or two sentence description in your own words.
- characters: the main characters (up to 15), each with a one sentence description. Empty for a poem with no named speaker.
- symbols: the symbols the guide lists, each described in a sentence.
- quotes: up to 25 of the most important quotations from the text itself (not the guide's commentary), copied exactly as the guide prints them. speaker and location (e.g. "Act 1, Scene 7" or "Chapter 3") where the guide gives them; the themes each relates to, using your theme names; any techniques it shows; and a one sentence explanation in your own words.

<guide>
${text.slice(0, MAX_SOURCE_CHARS)}
</guide>`;
}

function normaliseQuote(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

/**
 * The record for one set text. A quote that doesn't appear in the guide's own
 * text is dropped, so only real quotations are stored.
 */
function toSetTextDoc({ source, parsed, guideText, runId = null, model = null }) {
  const haystack = normaliseQuote(guideText);
  const quotes = (parsed.quotes || []).filter((entry) => {
    const needle = normaliseQuote(entry.quote);
    return needle.length >= 3 && haystack.includes(needle);
  });
  const clean = (list) => (list || []).filter((entry) => entry.name && entry.description);
  return {
    id: slugOf(parsed.title || titleKey(source.name)),
    droppedQuotes: (parsed.quotes || []).length - quotes.length,
    data: {
      status: "live",
      title: parsed.title,
      author: parsed.author || null,
      form: parsed.form,
      summary: parsed.summary,
      context: parsed.context || null,
      themes: clean(parsed.themes),
      themeNames: clean(parsed.themes).map((theme) => theme.name.toLowerCase()),
      characters: clean(parsed.characters),
      symbols: clean(parsed.symbols),
      quotes: quotes.map((entry) => ({ ...entry, techniques: [...new Set(entry.techniques || [])] })),
      sourceId: source.id,
      sourcePath: source.path,
      sourceVersion: source.version || null,
      runId,
      model,
    },
  };
}

module.exports = {
  MAX_SOURCE_CHARS,
  SET_TEXTS_COLLECTION,
  SET_TEXT_FORMS,
  SET_TEXT_SCHEMA,
  chooseLitChartFiles,
  setTextPrompt,
  slugOf,
  titleKey,
  toSetTextDoc,
};
