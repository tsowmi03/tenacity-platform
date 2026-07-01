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

const { callAnthropicForResource } = require("./apiClient");

const GUTENDEX_BASE = "https://gutendex.com/books";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const FETCH_TIMEOUT_MS = 20000;

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
  "type": "poem" | "short-story",
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
  model = DEFAULT_MODEL,
  brief,
  callAi = callAnthropicForResource,
}) {
  if (!apiKey) throw new TypeError("selectPublicDomainText requires apiKey");
  if (!brief) throw new TypeError("selectPublicDomainText requires brief");

  const userMessage = [
    "Select one public-domain work for this brief:",
    `- Year level: ${brief.year}`,
    `- Text type: ${brief.textType}`,
    `- Approx length (words): ${brief.lengthWords}`,
    `- Skill focus: ${brief.skillFocus}`,
    brief.theme ? `- Theme: ${brief.theme}` : null,
    "",
    "Respond with the JSON object only.",
  ]
    .filter(Boolean)
    .join("\n");

  // Reuse the resource API client. English content is prose, so disable the
  // maths-oriented backslash repair when parsing the JSON.
  const { parsed } = await callAi({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt: SELECTION_SYSTEM_PROMPT,
    userMessage,
    mathBearing: false,
  });
  return parsed;
}

// A resource can carry at most this many stimulus texts, so an over-eager plan
// cannot balloon a generation.
const MAX_STIMULUS_TEXTS = 3;

const STIMULUS_PLAN_SYSTEM_PROMPT = `You are a literature curator for an English tutoring service. You decide whether a resource needs the student to READ one or more provided texts, and if so you select REAL, existing, public-domain works for it. You never invent or paraphrase texts.

STEP 1 — Decide if a reading stimulus is needed. It IS needed when the resource asks the student to read provided text(s) and respond — comprehension, close reading, analysis, an unseen-text task, or the reading section of a paper. It is NOT needed for purely skills-based work — grammar, punctuation, spelling, vocabulary, essay-writing technique with no set text, or generic writing practice. If no stimulus is needed, return { "needed": false, "texts": [] } and nothing else.

STEP 2 — If needed, choose the number and KINDS of texts that fit the request. Honour the tutor's instructions: poetry → poems; short stories → prose fiction; informational / non-fiction / persuasive texts → essays, speeches or articles; a mix → a suitable mix. A short comprehension usually needs 1 text; a practice-paper reading section often 2-3. Never exceed 3.

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
  ]
}`;

/**
 * Demand-driven stimulus planning. In a single cheap model call, decide whether
 * a resource needs reading text(s) and — only when it does — curate the specific
 * public-domain works to source (kind + count chosen to fit the tutor's request,
 * e.g. poems for a poetry paper, a mix for a general "growing up" paper). Returns
 * { needed, texts } where each text is a selection object ready to fetch. When no
 * stimulus is needed the caller fetches nothing.
 */
