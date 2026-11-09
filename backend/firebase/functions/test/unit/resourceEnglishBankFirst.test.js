"use strict";

// RES-78. English stimuli come from the bank first, reprinted as stored, and
// any problem leaves the slot to the public-domain sources.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const { applySourcedStimulus, maybeSourceStimulusSet } = require("../../src/resources");
const { normaliseStimulusAttribution, textSourceLine } = require("../../src/resources/stimulusIntegrity");
const { buildUserMessage } = require("../../src/resources/promptBuilder");
const {
  displayTitle, fileLabel, passageFor, shortlist, sourceLabel, sourcePassageFromBank, sourceSetFromBank, tutorNamesSelection,
} = require("../../src/resources/englishBankSourcing");

const prose = (id, extra = {}) => ({
  id, status: "live", medium: "written", type: "prose_fiction", title: `Story ${id}`, author: "A. Writer", publication: "A Book",
  sourcePath: "English/Past Papers/Year 12/James Ruse 2023 P2.pdf", wordCount: 300, years: [12],
  text: `${id} opens here. The tide came in slowly and nobody on the shore looked up from their work at all that day.`, ...extra,
});

function fakeDb({ stimuli = [], questions = [], guides = [] } = {}) {
  const calls = { nearest: 0, get: 0 };
  const docOf = (record) => ({ id: record.id, exists: true, data: () => ({ ...record }) });
  return {
    calls,
    collection(name) {
      const filters = [];
      const records = () => ({ englishStimuli: stimuli, englishQuestions: questions, englishGuides: guides }[name] || []);
      const query = {
        where(field, op, value) { filters.push([field, op, value]); return query; },
        findNearest() { calls.nearest += 1; return query; },
        select() { return query; },
        limit() { return query; },
        doc(id) {
          return { get: async () => { calls.get += 1; const hit = records().find((r) => r.id === id); return hit ? docOf(hit) : { exists: false }; } };
        },
        async get() {
          const hit = records().filter((record) => filters.every(([field, op, value]) => {
            if (op === "==") return record[field] === value;
            if (op === "in") return value.includes(record[field]);
            if (op === "array-contains") return (record[field] || []).includes(value);
            return true;
          }));
          return { docs: hit.map(docOf) };
        },
      };
      return query;
    },
  };
}

function fakeBucket(files = {}) {
  const store = new Map(Object.entries(files));
  return {
    store,
    file: (name) => ({
      download: async () => {
        if (!store.has(name)) throw Object.assign(new Error("missing"), { code: 404 });
        return [store.get(name)];
      },
      save: async (bytes) => { store.set(name, Buffer.from(bytes)); },
    }),
  };
}

const embed = async () => [[0.1, 0.2]];
const picksAll = (choice = 1) => async (request) => ({
  parsed: { picks: [...request.userMessage.matchAll(/^SLOT (\d+):/gm)].map((m) => ({ slot: Number(m[1]), choice, reason: "fits" })) },
});
const job = (extra = {}) => ({ jobId: "j1", year: 8, resourceType: "practice-paper", subject: "english", customPrompt: "A paper on the sea.", ...extra });
const planned = (extra = {}) => ({ title: "Moby Dick", author: "Herman Melville", type: "short-story", themes: ["sea"], ...extra });

function run({ stimuli = [prose("a")], callAi = picksAll(), plannedTexts = [planned()], ...rest } = {}) {
  const db = fakeDb({ stimuli, ...rest.records });
  const bank = { db, bucket: rest.bucket || fakeBucket(), embed };
  return sourceSetFromBank({ job: job(rest.job), plannedTexts, plannedVisuals: rest.plannedVisuals || [], persisted: rest.persisted, maxWords: rest.maxWords, bank, callAi, judge: rest.judge })
    .then((result) => ({ ...result, db, bank }));
}

