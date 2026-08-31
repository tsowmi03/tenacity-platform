"use strict";

/**
 * SPIKE — verifiable public-domain text selection (Project Gutenberg).
 *
 * The goal is *verifiable full text*: the model never transcribes the passage.
 * Instead it acts as a curator — it picks a real, public-domain English work
 * suited to a brief and returns structured metadata. Our backend then resolves
 * that to a canonical Project Gutenberg ebook (via the Gutendex API),
 * deterministically downloads the plain-text file, strips the Gutenberg
 * boilerplate, and (for a poem inside a collection) best-effort locates the
 * named piece. The passage handed to the worksheet is therefore provably the
 * fetched bytes, with a citation URL a human can click and check.
 *
 * Decoupling: selectPublicDomainText() (the model) chooses; resolveGutenbergBook
 * + fetchPlainText + stripGutenbergBoilerplate + extractNamedPiece (deterministic)
 * produce the text. This module is the spike's reusable core; the CLI in
 * scripts/spikePublicDomainText.js wires it together for inspection.
 */

const { callAiForResource } = require("./aiClient");
const { resourceFailureReasonCode } = require("./failure");
const {
  SOURCE_PLANNER_FALLBACK_MODEL,
  SOURCE_PLANNER_MODEL,
  providerForModel,
} = require("./modelRegistry");

// Trailing slash is the canonical form — /books redirects (301) to /books/,
// which would cost an extra round trip on every search.
const GUTENDEX_BASE = "https://gutendex.com/books/";
const DEFAULT_MODEL = SOURCE_PLANNER_MODEL;
const FETCH_TIMEOUT_MS = 20000;

const SELECTION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "author",
    "type",
    "standaloneOnGutenberg",
    "collectionHint",
    "pieceTitle",
    "approxWordCount",
    "themes",
    "yearLevelFit",
    "rationale",
    "publicDomainBasis",
  ],
  properties: {
    title: { type: "string" },
    author: { type: "string" },
    type: { type: "string", enum: ["poem", "short-story", "nonfiction"] },
    standaloneOnGutenberg: { type: "boolean" },
    collectionHint: { anyOf: [{ type: "string" }, { type: "null" }] },
    pieceTitle: { type: "string" },
    approxWordCount: { type: "integer", minimum: 1 },
    themes: { type: "array", items: { type: "string" } },
    yearLevelFit: { type: "string" },
    rationale: { type: "string" },
    publicDomainBasis: { type: "string" },
  },
});

const STIMULUS_TEXT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "author",
    "type",
    "standaloneOnGutenberg",
    "collectionHint",
    "pieceTitle",
    "approxWordCount",
    "themes",
    "rationale",
  ],
  properties: {
    title: { type: "string" },
    author: { type: "string" },
    type: { type: "string", enum: ["poem", "short-story", "nonfiction"] },
    standaloneOnGutenberg: { type: "boolean" },
    collectionHint: { anyOf: [{ type: "string" }, { type: "null" }] },
    pieceTitle: { type: "string" },
    approxWordCount: { type: "integer", minimum: 1 },
    themes: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  },
});

/**
 * A visual stimulus the planner has asked for. The planner never names a file or
 * describes a picture — it says what to go and look for, and commonsImage.js
 * resolves that to real, openly-licensed bytes.
 *
 * `region` is a preference, not a requirement: Australian-specific visual texts
 * are scarce on Commons, so a region that finds nothing falls back to
 * international material rather than dropping the stimulus.
 */
const STIMULUS_VISUAL_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["purpose", "searchTerms", "region", "task", "rationale"],
  properties: {
    purpose: { type: "string", enum: ["visual-literacy", "creative-prompt"] },
    searchTerms: { type: "string" },
    region: { anyOf: [{ type: "string" }, { type: "null" }] },
    task: { type: "string" },
    rationale: { type: "string" },
  },
});

/**
 * Texts and visuals are separate arrays rather than one array of a
 * text-or-visual union. A union here would have to be discriminated across two
 * quite different shapes, and structured outputs impose undocumented limits on
 * union-typed parameters, grammar size and compile time (measured in RES-1,
 * where a 41-type diagram union proved impossible). Two arrays express the same
 * mixed set — the planner still decides how many of each — without going near
 * those limits. The combined cap is enforced in code.
 */
const STIMULUS_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["needed", "texts", "visuals"],
  properties: {
    needed: { type: "boolean" },
    texts: {
      type: "array",
      maxItems: 3,
      items: STIMULUS_TEXT_SCHEMA,
    },
    visuals: {
      type: "array",
      maxItems: 2,
      items: STIMULUS_VISUAL_SCHEMA,
    },
  },
});

function plannerMetadata({
  requestedModel,
  result,
  fallbackUsed,
  reasonCode = null,
  primaryError = null,
}) {
  const usageByProvider = {};
  if (primaryError?.usage) {
    usageByProvider[primaryError.provider || providerForModel(requestedModel)] = primaryError.usage;
  }
  if (result?.usage) usageByProvider[result.provider] = result.usage;
  return {
    requestedModel,
    effectiveModel: result.model,
    effectiveProvider: result.provider,
    fallbackUsed,
    reasonCode,
    usage: result.usage,
    usageByProvider,
  };
}

