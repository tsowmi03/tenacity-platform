"use strict";

// RES-78. English stimuli come from the bank first, as maths diagrams do
// (RES-71). For each text or image the resource needs, the bank is searched
// from the tutor's brief under the RES-77 year rule and a model picks from up
// to four candidates, or none. A slot the bank can't fill goes on to the
// public-domain sources as before.
//
// Bank text is reprinted as stored, under its real credits. The sources are
// used with permission, not public domain, so a bank text never says it is.
//
// Anything that goes wrong here leaves the slot to the next source, so the
// bank can never fail a resource. Each search and pick is saved, so a worker
// that carries a job on sees the same candidates and replays the same calls.

const { createHash } = require("node:crypto");
const { lazyRequire } = require("../shared/lazyRequire");
const { createEmbedder, getStimulus, linkedRecords, searchStimuli } = require("../englishBank/search");
const { isCancellationError } = require("./cancellation");
const { bestVerdict } = require("./imageJudge");
const { providerForModel, sourcePlannerModel } = require("./modelRegistry");

const loadSharp = lazyRequire(() => require("sharp"));
const loadOpenAi = lazyRequire(() => require("openai"));

const CANDIDATES = 4;
// Of the four, this many are held for stimuli pitched near the student, where
// they exist. Most of the bank is Year 11-12, and the year rule lets any high
// school student see it, so nearest-first alone would show mostly exam texts.
const NEAR_YEAR_RESERVED = 2;
const NEAR_YEAR_GAP = 2;
const SEARCH_POOL = 30;
// Firestore's vector search can't pre-filter by type or year, so it is asked
// for many more than are kept. Years 5-6 can't use about seven in ten stimuli.
const SEARCH_CANDIDATES = 400;
const SEARCH_CANDIDATES_PRIMARY = 800;
const SEARCH_TIMEOUT_MS = 20000;
const STORAGE_TIMEOUT_MS = 15000;
const RESTORE_ATTEMPTS = 3;
const RESTORE_RETRY_MS = 1000;
const BRIEF_PROMPT_CHARS = 1500;
const DEFAULT_MAX_WORDS = 800;
const ANNOTATION_MAX_WORDS = 600;
const MIN_POEM_WORDS = 50;
const MIN_PROSE_WORDS = 120;
// Enough of each candidate to judge it without sending whole booklets.
const PICK_TEXT_WORDS = 500;
const MAX_EXAMPLES = 6;
const EXAMPLE_CHARS = 500;
// A smaller crop would print blurred at full page width.
const MIN_IMAGE_LONG_EDGE = 500;

const VISUAL_TYPES = Object.freeze({
  "visual-literacy": ["photograph", "artwork", "cartoon", "advertisement", "poster", "cover"],
  "creative-prompt": ["photograph", "artwork"],
});

const FALLBACK_TITLES = Object.freeze({
  poem: "Poem",
  prose_fiction: "Fiction extract",
  nonfiction: "Non-fiction extract",
  speech: "Speech",
  letter: "Letter",
  drama: "Drama extract",
});

const PICK_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["picks"],
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slot", "choice", "reason"],
        properties: {
          slot: { type: "integer" },
          choice: { type: "integer" },
          reason: { type: "string" },
        },
      },
    },
  },
});

const PICK_SYSTEM_PROMPT = `You choose reading texts for an Australian English tutor's resource, from a bank of past exam papers and workbooks. Each numbered slot is one text the resource needs. Candidates are numbered once across the whole request, and each slot lists the candidates it may use. For each slot, give the number of the candidate that best suits this student and task, or 0 for none.

A candidate is usable only if ALL of these hold:
- It is a text a student reads and responds to: a complete story, poem, article, speech or extract. Not a lesson about reading or writing, teaching notes, an exercise, a list of prescribed texts, exam rubric, a sample answer, or a fragment that stops mid-thought. A text that explains a skill to the student (what details are, how to read a graph) is a lesson.
- It reads cleanly, with no garbled transcription, and does not depend on a picture, graph, table, page or other text that isn't included.
- It is about what the tutor asked for. A text on another subject is not usable, however well written.
- It suits the student's year: nothing graphic, sexual or demeaning, and language and ideas within their reach. A text tagged for older students is fine only if this student can access it.

0 is a good answer: the slot then goes to another source, so never settle for a poor fit.
If the tutor's instructions name a specific work or author, only that work can fill the slot; otherwise answer 0.
Use each candidate at most once across all slots.

For each slot give: slot, choice (a candidate number listed for that slot, or 0), and reason (one short sentence about the candidate you chose).`;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normal = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const isFatal = (err) => isCancellationError(err) || Boolean(err?.resourceControl);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