describe("choosing candidates (RES-78)", () => {
  it("holds two of the four for stimuli near the student's year", () => {
    const found = [prose("a"), prose("b"), prose("c"), prose("d"), prose("e", { years: [8] }), prose("f", { years: [9] }), prose("g", { years: [7] })];
    assert.deepEqual(shortlist(found, 8).map((s) => s.id), ["e", "f", "a", "b"]);
  });

  it("leaves out workbook lessons and texts pointing at something the student won't have", () => {
    const out = shortlist([
      prose("a", { title: "Understanding Graphs — Introduction" }),
      prose("b", { text: "Charts and tables (see p. 55) need careful reading before you answer anything about them." }),
      prose("c", { text: "These graphs show how the land is cared for in each state and territory of the country." }),
      prose("d"),
    ], 8);
    assert.deepEqual(out.map((s) => s.id), ["d"]);
  });

  it("takes the nearest four when nothing is near the student", () => {
    assert.deepEqual(shortlist(["a", "b", "c", "d", "e"].map((id) => prose(id)), 8).map((s) => s.id), ["a", "b", "c", "d"]);
  });

  it("shows a passage printed in two papers once, and never a list of prescribed texts", () => {
    const same = "The very same opening words of this passage run on for at least twelve words or more here.";
    const out = shortlist([prose("a", { text: same }), prose("b", { text: same }), prose("c", { title: "The prescribed texts for Section I" }), prose("d")], 8);
    assert.deepEqual(out.map((s) => s.id), ["a", "d"]);
  });
});

describe("a tutor naming a text (RES-78)", () => {
  const named = (customPrompt, selection) => tutorNamesSelection({ customPrompt }, selection);
  it("recognises the title or the author", () => {
    assert.equal(named("A paper on the poem Dover Beach", planned({ title: "Dover Beach", author: "Matthew Arnold" })), true);
    assert.equal(named("Something by Matthew Arnold please", planned({ title: "The Scholar Gipsy", author: "Matthew Arnold" })), true);
    assert.equal(named("A poem by Frost about choices", planned({ title: "Birches", author: "Robert Frost" })), true);
  });
  it("is not fooled by ordinary words", () => {
    assert.equal(named("A poem about frost on the fields", planned({ title: "Birches", author: "Robert Frost" })), false);
    assert.equal(named("Being alone in a crowd", planned({ title: "Alone", author: "Edgar Allan Poe" })), false);
  });
});