async function planStimulusSelections({
  apiKey,
  model = DEFAULT_MODEL,
  job,
  callAi = callAnthropicForResource,
  signal,
}) {
  if (!apiKey) throw new TypeError("planStimulusSelections requires apiKey");
  if (!job) throw new TypeError("planStimulusSelections requires job");

  const userMessage = [
    "Plan the reading stimulus (if any) for this resource:",
    `- Resource type: ${String(job.resourceType || "").replace(/-/g, " ")}`,
    `- Year level: ${job.year}`,
    job.customPrompt
      ? `- Tutor instructions: ${job.customPrompt}`
      : "- Tutor instructions: (none given — infer a suitable general reading resource)",
    "",
    "Respond with the JSON object only.",
  ].join("\n");

  const { parsed } = await callAi({
    apiKey,
    model,
    maxTokens: 1024,
    systemPrompt: STIMULUS_PLAN_SYSTEM_PROMPT,
    userMessage,
    mathBearing: false,
    signal,
  });

  const texts = Array.isArray(parsed?.texts)
    ? parsed.texts
        .filter((text) => text && text.title && text.author && text.type)
        .slice(0, MAX_STIMULUS_TEXTS)
    : [];
  return { needed: Boolean(parsed?.needed) && texts.length > 0, texts };
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
  try {
    const res = await fetchWithTimeout(url, { accept: "application/json" });
    const data = await res.json();
    considered.push({ query, resultCount: (data.results || []).length });
    return data;
  } catch (err) {
    considered.push({ query, error: err.message });
    return null;
  }
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
 * precise title+author queries first (these nail standalone works cleanly), and
 * fall back to an author-only search that prefers collection-looking titles —
 * the named piece is then sliced out downstream. `viaFallback` tells the caller
 * which path won, so it knows whether to extract a piece or use the whole work.
 */
async function resolveGutenbergBook({ title, author, queries, allowAuthorFallback = true }) {
  const wantSurname = surnameOf(author);
  const wantTitleTokens = significantTokens(title);
  const considered = [];

  const scoreBook = (book) => {
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
      titleOverlap: wantTitleTokens.filter((t) => resultTokens.includes(t)).length,
      downloads: book.download_count || 0,
    };
  };

  // Precise pass: a confident standalone match needs the author AND at least one
  // title token, so we don't grab an unrelated work by the same author.
  for (const query of queries || []) {
    const data = await searchGutendex(query, considered);
    if (!data) continue;
    const scored = (data.results || [])
      .map(scoreBook)
      .filter((b) => b && b.authorMatch && b.titleOverlap >= 1)
      .sort((a, b) => b.titleOverlap - a.titleOverlap || b.downloads - a.downloads);
    if (scored.length) return makeMatch(scored[0], query, false, considered);
  }

  // Fallback pass: author-only, preferring collections we can slice a piece from.
  if (allowAuthorFallback && author) {
    const data = await searchGutendex(author, considered);
    if (data) {
      const scored = (data.results || [])
        .map(scoreBook)
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
 * longest result, which skips the short TOC entries. Heuristic and deliberately
 * conservative about confidence: this is the weak link the spike exists to
 * expose (and why poems are better sourced from Wikisource than Gutenberg).
 */
function extractNamedPiece(body, pieceTitle) {
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
    const slice = sliceFromHeading(lines, idx);
    if (countWords(slice) > countWords(best)) best = slice;
  }

  const words = countWords(best);
  const confidence = words >= 120 ? "medium" : words >= 40 ? "low" : "none";
  const ambiguity =
    matches.length > 1
      ? `${matches.length} headings matched (likely TOC + body); kept the longest slice. `
      : "";
  return {
    text: words >= 40 ? best : null,
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
    queries.push([selection.pieceTitle, selection.author].filter(Boolean).join(" "));
  }
  queries.push([selection.title, selection.author].filter(Boolean).join(" "));
  if (selection.collectionHint) {
    queries.push([selection.collectionHint, selection.author].filter(Boolean).join(" "));
  }

  const resolution = await resolveGutenbergBook({
    title: selection.title,
    author: selection.author,
    queries: [...new Set(queries)],
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
  let passage = body;
  let extraction = { method: "whole-work", confidence: "high", notes: "Whole work after boilerplate strip." };
  if (resolution.viaFallback) {
    const sliced = extractNamedPiece(body, selection.pieceTitle || selection.title);
    if (sliced.text) {
      passage = sliced.text;
      extraction = { method: "named-piece", confidence: sliced.confidence, notes: sliced.notes };
    } else {
      passage = body;
      extraction = { method: "named-piece-failed", confidence: "none", notes: sliced.notes };
    }
  }

  // Drop the work's own title page from a whole-work body (a sliced piece never
  // starts with it), then unwrap Gutenberg's hard wrapping into flowing
  // paragraphs so the passage renders as prose, not a ragged column.
  if (!resolution.viaFallback) {
    passage = stripGutenbergFrontMatter(passage, selection.title);
  }
  passage = unwrapProse(passage);
  const wordCount = countWords(passage);
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
    confidence: extraction.confidence,
    extraction,
    licenseNote:
      "Public domain in the US via Project Gutenberg. Verify rights for your jurisdiction before distribution.",
    checks: buildChecks({ selection, resolution, bodyText: body, wordCount, brief }),
  };
}

module.exports = {
  SELECTION_SYSTEM_PROMPT,
  STIMULUS_PLAN_SYSTEM_PROMPT,
  selectPublicDomainText,
  planStimulusSelections,
  resolveGutenbergBook,
  fetchPlainText,
  stripGutenbergBoilerplate,
  extractNamedPiece,
  countWords,
  unwrapProse,
  stripGutenbergFrontMatter,
  buildChecks,
  sourceGutenbergWork,
};