function studentYear(job) {
  const match = String(job?.year ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

async function withDeadline(work, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the tutor asked for this planned work by name, so the bank should
 * stand aside. The planner has to choose a work the tutor named, so its title
 * or author shows up in the request. A one-word title or a surname alone is
 * too easily an ordinary word ("Alone", "frost"), so a surname must be
 * capitalised as a name and a title must run to two words.
 */
function tutorNamesSelection(job, selection) {
  const prompt = String(job?.customPrompt || "");
  if (!prompt.trim() || !selection) return false;
  const haystack = ` ${normal(prompt)} `;
  for (const title of [selection.pieceTitle, selection.title]) {
    const wanted = normal(title);
    if (wanted.split(" ").length >= 2 && haystack.includes(` ${wanted} `)) return true;
  }
  const author = clean(selection.author);
  if (!author) return false;
  if (haystack.includes(` ${normal(author)} `)) return true;
  const surname = author.split(" ").pop();
  return surname.length >= 4 && new RegExp(`\\b${surname.replace(/[^\p{L}'-]/gu, "")}\\b`, "u").test(prompt);
}

function bankTypesFor(selection, job) {
  const kind = String(selection?.type || "").toLowerCase();
  if (kind.includes("poem") && kind.includes("story")) return ["poem", "prose_fiction"];
  if (kind === "poem") return ["poem"];
  if (kind === "nonfiction") return ["nonfiction", "speech", "letter"];
  return /\b(drama|play|playscript|script)\b/i.test(job?.customPrompt || "") ? ["prose_fiction", "drama"] : ["prose_fiction"];
}

function textSlot({ job, selection, index, maxWords }) {
  const types = bankTypesFor(selection, job);
  const themes = Array.isArray(selection?.themes) ? selection.themes.filter(Boolean).join(", ") : "";
  return {
    kind: "text",
    index,
    number: index + 1,
    selection,
    label: types.map((type) => type.replace(/_/g, " ")).join(" or "),
    filters: {
      medium: "written",
      type: types,
      studentYear: studentYear(job),
      minWords: types.length === 1 && types[0] === "poem" ? MIN_POEM_WORDS : MIN_PROSE_WORDS,
      maxWords: Number(maxWords) > 0 ? Number(maxWords) : DEFAULT_MAX_WORDS,
    },
    brief: [
      `${types.join(" or ").replace(/_/g, " ")} for a Year ${job.year} student`,
      themes ? `Themes: ${themes}` : "",
      String(job.customPrompt || "").slice(0, BRIEF_PROMPT_CHARS),
    ].filter(Boolean).join("\n"),
  };
}

function imageSlot({ job, selection, index }) {
  return {
    kind: "image",
    index,
    number: index + 1,
    selection,
    filters: {
      medium: "visual",
      type: VISUAL_TYPES[selection?.purpose] || VISUAL_TYPES["visual-literacy"],
      studentYear: studentYear(job),
    },
    brief: [
      selection?.searchTerms,
      selection?.task,
      String(job.customPrompt || "").slice(0, BRIEF_PROMPT_CHARS),
    ].filter(Boolean).join("\n"),
  };
}

function isNearYear(stimulus, year) {
  if (!Number.isFinite(year)) return false;
  return (stimulus.years || []).some((value) => Number.isFinite(value) && Math.abs(value - year) <= NEAR_YEAR_GAP);
}

// A workbook's explanation of a skill, a list of set texts, or a text that
// points at a page or graph the student won't have.
const NOT_A_READING_TEXT = /\bprescribed texts?\b|[—–-]\s*introduction\s*$/i;
const DEPENDS_ON_MISSING = /\b(?:see|on) p(?:age|\.)?\s*\d+|\b(?:these|this|the following|above|below) (?:graphs?|charts?|tables?|diagrams?|pictures?|illustrations?|maps?)\b/i;

function usableStimulus(stimulus) {
  if (stimulus.medium === "visual") return stimulus.pageCrops?.length === 1 && Boolean(stimulus.pageCrops[0].storagePath);
  return Boolean(clean(stimulus.text)) && !NOT_A_READING_TEXT.test(stimulus.title || "") && !DEPENDS_ON_MISSING.test(stimulus.text);
}

// The same passage turns up in more than one paper; it is shown once.
function sameTextKey(stimulus) {
  return stimulus.medium === "visual" ? stimulus.id : normal(stimulus.text).split(" ").slice(0, 12).join(" ");
}

/** Up to four candidates, nearest the brief, with two held for the student's own level. */
function shortlist(found, year, size = CANDIDATES) {
  const seen = new Set();
  const unique = (found || []).filter((stimulus) => {
    if (!usableStimulus(stimulus)) return false;
    const key = sameTextKey(stimulus);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const near = unique.filter((stimulus) => isNearYear(stimulus, year)).slice(0, NEAR_YEAR_RESERVED);
  const rest = unique.filter((stimulus) => !near.includes(stimulus)).slice(0, size - near.length);
  return [...near, ...rest];
}

function savedStimulus(stimulus) {
  const out = {};
  for (const field of ["id", "medium", "type", "title", "author", "publication", "sourcePath", "text", "wordCount", "visualDescription", "pageCrops", "themes", "years"]) {
    if (stimulus[field] !== undefined) out[field] = stimulus[field];
  }
  return out;
}

function jsonFile(bucket, name) {
  const file = bucket.file(name);
  return {
    load: async () => {
      try {
        const [bytes] = await withDeadline(file.download(), STORAGE_TIMEOUT_MS);
        return JSON.parse(bytes.toString("utf8")) || {};
      } catch {
        return {};
      }
    },
    save: async (value) => {
      try {
        await withDeadline(file.save(JSON.stringify(value), { resumable: false, metadata: { contentType: "application/json" } }), STORAGE_TIMEOUT_MS);
      } catch {
        // A lost save only costs a repeat search.
      }
    },
  };
}

const slotKey = (slot) => hash([slot.kind, slot.brief, slot.filters]);
const pickedFile = (bucket, job) => jsonFile(bucket, `resources/checkpoints/${job.jobId}/english-bank-picked.json`);

async function searchSlots({ job, slots, bank, embed }) {
  const store = jsonFile(bank.bucket, `resources/checkpoints/${job.jobId}/english-bank-search-${hash([job.year, slots.map(slotKey)])}.json`);
  const saved = await store.load();
  const searched = saved.searched || {};
  let changed = false;
  const year = studentYear(job);
  for (const slot of slots) {
    const key = slotKey(slot);
    if (!searched[key]) {
      try {
        const found = await withDeadline(searchStimuli({
          db: bank.db,
          embed,
          brief: slot.brief,
          filters: slot.filters,
          limit: SEARCH_POOL,
          candidates: year !== null && year <= 6 ? SEARCH_CANDIDATES_PRIMARY : SEARCH_CANDIDATES,
        }), SEARCH_TIMEOUT_MS);
        searched[key] = { candidates: shortlist(found, year).map(savedStimulus) };
      } catch (err) {
        if (isFatal(err)) throw err;
        searched[key] = { candidates: [], failed: clean(err?.message || err).slice(0, 120) || "search failed" };
      }
      changed = true;
    }
    slot.candidates = searched[key].candidates;
    slot.searchFailed = searched[key].failed || null;
  }
  if (changed) await store.save({ searched });
}

function candidateText(stimulus) {
  const words = String(stimulus.text || "").split(/(\s+)/);
  const limit = PICK_TEXT_WORDS * 2;
  return words.length > limit ? `${words.slice(0, limit).join("").trim()} [... continues]` : String(stimulus.text || "").trim();
}

// Slots often share candidates, and numbers restarting in each slot let the
// model answer from the wrong list. Each candidate is listed once, under one
// number for the whole request.
function numberCandidates(slots) {
  const pool = [];
  const numberFor = new Map();
  for (const slot of slots) {
    slot.choices = slot.candidates.map((stimulus) => {
      const key = sameTextKey(stimulus);
      if (!numberFor.has(key)) {
        pool.push(stimulus);
        numberFor.set(key, pool.length);
      }
      return numberFor.get(key);
    });
  }
  return pool;
}

function pickMessage(job, slots, pool) {
  const wanted = slots.map((slot) => `SLOT ${slot.number}: a ${slot.label}. May use candidates ${slot.choices.join(", ")}.`).join("\n");
  const candidates = pool.map((stimulus, index) => [
    `CANDIDATE ${index + 1}: ${stimulus.type || "text"}${clean(stimulus.title) ? `, "${clean(stimulus.title)}"` : ""}${clean(stimulus.author) ? ` by ${clean(stimulus.author)}` : ""}; ${stimulus.years?.length ? `tagged Year ${stimulus.years.join(", ")}` : "no year tag"}; ${stimulus.wordCount || "?"} words`,
    candidateText(stimulus),
  ].join("\n")).join("\n\n=====\n\n");
  return [
    `Student: Year ${job.year}`,
    `Resource: ${String(job.resourceType || "").replace(/-/g, " ")}`,
    `Tutor instructions: ${job.customPrompt || "(none given)"}`,
    "",
    wanted,
    "",
    candidates,
    "",
    `Answer for all ${slots.length} slots.`,
  ].join("\n");
}

async function pickTexts({ job, slots, pool, callAi, anthropicApiKey, openaiApiKey, signal }) {
  const request = () => callAi({
    anthropicApiKey,
    openaiApiKey,
    model: sourcePlannerModel(),
    maxTokens: 2000,
    thinkingDisabled: true,
    mathBearing: false,
    systemPrompt: PICK_SYSTEM_PROMPT,
    userMessage: pickMessage(job, slots, pool),
    responseSchema: PICK_SCHEMA,
    signal,
    bestEffort: true,
    stageId: "sourcing.bank.texts",
    stageLabel: "Choosing reading texts",
    progressPhase: "plan",
  });
  try {
    return await request();
  } catch (err) {
    if (err?.refusal !== true) throw err;
    return request();
  }
}

/** Where a bank text came from, as printed: its publication, else the paper or book it was taken from. */
function fileLabel(sourcePath) {
  const base = String(sourcePath || "").split("/").pop().replace(/\.[a-z0-9]{2,5}$/i, "");
  const name = base
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/^\d{10,13}[_ -]*/, "")
    .replace(/\s*\(\d+\)\s*$/, "");
  // A name with no spaces uses hyphens or underscores as spaces. A range such
  // as 7-10 keeps its hyphen.
  const spaced = /\s/.test(name) ? name : name.replace(/(?<!\d)-|-(?!\d)/g, " ");
  const label = clean(spaced.replace(/_+/g, " "));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function sourceLabel(stimulus) {
  return clean(stimulus.publication) || fileLabel(stimulus.sourcePath);
}

const PAPER_LABEL = /^(?:text|item|source|stimulus|passage|section)\s+(?:\d+|[ivxlc]+|[a-z]|one|two|three|four|five|six)\b/i;

// "Text 3 - Memoir" is the paper's own numbering, and a workbook files its
// passages under the skill they practise ("Finding Facts — What a Waste!").
function displayTitle(stimulus) {
  let title = clean(stimulus.title).replace(new RegExp(`${PAPER_LABEL.source}\\s*[—–:-]+\\s*`, "i"), "");
  if (!/past papers/i.test(stimulus.sourcePath || "")) {
    const parts = title.split(/\s+[—–-]\s+/);
    if (parts.length > 1) title = parts.slice(1).join(" - ");
    title = title.replace(/^\d+[.)]\s*/, "");
  }
  if (title && !new RegExp(`${PAPER_LABEL.source}\\s*$|^(?:text|item|source|stimulus|passage|extract)$`, "i").test(title)) return title;
  return FALLBACK_TITLES[stimulus.type] || "Extract";
}

// Labels from the paper it was printed in, and a headline that repeats the
// title printed above the text, are not part of the text.
function withoutLeadingLabels(text, stimulus) {
  const titles = [normal(stimulus.title), normal(displayTitle(stimulus))].filter(Boolean);
  let body = text;
  for (let i = 0; i < 2; i += 1) {
    const [first, ...rest] = body.split("\n");
    const line = clean(first);
    const label = PAPER_LABEL.test(line) && line.split(" ").length <= 10 && !/[.!?]$/.test(line);
    if (!rest.join("").trim() || !(label || titles.includes(normal(line)))) break;
    body = rest.join("\n").trim();
  }
  return body;
}

// Passages joined across pages keep a line break where the page turned. In
// prose that would print as a break mid-sentence. Spacing only: every word
// stays as stored. Verse and script keep their lines.
function passageFor(stimulus) {
  const text = withoutLeadingLabels(String(stimulus.text || "").trim(), stimulus);
  if (stimulus.type === "poem" || stimulus.type === "drama") return text;
  return text.replace(/([^\n.!?:"'”’)])\n(?=[a-z])/g, "$1 ");
}

function selectionFor(stimulus, title) {
  return {
    title,
    author: clean(stimulus.author),
    type: stimulus.type === "poem" ? "poem" : stimulus.type === "prose_fiction" ? "short-story" : "nonfiction",
    pieceTitle: title,
    approxWordCount: Number(stimulus.wordCount) || 0,
    themes: Array.isArray(stimulus.themes) ? stimulus.themes.slice(0, 8) : [],
    bankStimulusId: stimulus.id,
  };
}

function sourcedText(stimulus, examples = []) {
  const title = displayTitle(stimulus);
  return {
    ok: true,
    bank: true,
    bankStimulusId: stimulus.id,
    source: sourceLabel(stimulus),
    sourceName: null,
    title,
    author: clean(stimulus.author),
    passage: passageFor(stimulus),
    wordCount: Number(stimulus.wordCount) || 0,
    excerpted: false,
    selection: selectionFor(stimulus, title),
    bankExamples: examples,
  };
}

function exampleFor(question) {
  const guide = (question.guide || []).map((entry) => clean(entry.criteria || entry.sampleAnswer)).filter(Boolean).join(" ");
  return {
    text: clean(question.text).slice(0, EXAMPLE_CHARS),
    marks: question.marks ?? null,
    guide: guide.slice(0, EXAMPLE_CHARS),
  };
}

/** The bank's own questions on each stimulus, those with a marking guide first. */
async function examplesFor(db, ids) {
  if (!ids.length) return {};
  try {
    const { questionsByStimulus, guidesByQuestion } = await withDeadline(linkedRecords(db, ids), SEARCH_TIMEOUT_MS);
    const out = {};
    for (const id of ids) {
      const questions = (questionsByStimulus.get(id) || []).map((question) => ({ ...question, guide: guidesByQuestion.get(question.id) || [] }));
      const withGuide = questions.filter((question) => question.guide.length);
      const without = questions.filter((question) => !question.guide.length);
      out[id] = [...withGuide, ...without].filter((question) => clean(question.text)).slice(0, MAX_EXAMPLES).map(exampleFor);
    }
    return out;
  } catch (err) {
    if (isFatal(err)) throw err;
    return {};
  }
}

async function cropFor(bucket, stimulus) {
  const [buffer] = await withDeadline(bucket.file(stimulus.pageCrops[0].storagePath).download(), STORAGE_TIMEOUT_MS);
  const meta = await loadSharp()(buffer).metadata();
  return { buffer, type: "png", width: meta.width, height: meta.height };
}

function sourcedVisual(stimulus, image, selection, verdict = {}) {
  return {
    ok: true,
    bank: true,
    bankStimulusId: stimulus.id,
    source: sourceLabel(stimulus),
    sourceName: null,
    title: clean(verdict.title) || displayTitle(stimulus),
    creator: clean(stimulus.author),
    date: null,
    description: clean(verdict.description) || clean(stimulus.visualDescription),
    licence: null,
    licenceUrl: null,
    cluster: stimulus.id,
    image,
    judged: Boolean(verdict.title || verdict.description),
    selection: { ...selection, bankStimulusId: stimulus.id },
  };
}

function usedEntry(slot, stimulus, reason) {
  return {
    kind: slot.kind,
    slot: slot.number,
    stimulusId: stimulus.id,
    title: displayTitle(stimulus),
    author: clean(stimulus.author),
    source: sourceLabel(stimulus),
    sourcePath: stimulus.sourcePath || "",
    wordCount: Number(stimulus.wordCount) || 0,
    reason: clean(reason).slice(0, 200),
  };
}

async function pickImage({ slot, bank, judge, exclude }) {
  const candidates = slot.candidates.filter((stimulus) => !exclude.has(stimulus.id));
  if (!candidates.length) return { reason: "no_candidates" };
  const loaded = [];
  for (const stimulus of candidates) {
    try {
      const image = await cropFor(bank.bucket, stimulus);
      if (Math.max(image.width || 0, image.height || 0) >= MIN_IMAGE_LONG_EDGE) loaded.push({ stimulus, image, buffer: image.buffer });
    } catch (err) {
      if (isFatal(err)) throw err;
    }
  }
  if (!loaded.length) return { reason: "no_candidates" };
  let verdicts;
  try {
    verdicts = await judge({ images: loaded, purpose: slot.selection?.purpose, task: slot.selection?.task });
  } catch (err) {
    if (isFatal(err)) throw err;
    return { reason: "pick_failed" };
  }
  const best = bestVerdict(verdicts);
  if (!best) return { reason: "none_suitable" };
  return { ...loaded[best.index - 1], verdict: best };
}

// A hand-off must not lose a stimulus to a brief storage or Firestore error.
async function withRetries(work) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      if (isFatal(err) || attempt >= RESTORE_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, RESTORE_RETRY_MS * attempt));
    }
  }
}

async function restoreFromBank({ job, plannedTexts, plannedVisuals, bank }) {
  const out = { texts: new Map(), visuals: new Map(), usage: job.stimulusBankUsage || null };
  const needed = [...plannedTexts, ...plannedVisuals].some((selection) => selection?.bankStimulusId);
  if (!needed) return out;
  const saved = await pickedFile(bank.bucket, job).load();
  const stimulusFor = (id) => saved.stimuli?.[id] || withDeadline(getStimulus(bank.db, id), SEARCH_TIMEOUT_MS);
  // The record must say what the resource actually carries.
  const lost = (kind, index, stimulusId) => {
    const usage = out.usage || { used: [], fallbacks: [] };
    out.usage = {
      ...usage,
      used: usage.used.filter((entry) => entry.stimulusId !== stimulusId),
      fallbacks: [...usage.fallbacks, { kind, slot: index + 1, reason: "bank_unavailable" }],
    };
  };
  for (const [index, selection] of plannedTexts.entries()) {
    const id = selection?.bankStimulusId;
    if (!id) continue;
    try {
      const restored = await withRetries(async () => {
        const stimulus = await stimulusFor(id);
        if (!stimulus?.text) return null;
        const examples = saved.examples?.[stimulus.id] || (await examplesFor(bank.db, [stimulus.id]))[stimulus.id] || [];
        return sourcedText(stimulus, examples);
      });
      if (restored) out.texts.set(index, restored);
      else lost("text", index, id);
    } catch (err) {
      if (isFatal(err)) throw err;
      lost("text", index, id);
    }
  }
  for (const [index, selection] of plannedVisuals.entries()) {
    const id = selection?.bankStimulusId;
    if (!id) continue;
    try {
      const restored = await withRetries(async () => {
        const stimulus = await stimulusFor(id);
        if (!stimulus?.pageCrops?.length) return null;
        return sourcedVisual(stimulus, await cropFor(bank.bucket, stimulus), selection, saved.verdicts?.[stimulus.id]);
      });
      if (restored) out.visuals.set(index, restored);
      else lost("image", index, id);
    } catch (err) {
      if (isFatal(err)) throw err;
      lost("image", index, id);
    }
  }
  return out;
}

/**
 * Fill as many planned texts and images as the bank can. Returns
 * { texts, visuals, usage }: maps from the plan's index to a sourced item in
 * the shape the public-domain sources return, and the record for the job.
 * `persisted` means this job has already decided: a slot keeps the bank
 * stimulus it chose, and any other slot does not try the bank again.
 */
async function sourceSetFromBank({
  job,
  plannedTexts = [],
  plannedVisuals = [],
  persisted = false,
  maxWords = null,
  bank,
  callAi,
  anthropicApiKey,
  openaiApiKey,
  signal,
  judge = null,
}) {
  const out = { texts: new Map(), visuals: new Map(), usage: null };
  if (!bank?.db || !bank?.bucket || typeof callAi !== "function") return out;
  if (persisted) return restoreFromBank({ job, plannedTexts, plannedVisuals, bank });

  const usage = { used: [], fallbacks: [] };
  out.usage = usage;
  const fallback = (slot, reason) => usage.fallbacks.push({ kind: slot.kind, slot: slot.number, reason });

  const allText = plannedTexts.map((selection, index) => textSlot({ job, selection, index, maxWords }));
  const imageSlots = plannedVisuals.map((selection, index) => imageSlot({ job, selection, index }));
  const textSlots = allText.filter((slot) => {
    if (!tutorNamesSelection(job, slot.selection)) return true;
    fallback(slot, "named_text");
    return false;
  });
  const slots = [...textSlots, ...imageSlots];
  if (!slots.length) return out;

  let embed = bank.embed;
  if (!embed && openaiApiKey) {
    const OpenAI = loadOpenAi().default;
    embed = createEmbedder({ client: new OpenAI({ apiKey: openaiApiKey }) });
  }
  if (!embed) {
    slots.forEach((slot) => fallback(slot, "bank_unavailable"));
    return out;
  }

  try {
    await searchSlots({ job, slots, bank, embed });
  } catch (err) {
    if (isFatal(err)) throw err;
    slots.forEach((slot) => fallback(slot, "search_failed"));
    return out;
  }

  const store = pickedFile(bank.bucket, job);
  const picked = await store.load();
  picked.stimuli = picked.stimuli || {};
  picked.examples = picked.examples || {};
  picked.verdicts = picked.verdicts || {};

  const openText = textSlots.filter((slot) => {
    if (slot.candidates.length) return true;
    fallback(slot, slot.searchFailed ? "search_failed" : "no_candidates");
    return false;
  });
  if (openText.length) {
    const pool = numberCandidates(openText);
    let picks = null;
    try {
      const result = await pickTexts({ job, slots: openText, pool, callAi, anthropicApiKey, openaiApiKey, signal });
      picks = result?.parsed?.picks || [];
      // Saved with the record, so a later worker that doesn't repeat the pick
      // still counts its tokens.
      if (result?.usage) usage.aiUsage = { provider: result.provider || providerForModel(sourcePlannerModel()), usage: result.usage };
    } catch (err) {
      if (isFatal(err)) throw err;
      openText.forEach((slot) => fallback(slot, "pick_failed"));
    }
    if (picks) {
      const taken = new Set();
      const chosen = [];
      for (const slot of openText) {
        const pick = picks.find((entry) => Number(entry?.slot) === slot.number);
        const choice = Number(pick?.choice);
        const stimulus = slot.choices.includes(choice) ? pool[choice - 1] : null;
        if (!stimulus || taken.has(sameTextKey(stimulus))) {
          fallback(slot, "none_suitable");
          continue;
        }
        taken.add(sameTextKey(stimulus));
        chosen.push({ slot, stimulus, reason: pick.reason });
      }
      const ids = chosen.map(({ stimulus }) => stimulus.id);
      const missing = ids.filter((id) => !picked.examples[id]);
      Object.assign(picked.examples, await examplesFor(bank.db, missing));
      for (const { slot, stimulus, reason } of chosen) {
        picked.stimuli[stimulus.id] = stimulus;
        out.texts.set(slot.index, sourcedText(stimulus, picked.examples[stimulus.id] || []));
        usage.used.push(usedEntry(slot, stimulus, reason));
      }
    }
  }

  const takenImages = new Set();
  for (const slot of imageSlots) {
    if (!judge) {
      fallback(slot, "bank_unavailable");
      continue;
    }
    if (!slot.candidates.length) {
      fallback(slot, slot.searchFailed ? "search_failed" : "no_candidates");
      continue;
    }
    const result = await pickImage({ slot, bank, judge, exclude: takenImages });
    if (!result.stimulus) {
      fallback(slot, result.reason);
      continue;
    }
    takenImages.add(result.stimulus.id);
    picked.stimuli[result.stimulus.id] = result.stimulus;
    picked.verdicts[result.stimulus.id] = { title: result.verdict.title, description: result.verdict.description };
    out.visuals.set(slot.index, sourcedVisual(result.stimulus, result.image, slot.selection, result.verdict));
    usage.used.push(usedEntry(slot, result.stimulus, result.verdict.reason));
  }

  if (usage.used.length) await store.save(picked);
  return out;
}

/** The one-passage path (annotation tasks). */
async function sourcePassageFromBank({ job, bank, callAi, anthropicApiKey, openaiApiKey, signal }) {
  const preset = Array.isArray(job.sourceSelections) ? job.sourceSelections[0] : null;
  const result = await sourceSetFromBank({
    job,
    plannedTexts: [preset || { type: "poem or short story" }],
    persisted: Boolean(preset),
    maxWords: ANNOTATION_MAX_WORDS,
    bank,
    callAi,
    anthropicApiKey,
    openaiApiKey,
    signal,
  });
  return { sourced: result.texts.get(0) || null, usage: result.usage };
}

module.exports = {
  ANNOTATION_MAX_WORDS,
  bankTypesFor,
  displayTitle,
  fileLabel,
  isNearYear,
  passageFor,
  shortlist,
  sourceLabel,
  sourcePassageFromBank,
  sourceSetFromBank,
  tutorNamesSelection,
};