describe("what a bank text prints (RES-78)", () => {
  it("credits the publication, else a tidied school or file name", () => {
    assert.equal(sourceLabel(prose("a")), "A Book");
    assert.equal(sourceLabel(prose("a", { publication: null, sourcePath: "English/Past Papers/Year 12/Trial/Sydney Grammar 2020 - Year 12 Extension 1 Trial.pdf" })), "Sydney Grammar 2020 - Year 12 Extension 1 Trial");
    assert.equal(fileLabel("English/Comprehension/9781741250022_EES-Developing-Your-Comprehension-Skills-Years-7-10 (1).pdf"), "EES Developing Your Comprehension Skills Years 7-10");
    assert.equal(fileLabel("English/Comprehension/[398205]Close_Reading_11-14_Comprehension.pdf"), "Close Reading 11-14 Comprehension");
    assert.equal(fileLabel("English/Comprehension/year 5 comprehension and written expression.pdf"), "Year 5 comprehension and written expression");
  });

  it("never prints a placeholder title", () => {
    assert.equal(displayTitle({ title: "The River", type: "poem" }), "The River");
    assert.equal(displayTitle({ title: "Text 2", type: "poem" }), "Poem");
    assert.equal(displayTitle({ title: null, type: "prose_fiction" }), "Fiction extract");
    assert.equal(displayTitle({ title: "Text 4 – Discursive Extract", type: "nonfiction", sourcePath: "English/Past Papers/x.pdf" }), "Discursive Extract");
    assert.equal(displayTitle({ title: "Finding Facts — What a Waste!", type: "nonfiction", sourcePath: "English/Comprehension/x.pdf" }), "What a Waste!");
    assert.equal(displayTitle({ title: "Making sense - 5. What do you taste?", type: "nonfiction", sourcePath: "English/Comprehension/x.pdf" }), "What do you taste?");
    assert.equal(displayTitle({ title: "Macbeth - Act 1", type: "drama", sourcePath: "English/Past Papers/x.pdf" }), "Macbeth - Act 1");
  });

  it("drops the paper's own label and a repeated headline from the top of a text", () => {
    assert.equal(passageFor({ type: "prose_fiction", text: "Text 5 – Prose fiction extract\n\nAs soon as the weather had calmed." }), "As soon as the weather had calmed.");
    assert.equal(passageFor({ type: "nonfiction", title: "Mobiles Get Credit", text: "Mobiles Get Credit\n\nTeenage smoking has declined." }), "Teenage smoking has declined.");
    assert.equal(passageFor({ type: "prose_fiction", text: "Section III (continued)\nText 2 – Memoir\n\nI was born." }), "I was born.");
    assert.equal(passageFor({ type: "poem", text: "Text me when you land\nand I will come." }), "Text me when you land\nand I will come.");
  });

  it("joins a line split by a page turn in prose, and leaves verse alone", () => {
    assert.equal(passageFor({ type: "prose_fiction", text: "She walked on\nthrough the rain.\n\nThen home." }), "She walked on through the rain.\n\nThen home.");
    assert.equal(passageFor({ type: "poem", text: "She walked on\nthrough the rain." }), "She walked on\nthrough the rain.");
  });

  it("is reprinted as stored, with its credits, and is never called public domain", async () => {
    const text = "Word for word. — It's not changed… at all, even the odd   spacing in a line that goes on.";
    const { texts, usage } = await run({ stimuli: [prose("a", { text })] });
    const parsed = { stimulus: [] };
    applySourcedStimulus(parsed, [texts.get(0)], []);
    normaliseStimulusAttribution(parsed.stimulus);
    const [entry] = parsed.stimulus;
    assert.equal(entry.body, text);
    assert.equal(entry.verbatim, true);
    assert.equal(entry.title, "Story a");
    assert.equal(textSourceLine(entry), "Author: A. Writer   |   Source: A Book");
    assert.deepEqual(usage.used.map((u) => [u.kind, u.slot, u.stimulusId, u.reason]), [["text", 1, "a", "fits"]]);
    assert.deepEqual(usage.fallbacks, []);
  });

  it("doesn't borrow the planned work's author when the bank has none", async () => {
    const { texts } = await run({ stimuli: [prose("a", { author: null })] });
    const parsed = { stimulus: [] };
    applySourcedStimulus(parsed, [texts.get(0)], []);
    assert.equal(parsed.stimulus[0].author, "");
    assert.equal(textSourceLine(parsed.stimulus[0]), "Source: A Book");
  });
});

describe("the year rule and limits (RES-78)", () => {
  const seenCandidates = async (extra) => {
    let message = "";
    await run({ callAi: async (request) => { message = request.userMessage; return { parsed: { picks: [] } }; }, ...extra });
    return message;
  };

  it("never offers a Year 5 student a stimulus tagged only Year 11 or 12", async () => {
    const message = await seenCandidates({ job: { year: 5 }, stimuli: [prose("senior", { years: [11, 12] }), prose("junior", { years: [6] })] });
    assert.doesNotMatch(message, /Story senior/);
    assert.match(message, /Story junior/);
  });

  it("offers a Year 8 student a senior stimulus", async () => {
    assert.match(await seenCandidates({ stimuli: [prose("senior", { years: [12] })] }), /Story senior/);
  });

  it("rejects a passage over the sitting's word limit rather than cutting it", async () => {
    const message = await seenCandidates({ maxWords: 450, stimuli: [prose("long", { wordCount: 451 }), prose("fits", { wordCount: 450 })] });
    assert.doesNotMatch(message, /Story long/);
    assert.match(message, /Story fits/);
  });

  it("never offers instructional entries for a story slot", async () => {
    assert.doesNotMatch(await seenCandidates({ stimuli: [prose("how", { type: "other_written" }), prose("ok")] }), /Story how/);
  });
});