async function callCuratorWithFallback({
  anthropicApiKey,
  openaiApiKey,
  apiKey,
  model = DEFAULT_MODEL,
  systemPrompt,
  userMessage,
  responseSchema,
  callAi = callAiForResource,
  signal,
  safetyIdentifier,
  allowFallback = true,
}) {
  const invoke = async (targetModel) => {
    const result = await callAi({
      anthropicApiKey: anthropicApiKey || apiKey,
      openaiApiKey,
      model: targetModel,
      maxTokens: 4096,
      effort: targetModel === SOURCE_PLANNER_FALLBACK_MODEL ? "low" : null,
      thinkingDisabled: targetModel === SOURCE_PLANNER_MODEL,
      systemPrompt,
      userMessage,
      mathBearing: false,
      responseSchema,
      signal,
      safetyIdentifier,
    });
    return {
      ...result,
      model: result.model || targetModel,
      provider: result.provider || providerForModel(targetModel),
    };
  };

  try {
    const result = await invoke(model);
    return {
      result,
      planner: plannerMetadata({ requestedModel: model, result, fallbackUsed: false }),
    };
  } catch (primaryError) {
    if (
      !allowFallback ||
      model !== SOURCE_PLANNER_MODEL ||
      ["APIUserAbortError", "AbortError"].includes(primaryError?.name) ||
      primaryError?.cancelled === true
    ) {
      throw primaryError;
    }
    const result = await invoke(SOURCE_PLANNER_FALLBACK_MODEL);
    return {
      result,
      planner: plannerMetadata({
        requestedModel: model,
        result,
        fallbackUsed: true,
        reasonCode: resourceFailureReasonCode(primaryError),
        primaryError,
      }),
    };
  }
}

const SELECTION_SYSTEM_PROMPT = `You are a literature curator for an English tutoring service. You select REAL, existing, public-domain works for comprehension and analysis practice — you never invent or paraphrase texts.

Hard rules:
- The work MUST be genuinely public domain: first published before 1929, by an author who died more than 70 years ago. When unsure, choose something older and unambiguous.
- The work MUST plausibly exist on Project Gutenberg (gutenberg.org) in English. Prefer well-known works.
- Prefer short, self-contained works that exist as their OWN Gutenberg ebook (a single short story, a short complete work). This makes verifiable extraction reliable. Only fall back to a piece inside a collection (e.g. one poem in a poet's collected works) when necessary.
- Match the requested year level, skill focus, length and theme. Classic register is fine; do not pick anything too archaic for the year level.

Return ONLY a JSON object, no prose, with exactly these fields:
{
  "title": "the work's title",
  "author": "author full name",
  "type": "poem" | "short-story" | "nonfiction",
  "standaloneOnGutenberg": true | false,
  "collectionHint": "title of the Gutenberg collection it lives in, or null if standalone",
  "pieceTitle": "exact heading to locate the piece within a collection text (usually equal to title)",
  "approxWordCount": <integer estimate>,
  "themes": ["..."],
  "yearLevelFit": "one sentence on why it suits the requested year level",
  "rationale": "one sentence on why it fits the skill focus and theme",
  "publicDomainBasis": "e.g. 'Poe died 1849; published 1843'"
}`;

/**
 * Ask the model to curate a single public-domain work for the brief.
 * Returns the parsed selection object (see SELECTION_SYSTEM_PROMPT shape).
 */
async function selectPublicDomainText({
  apiKey,
  anthropicApiKey,
  openaiApiKey,
  model = DEFAULT_MODEL,
  brief,
  callAi = callAiForResource,
  signal,
  safetyIdentifier,
  excludedTitles = [],
  allowFallback = true,
}) {
  if (!apiKey && !anthropicApiKey && !openaiApiKey) {
    throw new TypeError("selectPublicDomainText requires a provider api key");
  }
  if (!brief) throw new TypeError("selectPublicDomainText requires brief");

  const userMessage = [
    "Select one public-domain work for this brief:",
    `- Year level: ${brief.year}`,
    `- Text type: ${brief.textType}`,
    `- Approx length (words): ${brief.lengthWords}`,
    `- Skill focus: ${brief.skillFocus}`,
    brief.theme ? `- Theme: ${brief.theme}` : null,
    excludedTitles.length
      ? `- Do not select any of these previously attempted works: ${excludedTitles.join("; ")}`
      : null,
    "",
    "Respond with the JSON object only.",
  ]
    .filter(Boolean)
    .join("\n");

  // Reuse the resource API client. English content is prose, so disable the
  // maths-oriented backslash repair when parsing the JSON.
  const { result, planner } = await callCuratorWithFallback({
    anthropicApiKey,
    openaiApiKey,
    apiKey,
    model,
    systemPrompt: SELECTION_SYSTEM_PROMPT,
    userMessage,
    responseSchema: SELECTION_SCHEMA,
    callAi,
    signal,
    safetyIdentifier,
    allowFallback,
  });
  return { ...result.parsed, _planner: planner };
}

// A resource can carry at most this many stimulus texts, so an over-eager plan
// cannot balloon a generation.
const MAX_STIMULUS_TEXTS = 3;
const MAX_STIMULUS_VISUALS = 2;
// Texts and visuals combined — a booklet longer than this stops being workable.
const MAX_STIMULUS_ITEMS = 3;