describe("when the bank can't help (RES-78)", () => {
  it("records why when the model picks none", async () => {
    const { texts, usage } = await run({ callAi: picksAll(0) });
    assert.equal(texts.size, 0);
    assert.deepEqual(usage.fallbacks, [{ kind: "text", slot: 1, reason: "none_suitable" }]);
  });

  it("records why when nothing matches, without a model call", async () => {
    let called = false;
    const { usage } = await run({ stimuli: [], callAi: async () => { called = true; return {}; } });
    assert.equal(called, false);
    assert.deepEqual(usage.fallbacks, [{ kind: "text", slot: 1, reason: "no_candidates" }]);
  });

  it("skips the bank for a text the tutor named", async () => {
    let called = false;
    const { usage, db } = await run({ job: { customPrompt: "A paper on Moby Dick please" }, callAi: async () => { called = true; return {}; } });
    assert.equal(called, false);
    assert.equal(db.calls.nearest, 0);
    assert.deepEqual(usage.fallbacks, [{ kind: "text", slot: 1, reason: "named_text" }]);
  });

  it("survives a failed search or a failed pick", async () => {
    const broken = { collection() { throw new Error("firestore down"); } };
    const searchFailed = await sourceSetFromBank({ job: job(), plannedTexts: [planned()], bank: { db: broken, bucket: fakeBucket(), embed }, callAi: picksAll() });
    assert.deepEqual(searchFailed.usage.fallbacks, [{ kind: "text", slot: 1, reason: "search_failed" }]);
    const pickFailed = await run({ callAi: async () => { throw new Error("provider down"); } });
    assert.deepEqual(pickFailed.usage.fallbacks, [{ kind: "text", slot: 1, reason: "pick_failed" }]);
  });

  it("lets a stop or a worker hand-off through", async () => {
    const stop = Object.assign(new Error("yield"), { code: "RESOURCE_STAGE_YIELD", resourceControl: true });
    await assert.rejects(run({ callAi: async () => { throw stop; } }), /yield/);
  });

  it("does nothing without a bank", async () => {
    const result = await sourceSetFromBank({ job: job(), plannedTexts: [planned()], bank: null, callAi: picksAll() });
    assert.equal(result.usage, null);
    assert.equal(result.texts.size, 0);
  });

  it("numbers candidates once across slots, and only takes a number that slot may use", async () => {
    let message = "";
    const { texts, usage } = await run({
      plannedTexts: [planned(), planned({ type: "poem", themes: ["ships"] })],
      stimuli: [prose("a"), prose("p", { type: "poem", wordCount: 120 })],
      callAi: async (request) => { message = request.userMessage; return { parsed: { picks: [{ slot: 1, choice: 2, reason: "wrong list" }, { slot: 2, choice: 2, reason: "fits" }] } }; },
    });
    assert.match(message, /SLOT 1: a prose fiction\. May use candidates 1\./);
    assert.match(message, /SLOT 2: a poem\. May use candidates 2\./);
    assert.equal(texts.has(0), false);
    assert.equal(texts.get(1).bankStimulusId, "p");
    assert.deepEqual(usage.fallbacks, [{ kind: "text", slot: 1, reason: "none_suitable" }]);
  });

  it("won't use the same text for two slots", async () => {
    const { texts, usage } = await run({ plannedTexts: [planned(), planned({ themes: ["ships"] })], stimuli: [prose("a")] });
    assert.equal(texts.size, 1);
    assert.deepEqual(usage.fallbacks, [{ kind: "text", slot: 2, reason: "none_suitable" }]);
  });
});

describe("the sourcing step with the bank (RES-78)", () => {
  const planStimulus = async () => ({ needed: true, texts: [planned(), planned({ title: "Dover Beach", type: "poem" })], visuals: [] });
  const bank = (stimuli) => ({ db: fakeDb({ stimuli }), bucket: fakeBucket(), embed });

  it("uses the bank first, and public-domain sourcing for the rest, in order", async () => {
    const fetched = [];
    const sourceText = async ({ selection }) => { fetched.push(selection.title); return { ok: true, passage: "Fetched.", selection, title: selection.title, source: "Wikisource" }; };
    const result = await maybeSourceStimulusSet({
      job: job(), apiKey: "k", planStimulus, sourceText, callAi: picksAll(), bank: bank([prose("a")]), openaiApiKey: "o",
    });
    assert.deepEqual(result.texts.map((t) => t.title), ["Story a", "Dover Beach"]);
    assert.deepEqual(fetched, ["Dover Beach"]);
    assert.deepEqual(result.bankUsage.fallbacks, [{ kind: "text", slot: 2, reason: "no_candidates" }]);
  });

  it("carries a job on with the stimulus it chose, without searching or trying again", async () => {
    const db = fakeDb({ stimuli: [prose("a")] });
    const usage = { used: [{ kind: "text", slot: 1, stimulusId: "a" }], fallbacks: [{ kind: "text", slot: 2, reason: "no_candidates" }] };
    let picked = false;
    const fetched = [];
    const result = await maybeSourceStimulusSet({
      job: job({ stimulusBankUsage: usage, sourceSelections: [{ title: "Story a", author: "A. Writer", type: "short-story", bankStimulusId: "a" }, { title: "Dover Beach", author: "Matthew Arnold", type: "poem" }] }),
      apiKey: "k",
      sourceText: async ({ selection }) => { fetched.push(selection.title); return { ok: true, passage: "Fetched.", selection, title: selection.title }; },
      callAi: async () => { picked = true; return {}; },
      bank: { db, bucket: fakeBucket(), embed },
    });
    assert.equal(picked, false);
    assert.equal(db.calls.nearest, 0);
    assert.deepEqual(fetched, ["Dover Beach"]);
    assert.deepEqual(result.texts.map((t) => t.bankStimulusId || null), ["a", null]);
    assert.equal(result.bankUsage, usage);
  });

  it("keeps the same candidates when a later worker repeats the step", async () => {
    const bucket = fakeBucket();
    const first = await run({ bucket });
    const later = await run({ bucket, stimuli: [] });
    assert.equal(first.db.calls.nearest, 1);
    assert.equal(later.db.calls.nearest, 0);
    assert.equal(later.texts.get(0).bankStimulusId, "a");
  });
});