// Per-file excerpt budget for uploaded reference documents shown to the
// planner. Enough to reveal each document's kinds/themes without paying for
// whole PDFs in a call whose only job is to choose works.
const PLAN_UPLOAD_EXCERPT_CHARS = 1500;

// Render tutor-uploaded reference documents as short excerpts for the planning
// call, so the planner can mirror their kinds/themes (or recognise a set text)
// without the full extracted content.
function uploadedExcerptsForPlan(uploadedContent) {
  const files = Array.isArray(uploadedContent) ? uploadedContent : [];
  const blocks = files
    .filter((file) => file && String(file.content || "").trim())
    .map((file, index) => {
      const content = String(file.content).trim();
      const excerpt =
        content.length > PLAN_UPLOAD_EXCERPT_CHARS
          ? `${content.slice(0, PLAN_UPLOAD_EXCERPT_CHARS)} [...truncated]`
          : content;
      return `UPLOADED DOCUMENT ${index + 1} (${file.fileName || "uploaded file"}) — excerpt:\n${excerpt}`;
    });
  return blocks.length ? blocks.join("\n\n") : null;
}

const STIMULUS_PLAN_SYSTEM_PROMPT = `You are a curator for an English tutoring service. You decide whether a resource needs the student to be given material to work from — texts to READ, images to LOOK AT, or both — and if so you specify it. You never invent, paraphrase or describe the material itself.

STEP 1 — Decide if a stimulus is needed. It IS needed when the resource asks the student to work from provided material and respond — comprehension, close reading, analysis, an unseen-text task, visual literacy, an image-prompted writing task, or the reading section of a paper. It is NOT needed for purely skills-based work — grammar, punctuation, spelling, vocabulary, essay-writing technique with no set text, or generic writing practice. If no stimulus is needed, return { "needed": false, "texts": [], "visuals": [] } and nothing else.

STEP 2 — If needed, choose the number and KINDS that fit the request. Honour the tutor's instructions: poetry → poems; short stories → prose fiction; informational / non-fiction / persuasive texts → essays, speeches or articles; a mix → a suitable mix. A short comprehension usually needs 1 text; a practice-paper reading section often 2-3. Never exceed 3 texts, and never more than 3 items in total across texts and visuals.

STEP 3 — Decide whether any of that stimulus should be VISUAL. Add a visual only when looking at an image is part of the work:
- "visual-literacy" — the student ANALYSES the image itself: composition, salience, colour, gaze, symbolism, the interplay of image and written text. Posters, advertisements, political cartoons and campaign material suit this.
- "creative-prompt" — the student WRITES from the image; it is a springboard, not an object of analysis. An evocative photograph or artwork suits this.
Do not add a visual to a straight reading-comprehension or poetry-analysis task just because you can. A resource may be entirely visual, entirely textual, or a mix.

For each visual, give "searchTerms": a few plain, concrete words naming the KIND of image to find, as someone would type into an image library — "World War I recruitment poster", "1920s magazine advertisement", "storm at sea painting". Keep them short: every word must match, so a long specific phrase finds nothing. Do not name a specific artwork or photographer, and do not describe an image you have imagined.

Set "region" only when the locale genuinely matters to the task (e.g. "Australian" for a unit on Australian identity); otherwise null. Australian-specific material is scarce, so a region is treated as a preference and international material is used when nothing local is found.

"task" is one sentence telling the student what to do with the image; it must make sense whichever suitable image is found, since you do not get to see it.

Images are sourced only from openly-licensed collections and are always credited, so choose kinds of image that plausibly exist in a public archive. Modern commercial advertisements and copyrighted film or press images cannot be sourced; historical advertising, government and campaign material, and documentary photography can.

UPLOADED REFERENCE MATERIAL — the request may include excerpts of documents the tutor uploaded (an assessment notification, a past or sample paper, a stimulus booklet). These are context showing what the resource should look like, NOT texts to reprint: texts inside them are almost always still under copyright and must never be chosen as stimulus. When the resource needs reading texts, plan public-domain works that mirror the uploaded material — the same kinds, themes and difficulty (e.g. a booklet with one poem and two prose extracts about growing up → plan one public-domain poem and two public-domain prose extracts about growing up). An instruction like "include the stimulus booklet" means the generated paper needs its own stimulus section in that style; it does not change the copyright rule. Return { "needed": false, "texts": [] } because of the uploads ONLY when the tutor clearly directs that a specific uploaded text itself is the one the students must work from (a set text, "write questions on this text") — the generator will then use the uploaded material directly.

Hard rules for every chosen work:
- Genuinely public domain: first published before 1929, author died more than 70 years ago. When unsure, choose older and unambiguous.
- MUST plausibly exist in English on Wikisource (poems) or Project Gutenberg (prose / non-fiction). Prefer well-known, short, self-contained works.
- Match the year level, skill focus and theme; nothing too archaic for the year level.

Return ONLY a JSON object, no prose:
{
  "needed": true | false,
  "texts": [
    {
      "title": "the work's title",
      "author": "author full name",
      "type": "poem" | "short-story" | "nonfiction",
      "standaloneOnGutenberg": true | false,
      "collectionHint": "title of the Gutenberg collection it lives in, or null",
      "pieceTitle": "exact heading to locate the piece within a collection (usually equal to title)",
      "approxWordCount": <integer estimate>,
      "themes": ["..."],
      "rationale": "one sentence on why it fits the resource and the tutor's request"
    }
  ],
  "visuals": [
    {
      "purpose": "visual-literacy" | "creative-prompt",
      "searchTerms": "a few plain words naming the kind of image to find",
      "region": "a locale when it genuinely matters, else null",
      "task": "one sentence telling the student what to do with the image",
      "rationale": "one sentence on why a visual belongs in this resource"
    }
  ]
}`;