describe("bank images (RES-78)", () => {
  const png = () => sharp({ create: { width: 900, height: 600, channels: 3, background: "#888" } }).png().toBuffer();
  const visual = { purpose: "visual-literacy", searchTerms: "war poster", task: "Analyse the poster." };
  const crop = (id, extra = {}) => prose(id, { medium: "visual", type: "poster", text: null, title: null, author: null, publication: null, wordCount: 0, sourcePath: "English/Past Papers/Year 12/Sydney Tech 2016 P1.pdf", pageCrops: [{ pageNumber: 1, storagePath: `crops/${id}.png` }], ...extra });
  const verdict = (suitable) => async ({ images }) => images.map((_, i) => ({ index: i + 1, suitable, fit: 4, reason: "clear", title: "A war poster", description: "Soldiers march." }));

  it("prints a crop the judge accepts, credited to its paper", async () => {
    const bucket = fakeBucket({ "crops/v.png": await png() });
    const { visuals, usage } = await run({ plannedTexts: [], plannedVisuals: [visual], stimuli: [crop("v")], bucket, judge: verdict(true) });
    const item = visuals.get(0);
    assert.equal(Buffer.isBuffer(item.image.buffer), true);
    assert.equal(item.image.type, "png");
    assert.equal(item.source, "Sydney Tech 2016 P1");
    const parsed = {};
    applySourcedStimulus(parsed, [], [item]);
    assert.equal(parsed.stimulus[0].title, "A war poster");
    assert.equal(parsed.stimulus[0].source, "Sydney Tech 2016 P1");
    assert.equal(parsed.stimulus[0].licence, null);
    assert.equal(usage.used[0].kind, "image");
  });

  it("falls back when the judge rejects them all, or there is no judge", async () => {
    const bucket = fakeBucket({ "crops/v.png": await png() });
    const rejected = await run({ plannedTexts: [], plannedVisuals: [visual], stimuli: [crop("v")], bucket, judge: verdict(false) });
    assert.deepEqual(rejected.usage.fallbacks, [{ kind: "image", slot: 1, reason: "none_suitable" }]);
    const unjudged = await run({ plannedTexts: [], plannedVisuals: [visual], stimuli: [crop("v")], bucket, judge: null });
    assert.equal(unjudged.visuals.size, 0);
    assert.deepEqual(unjudged.usage.fallbacks, [{ kind: "image", slot: 1, reason: "bank_unavailable" }]);
  });

  it("ignores a crop too small to print", async () => {
    const tiny = await sharp({ create: { width: 200, height: 150, channels: 3, background: "#888" } }).png().toBuffer();
    const { usage } = await run({ plannedTexts: [], plannedVisuals: [visual], stimuli: [crop("v")], bucket: fakeBucket({ "crops/v.png": tiny }), judge: verdict(true) });
    assert.deepEqual(usage.fallbacks, [{ kind: "image", slot: 1, reason: "no_candidates" }]);
  });
});

describe("bank examples for the writer (RES-78)", () => {
  const records = {
    questions: [
      { id: "q1", status: "live", stimulusIds: ["a"], label: "1", text: "What does the tide suggest?", marks: 2 },
      { id: "q2", status: "live", stimulusIds: ["a"], label: "2", text: "Explain the mood.", marks: 3 },
    ],
    guides: [{ id: "g2", status: "live", questionId: "q2", criteria: "Explains mood with evidence." }],
  };

  it("gives the writer the text's own questions, those with a guide first", async () => {
    const { texts } = await run({ records });
    assert.deepEqual(texts.get(0).bankExamples, [
      { text: "Explain the mood.", marks: 3, guide: "Explains mood with evidence." },
      { text: "What does the tide suggest?", marks: 2, guide: "" },
    ]);
    const message = buildUserMessage(job(), [], { texts: [texts.get(0)] });
    assert.match(message, /EXAMPLES: questions set on this text/);
    assert.match(message, /Explain the mood\. \(3 marks\)\n {2}Marking: Explains mood with evidence\./);
  });

  it("adds nothing for a public-domain text", () => {
    const message = buildUserMessage(job(), [], { texts: [{ title: "T", passage: "Words.", selection: {} }] });
    assert.doesNotMatch(message, /EXAMPLES:/);
  });
});

describe("annotation tasks (RES-78)", () => {
  const annotation = (extra = {}) => job({ resourceType: "annotation-task", ...extra });

  it("takes a passage from the bank when one suits", async () => {
    const { sourced, usage } = await sourcePassageFromBank({ job: annotation(), bank: { db: fakeDb({ stimuli: [prose("a")] }), bucket: fakeBucket(), embed }, callAi: picksAll() });
    assert.equal(sourced.bankStimulusId, "a");
    assert.equal(usage.used.length, 1);
  });

  it("doesn't try again once a retry has its passage", async () => {
    const db = fakeDb({ stimuli: [prose("a")] });
    const { sourced } = await sourcePassageFromBank({ job: annotation({ sourceSelections: [{ title: "Ozymandias", type: "poem" }] }), bank: { db, bucket: fakeBucket(), embed }, callAi: picksAll() });
    assert.equal(sourced, null);
    assert.equal(db.calls.nearest, 0);
  });
});