/**
 * Demand-driven stimulus planning. In a single cheap model call, decide whether
 * a resource needs reading text(s) and — only when it does — curate the specific
 * e.g. poems for a poetry paper, a mix for a general "growing up" paper). Returns
 * { needed, texts } where each text is a selection object ready to fetch. When no
 * stimulus is needed the caller fetches nothing.
 */
async function planStimulusSelections({
  apiKey,
  anthropicApiKey,
  openaiApiKey,
  model = DEFAULT_MODEL,
  job,
  uploadedContent = null,
  callAi = callAiForResource,
  signal,
  safetyIdentifier,
}) {
  if (!apiKey && !anthropicApiKey && !openaiApiKey) {
    throw new TypeError("planStimulusSelections requires a provider api key");
  }
  if (!job) throw new TypeError("planStimulusSelections requires job");

  const uploadedExcerpts = uploadedExcerptsForPlan(uploadedContent);
  const userMessage = [
    "Plan the reading stimulus (if any) for this resource:",
    `- Resource type: ${String(job.resourceType || "").replace(/-/g, " ")}`,
    `- Year level: ${job.year}`,
    job.customPrompt
      ? `- Tutor instructions: ${job.customPrompt}`
      : "- Tutor instructions: (none given — infer a suitable general reading resource)",
    uploadedExcerpts ? `\n${uploadedExcerpts}` : null,
    "",
    "Respond with the JSON object only.",
  ]
    .filter((part) => part !== null)
    .join("\n");

  const { result, planner } = await callCuratorWithFallback({
    anthropicApiKey,
    openaiApiKey,
    apiKey,
    model,
    systemPrompt: STIMULUS_PLAN_SYSTEM_PROMPT,
    userMessage,
    responseSchema: STIMULUS_PLAN_SCHEMA,
    callAi,
    signal,
    safetyIdentifier,
  });

  const parsed = result.parsed;

  const texts = Array.isArray(parsed?.texts)
    ? parsed.texts
        .filter((text) => text && text.title && text.author && text.type)
        .slice(0, MAX_STIMULUS_TEXTS)
    : [];
  // Texts lead: a reading text is the harder thing to substitute, and a visual
  // is more often the optional extra. The combined cap keeps a stimulus booklet
  // to a length a student will actually work through.
  const visualBudget = Math.max(0, MAX_STIMULUS_ITEMS - texts.length);
  const visuals = Array.isArray(parsed?.visuals)
    ? parsed.visuals
        .filter((visual) => visual && visual.searchTerms)
        .slice(0, Math.min(visualBudget, MAX_STIMULUS_VISUALS))
    : [];

  return {
    needed: Boolean(parsed?.needed) && (texts.length > 0 || visuals.length > 0),
    texts,
    visuals,
    planner,
  };
}

async function selectAlternativePublicDomainText(options) {
  return selectPublicDomainText({
    ...options,
    model: SOURCE_PLANNER_FALLBACK_MODEL,
    allowFallback: false,
  });
}

function surnameOf(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  // Gutendex names are "Surname, Given"; model names are "Given Surname".
  if (raw.includes(",")) return raw.split(",")[0].trim().toLowerCase();
  const parts = raw.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function significantTokens(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function plainTextUrlFromFormats(formats) {
  const entries = Object.entries(formats || {});
  // Prefer an explicit UTF-8 plain-text format; never a zip.
  const utf8 = entries.find(
    ([k, v]) => /^text\/plain/i.test(k) && /utf-8/i.test(k) && !/\.zip$/i.test(v)
  );
  if (utf8) return utf8[1];
  const anyPlain = entries.find(
    ([k, v]) => /^text\/plain/i.test(k) && !/\.zip$/i.test(v)
  );
  return anyPlain ? anyPlain[1] : null;
}

async function fetchWithTimeout(url, { accept } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: accept ? { Accept: accept } : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const COLLECTION_TITLE_RE =
  /works|tales|poems|complete|collected|stories|anthology|verse/i;

async function searchGutendex(query, considered) {
  const url = `${GUTENDEX_BASE}?search=${encodeURIComponent(query)}`;
  // Gutendex sits behind Cloudflare and intermittently stalls past the fetch
  // timeout; one spaced retry clears the transient case without letting a real
  // outage stall the whole generation.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, { accept: "application/json" });
      const data = await res.json();
      considered.push({ query, resultCount: (data.results || []).length });
      return data;
    } catch (err) {
      considered.push({ query, error: err.message, attempt: attempt + 1 });
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return null;
}

function makeMatch(book, query, viaFallback, considered) {
  return {
    matched: true,
    viaFallback,
    matchedQuery: query,
    gutenbergId: book.id,
    gutenbergUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    textUrl: book.textUrl,
    copyright: book.copyright,
    titleResolved: book.title,
    authorsResolved: book.authors,
    considered,
  };
}

/**
 * Resolve a work to a canonical Gutenberg ebook via Gutendex.
 *
 * Gutendex `search` matches title+author metadata and ANDs every token, so a
 * famous short piece that only exists *inside* a collection (e.g. one poem in a
 * poet's collected works) returns nothing on a title search. We therefore try
 * precise queries first — each scored against the title it is actually
 * searching for (a collection-hint query must overlap the COLLECTION title,
 * not the piece title, or a correctly-found collection gets thrown away) —
 * and fall back to an author-only search that prefers collection-looking
 * titles. `viaFallback` on the result means "this is a collection: slice the
 * named piece out downstream", which is also set when a collection-hint query
 * wins the precise pass.
 */
async function resolveGutenbergBook({ title, author, queries, allowAuthorFallback = true }) {
  const wantSurname = surnameOf(author);
  const considered = [];

  const scoreBook = (book, wantTokens) => {
    const textUrl = plainTextUrlFromFormats(book.formats);
    if (!textUrl) return null;
    const resultTokens = significantTokens(book.title);
    return {
      id: book.id,
      title: book.title,
      authors: (book.authors || []).map((a) => a.name),
      copyright: book.copyright,
      textUrl,
      authorMatch: (book.authors || []).some((a) => surnameOf(a.name) === wantSurname),
      titleOverlap: wantTokens.filter((t) => resultTokens.includes(t)).length,
      downloads: book.download_count || 0,
    };
  };

  // Precise pass: a confident match needs the author AND at least one token of
  // the query's own target title, so we don't grab an unrelated work by the
  // same author.
  for (const entry of queries || []) {
    const { query, matchTitle = title, isCollection = false } =
      typeof entry === "string" ? { query: entry } : entry;
    const data = await searchGutendex(query, considered);
    if (!data) continue;
    const wantTokens = significantTokens(matchTitle);
    const scored = (data.results || [])
      .map((book) => scoreBook(book, wantTokens))
      .filter((b) => b && b.authorMatch && b.titleOverlap >= 1)
      .sort((a, b) => b.titleOverlap - a.titleOverlap || b.downloads - a.downloads);
    if (scored.length) return makeMatch(scored[0], query, isCollection, considered);
  }

  // Fallback pass: author-only, preferring collections we can slice a piece from.
  if (allowAuthorFallback && author) {
    const data = await searchGutendex(author, considered);
    if (data) {
      const fallbackTokens = significantTokens(title);
      const scored = (data.results || [])
        .map((book) => scoreBook(book, fallbackTokens))
        .filter((b) => b && b.authorMatch)
        .sort(
          (a, b) =>
            (COLLECTION_TITLE_RE.test(b.title) ? 1 : 0) -
              (COLLECTION_TITLE_RE.test(a.title) ? 1 : 0) || b.downloads - a.downloads
        );
      if (scored.length) return makeMatch(scored[0], `author:${author}`, true, considered);
    }
  }

  return { matched: false, considered };
}

async function fetchPlainText(textUrl) {
  const res = await fetchWithTimeout(textUrl, { accept: "text/plain" });
  return res.text();
}

/**
 * Remove the standard Project Gutenberg header/footer so only the work body
 * remains. Markers look like:
 *   *** START OF THE PROJECT GUTENBERG EBOOK <TITLE> ***
 *   *** END OF THE PROJECT GUTENBERG EBOOK <TITLE> ***
 */
function stripGutenbergBoilerplate(raw) {
  let text = String(raw || "").replace(/\r\n/g, "\n");
  const start = text.match(
    /\*\*\*\s*START OF TH(?:E|IS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i
  );
  if (start) text = text.slice(start.index + start[0].length);
  const end = text.match(
    /\*\*\*\s*END OF TH(?:E|IS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i
  );
  if (end) text = text.slice(0, end.index);

  // Drop a leading transcriber/producer note paragraph if present.
  text = text.replace(/^\s*(Produced by|This eBook|E-text prepared)[^\n]*\n/i, "");
  return text.trim();
}

function countWords(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Gutenberg plain text is hard-wrapped (a newline every ~70 chars), which the
 * DOCX builder would otherwise render as a ragged column of mid-sentence lines.
 * Unwrap it: join single newlines within a paragraph into spaces, keep blank
 * lines as paragraph breaks. The result is render-ready prose — paragraphs
 * separated by a blank line, no spurious intra-paragraph line breaks.
 */
function unwrapProse(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/) // split into paragraphs on blank lines
    .map((para) => para.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * Verse must keep its line breaks (unwrapProse would fold a poem into prose),
 * but Gutenberg centres verse with leading whitespace. Strip the common indent
 * so relative indentation (alternating verse indents) survives while the block
 * sits flush, and collapse runs of blank lines to single stanza breaks.
 */
function dedentLines(text) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""));
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^[ \t]*/)[0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((line) => line.slice(common))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A Gutenberg plain-text body opens with the work's own title page (title, "by",
 * author, sometimes a contents list) before the prose. That duplicates the
 * passage title/attribution shown around the box, so drop it: only when the
 * first block actually is the title, skip leading short header blocks until the
 * first substantial paragraph of prose.
 */
function stripGutenbergFrontMatter(body, title) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const wantTitle = norm(title);
  if (!wantTitle) return body;
  const blocks = String(body || "").split(/\n[ \t]*\n+/);
  if (!blocks.length || !norm(blocks[0]).startsWith(wantTitle)) return body;

  let i = 0;
  while (i < blocks.length && i < 6 && blocks[i].replace(/\s+/g, " ").trim().length < 120) {
    i += 1;
  }
  const remainder = blocks.slice(i).join("\n\n").trim();
  return remainder || body;
}

// A stimulus text is an extract, not a whole book. Bodies longer than the
// trigger are cut to an opening excerpt near the planned length; without this a
// standalone novel (e.g. Great Expectations) would ship all ~180k words into
// the generation prompt and the rendered booklet.
const EXCERPT_TRIGGER_WORDS = 900;
const EXCERPT_MIN_WORDS = 200;
const EXCERPT_MAX_WORDS = 800;

const FRONT_MATTER_PARA_RE =
  /^(\[*illustration|contents\b|list of illustrations|by\b|preface\b|dedication\b|transcriber|produced by|e-text|copyright\b|\d{4} edition|\[\d{4} edition\])/i;

// A chapter-style heading paragraph: "Chapter I.", "CHAPTER 1", "I. WILLIAM",
// "Book the First". Short by definition — a merged contents list is one long
// paragraph and never matches.
function isChapterHeading(paragraph) {
  return (
    countWords(paragraph) <= 8 &&
    /^(?:(?:chapter|part|book)\s+[ivxlcd\d]|[ivxlcd]+\.(?:\s|$))/i.test(paragraph.trim())
  );
}

/**
 * Deterministic opening excerpt: start at the body of the first chapter when
 * the work has chapter headings (skipping other people's prefaces and
 * introductory letters, which open many classic texts), skip any remaining
 * front-matter-ish paragraphs (title lines, bylines, contents lists,
 * illustration markers, all-caps registration notices), then keep whole
 * paragraphs until the target length is reached. The result is a contiguous
 * verbatim slice of the fetched text, so the "provably the source bytes"
 * property survives excerpting.
 */
function excerptOpening(passage, targetWords, title, { fromChapterStart = true, skipFrontMatter = true } = {}) {
  const paragraphs = String(passage || "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const target = Math.min(
    Math.max(Number(targetWords) || 500, EXCERPT_MIN_WORDS),
    EXCERPT_MAX_WORDS
  );
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const wantTitle = norm(title);

  let start = 0;
  if (fromChapterStart) {
    const chapterIdx = paragraphs.findIndex(isChapterHeading);
    if (chapterIdx >= 0 && chapterIdx < paragraphs.length - 1) start = chapterIdx + 1;
  }

  while (skipFrontMatter && start < paragraphs.length - 1) {
    const para = paragraphs[start];
    const words = countWords(para);
    const letters = para.replace(/[^a-z]/gi, "");
    const isFrontMatter =
      FRONT_MATTER_PARA_RE.test(para) ||
      (wantTitle && norm(para).startsWith(wantTitle) && words <= 12) ||
      // An unwrapped contents list ("Chapter I. Chapter II. ...", "I. WILLIAM
      // II. THE UNKNOWN ...") is one long paragraph dominated by labels.
      (para.match(/\bchapter\b/gi) || []).length >= 3 ||
      (para.match(/(?:^|\s)[IVXLCD]+\.(?:\s|$)/g) || []).length >= 3 ||
      // Registration notices, contents lists and section headings are set in
      // caps; narrative prose never is.
      (letters.length > 0 && letters === letters.toUpperCase()) ||
      // Bare headings, bylines and edition lines are short; real prose is not.
      words < 15;
    if (!isFrontMatter) break;
    start += 1;
  }

  const kept = [];
  let words = 0;
  for (let i = start; i < paragraphs.length; i += 1) {
    kept.push(paragraphs[i]);
    words += countWords(paragraphs[i]);
    if (words >= target) break;
  }
  let text = kept.join("\n\n").trim();

  // A body that unwrapped into one enormous paragraph would blow straight past
  // the target; cut it at the first sentence end beyond the target instead.
  if (countWords(text) > target * 2) {
    const allWords = text.split(/\s+/);
    const head = allWords.slice(0, target).join(" ");
    const rest = allWords.slice(target).join(" ");
    const sentenceEnd = rest.match(/^[\s\S]{0,400}?[.!?]["')\]]*(?=\s|$)/);
    text = (sentenceEnd ? `${head} ${sentenceEnd[0]}` : head).trim();
  }
  return text;
}

function normalizeHeading(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Slice a body from just after a heading line until a `* * *` separator, a run
 * of blank lines followed by a new ALL-CAPS/roman-numeral heading, or the end.
 */
function sliceFromHeading(lines, startIdx) {
  const collected = [];
  let blanks = 0;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(\*\s*){3,}\s*$/.test(line)) break;
    if (line.trim() === "") {
      blanks += 1;
      if (blanks >= 2 && collected.length) {
        const next = (lines[i + 1] || "").trim();
        const looksLikeHeading =
          next && (next === next.toUpperCase() || /^[IVXLC]+\.?$/.test(next));
        if (looksLikeHeading) break;
      }
      collected.push("");
      continue;
    }
    blanks = 0;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

/**
 * Best-effort extraction of a single named piece (e.g. one poem) from a
 * collection body. A title typically appears more than once — in the table of
 * contents AND as the real heading — so we slice from *every* match and keep the
 * longest result, which skips the short TOC entries. When the matched line is
 * immediately followed by more text (no blank line) it is a first line, not a
 * heading — many poems are known by their first line ("When I was
 * one-and-twenty") while the collection numbers them — so the matched line
 * itself is kept in the slice. `shortForm` relaxes the length thresholds for
 * kinds where a complete piece is legitimately brief (poems).
 */
function extractNamedPiece(body, pieceTitle, { shortForm = false } = {}) {
  const lines = String(body || "").split("\n");
  const target = normalizeHeading(pieceTitle);
  if (!target) {
    return { text: null, confidence: "none", notes: "No piece title supplied." };
  }

  const matches = [];
  lines.forEach((line, i) => {
    if (normalizeHeading(line) === target) matches.push(i);
  });
  if (!matches.length) {
    return {
      text: null,
      confidence: "none",
      notes: `Could not locate a heading matching "${pieceTitle}" in the collection.`,
    };
  }

  let best = "";
  for (const idx of matches) {
    let slice = sliceFromHeading(lines, idx);
    const next = (lines[idx + 1] || "").trim();
    // Keep the line's original indent: verse callers dedent by the common
    // indent, which only lines up when the first line still carries its own.
    if (next && slice) slice = `${lines[idx].replace(/[ \t]+$/, "")}\n${slice}`;
    if (countWords(slice) > countWords(best)) best = slice;
  }

  const minWords = shortForm ? 24 : 40;
  const mediumWords = shortForm ? 48 : 120;
  const words = countWords(best);
  const confidence = words >= mediumWords ? "medium" : words >= minWords ? "low" : "none";
  const ambiguity =
    matches.length > 1
      ? `${matches.length} headings matched (likely TOC + body); kept the longest slice. `
      : "";
  return {
    text: words >= minWords ? best : null,
    confidence,
    notes: `${ambiguity}Heuristic slice — verify against the source URL.`,
  };
}

function buildChecks({ selection, resolution, bodyText, wordCount, brief }) {
  const titleTokens = significantTokens(selection.title);
  const haystack = String(bodyText || "").toLowerCase();
  const titlePresent =
    titleTokens.length > 0 && titleTokens.some((t) => haystack.includes(t));
  const targetLen = Number(brief.lengthWords) || 0;
  const lenOk =
    targetLen > 0 ? wordCount >= targetLen * 0.6 && wordCount <= targetLen * 1.4 : null;

  const checks = [
    {
      name: "Resolved to a Gutenberg ebook",
      pass: !!resolution.matched,
      detail: resolution.matched
        ? `#${resolution.gutenbergId} — ${resolution.titleResolved}`
        : "no confident Gutendex match",
    },
    {
      name: "Marked public domain (copyright=false)",
      pass: resolution.matched ? resolution.copyright === false : false,
      detail: resolution.matched ? `copyright=${resolution.copyright}` : "n/a",
    },
    {
      name: "Plain text downloaded",
      pass: wordCount > 0,
      detail: `${wordCount} words`,
    },
    {
      name: "Title tokens appear in source text",
      pass: titlePresent,
      detail: titlePresent ? "found" : "not found — possible mismatch",
    },
  ];
  if (lenOk !== null) {
    checks.push({
      name: "Within ±40% of requested length",
      pass: lenOk,
      detail: `${wordCount} vs target ${targetLen}`,
    });
  }
  return checks;
}

/**
 * Source one prose work from Project Gutenberg for a given model selection:
 * resolve -> fetch -> strip -> (slice if a collection) -> audit. Returns the
 * normalised source shape shared with the Wikisource path (see wikisource.js) so
 * the dispatcher and pipeline treat sources uniformly. `ok` means a passage was
 * extracted at acceptable confidence (whole-work=high, sliced piece>=medium).
 */
async function sourceGutenbergWork({ selection, brief = {} }) {
  const queries = [];
  if (selection.pieceTitle) {
    queries.push({
      query: [selection.pieceTitle, selection.author].filter(Boolean).join(" "),
      matchTitle: selection.pieceTitle,
    });
  }
  queries.push({
    query: [selection.title, selection.author].filter(Boolean).join(" "),
    matchTitle: selection.title,
  });
  if (selection.collectionHint) {
    queries.push({
      query: [selection.collectionHint, selection.author].filter(Boolean).join(" "),
      matchTitle: selection.collectionHint,
      isCollection: true,
    });
  }
  const seenQueries = new Set();
  const dedupedQueries = queries.filter(({ query }) => {
    if (seenQueries.has(query)) return false;
    seenQueries.add(query);
    return true;
  });

  const resolution = await resolveGutenbergBook({
    title: selection.title,
    author: selection.author,
    queries: dedupedQueries,
  });

  if (!resolution.matched) {
    return {
      ok: false,
      source: "Project Gutenberg",
      selection,
      resolution,
      passage: null,
      checks: buildChecks({ selection, resolution, bodyText: "", wordCount: 0, brief }),
    };
  }

  const rawText = await fetchPlainText(resolution.textUrl);
  const body = stripGutenbergBoilerplate(rawText);

  // A precise title match means we resolved the work's own ebook → use the whole
  // body. A fallback match means we resolved a collection → slice the piece out.
  // A poem is ALWAYS sliced first even on a precise match: precise can mean the
  // poem's collection (via collectionHint), and a whole collection must never
  // ship as "the poem". Whole-work is only trusted for a poem when the resolved
  // ebook title itself names the piece (a genuine standalone edition).
  const isPoemSelection = String(selection.type || "").toLowerCase() === "poem";
  const pieceName = selection.pieceTitle || selection.title;
  let passage = body;
  let extraction = { method: "whole-work", confidence: "high", notes: "Whole work after boilerplate strip." };
  let wholeWork = true;
  if (resolution.viaFallback || isPoemSelection) {
    const sliced = extractNamedPiece(body, pieceName, { shortForm: isPoemSelection });
    if (sliced.text) {
      passage = sliced.text;
      extraction = { method: "named-piece", confidence: sliced.confidence, notes: sliced.notes };
      wholeWork = false;
    } else if (isPoemSelection && !resolution.viaFallback) {
      const pieceTokens = significantTokens(pieceName);
      const resolvedTokens = significantTokens(resolution.titleResolved);
      const standalonePoem = pieceTokens.some((t) => resolvedTokens.includes(t));
      if (!standalonePoem) {
        extraction = { method: "named-piece-failed", confidence: "none", notes: sliced.notes };
        wholeWork = false;
      }
    } else {
      extraction = { method: "named-piece-failed", confidence: "none", notes: sliced.notes };
      wholeWork = false;
    }
  }

  // Drop the work's own title page from a whole-work body (a sliced piece never
  // starts with it). Prose is then unwrapped from Gutenberg's hard wrapping
  // into flowing paragraphs; verse instead keeps its line breaks and only loses
  // the common leading indent, so the poem renders with its lineation intact.
  if (wholeWork) {
    passage = stripGutenbergFrontMatter(passage, selection.title);
  }
  passage = isPoemSelection ? dedentLines(passage) : unwrapProse(passage);

  // Never ship a whole book as a stimulus text: cut long bodies to an opening
  // excerpt near the requested length. The excerpt is a contiguous verbatim
  // slice, so it stays auditable against the source URL. For verse the cut is
  // stanza-bounded with no front-matter skipping (short stanzas would look
  // like headings to the prose heuristics).
  let wordCount = countWords(passage);
  let excerpted = false;
  const targetWords = Number(brief.lengthWords) || Number(selection.approxWordCount) || 0;
  if (wordCount > EXCERPT_TRIGGER_WORDS && extraction.confidence !== "none") {
    passage = excerptOpening(passage, targetWords, selection.title, {
      fromChapterStart: wholeWork && !isPoemSelection,
      skipFrontMatter: !isPoemSelection,
    });
    wordCount = countWords(passage);
    excerpted = wordCount > 0;
    if (excerpted) {
      extraction = {
        ...extraction,
        method: `${extraction.method}+opening-excerpt`,
        notes: `${extraction.notes} Cut to an opening excerpt (~${wordCount} words).`,
      };
    }
  }

  const accepted = wordCount > 0 && (extraction.confidence === "high" || extraction.confidence === "medium");
  return {
    ok: accepted,
    source: "Project Gutenberg",
    selection,
    resolution,
    title: selection.title,
    author: selection.author,
    sourceName: resolution.titleResolved,
    sourceUrl: resolution.gutenbergUrl,
    textUrl: resolution.textUrl,
    passage,
    wordCount,
    excerpted,
    confidence: extraction.confidence,
    extraction,
    licenseNote:
      "Public domain in the US via Project Gutenberg. Verify rights for your jurisdiction before distribution.",
    checks: buildChecks({ selection, resolution, bodyText: body, wordCount, brief }),
  };
}

module.exports = {
  DEFAULT_MODEL,
  SELECTION_SCHEMA,
  SELECTION_SYSTEM_PROMPT,
  STIMULUS_PLAN_SCHEMA,
  STIMULUS_PLAN_SYSTEM_PROMPT,
  STIMULUS_VISUAL_SCHEMA,
  MAX_STIMULUS_ITEMS,
  MAX_STIMULUS_VISUALS,
  selectPublicDomainText,
  selectAlternativePublicDomainText,
  planStimulusSelections,
  resolveGutenbergBook,
  fetchPlainText,
  stripGutenbergBoilerplate,
  extractNamedPiece,
  countWords,
  unwrapProse,
  dedentLines,
  stripGutenbergFrontMatter,
  excerptOpening,
  buildChecks,
  sourceGutenbergWork,
};
