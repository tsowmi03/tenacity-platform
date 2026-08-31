"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  stripGutenbergBoilerplate,
  extractNamedPiece,
  unwrapProse,
  dedentLines,
  stripGutenbergFrontMatter,
  excerptOpening,
  selectPublicDomainText,
  sourceGutenbergWork,
} = require("../../src/resources/publicDomainText");
const { splitPassageBlocks } = require("../../src/resources/builder/annotationTask");
const {
  extractPoemFromWikitext,
  cleanWikiMarkup,
} = require("../../src/resources/wikisource");
const { isPoem, sourceVerifiedText } = require("../../src/resources/sourcedText");
const { buildUserMessage } = require("../../src/resources/promptBuilder");
const {
  shouldSourcePassage,
  maybeSourcePassage,
  applySourcedPassage,
  shouldSourceStimulusSet,
  maybeSourceStimulusSet,
  applySourcedStimulus,
  planStimulusSelections,
  stripVerbatimFlags,
} = require("../../src/resources/index");

describe("Gutenberg text extraction", () => {
  it("strips the standard Project Gutenberg header and footer", () => {
    const raw = [
      "The Project Gutenberg eBook of Something",
      "*** START OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
      "Produced by A. Volunteer",
      "",
      "The real body begins here.",
      "*** END OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
      "Footer license text.",
    ].join("\n");
    const body = stripGutenbergBoilerplate(raw);
    assert.equal(body, "The real body begins here.");
  });

  it("extractNamedPiece keeps the longest slice so the TOC entry is skipped", () => {
    const bodyText =
      "The actual story body begins here and continues for many words so that it " +
      "comfortably clears the minimum length floor that the extractor requires " +
      "before it will trust a slice as a genuine piece rather than a contents entry. " +
      "It keeps going with several more sentences of narrative prose to be sure the " +
      "word count is well above the threshold and the longest-slice heuristic wins.";
    const body = [
      "CONTENTS",
      "",
      "THE TARGET", // table-of-contents entry (short)
      "ANOTHER TALE",
      "A THIRD TALE",
      "",
      "",
      "THE TARGET", // real heading — long body follows
      "",
      bodyText,
      "",
      "",
      "ANOTHER TALE",
      "Different content entirely.",
    ].join("\n");
    const { text, confidence } = extractNamedPiece(body, "The Target");
    assert.match(text, /actual story body/);
    assert.doesNotMatch(text, /A THIRD TALE/);
    assert.ok(["low", "medium"].includes(confidence));
  });
});

describe("extractNamedPiece first-line matches", () => {
  it("keeps the matched line when it is the poem's first line, not a heading", () => {
    // Collections often number poems (XIII) while the model names them by
    // first line; the matched line is part of the verse and must survive.
    const body = [
      "XIII",
      "",
      "When I was one-and-twenty",
      "I heard a wise man say,",
      "Give crowns and pounds and guineas",
      "But not your heart away;",
      "Give pearls away and rubies",
      "But keep your fancy free.",
      "But I was one-and-twenty,",
      "No use to talk to me.",
      "",
      "",
      "XIV",
      "There pass the careless people",
    ].join("\n");
    const { text } = extractNamedPiece(body, "When I was one-and-twenty", { shortForm: true });
    assert.ok(text, "expected a slice");
    assert.match(text, /^When I was one-and-twenty/);
    assert.match(text, /keep your fancy free/);
    assert.doesNotMatch(text, /careless people/);
  });

  it("shortForm accepts a complete short poem that the prose thresholds would reject", () => {
    const poemLines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1} of the short poem here now`);
    const body = ["THE TITLE", "", ...poemLines].join("\n");
    const strict = extractNamedPiece(body, "The Title");
    const short = extractNamedPiece(body, "The Title", { shortForm: true });
    assert.equal(strict.confidence, "low"); // ~70 words: below the 120-word prose bar
    assert.equal(short.confidence, "medium"); // but a complete poem at this length
  });
});

describe("dedentLines", () => {
  it("keeps verse line breaks, strips the common indent, preserves relative indent", () => {
    const verse = [
      "    When I was one-and-twenty",
      "      I heard a wise man say,",
      "    Give crowns and pounds and guineas",
      "",
      "",
      "",
      "    But I was one-and-twenty,",
    ].join("\n");
    const out = dedentLines(verse);
    const lines = out.split("\n");
    assert.equal(lines[0], "When I was one-and-twenty");
    assert.equal(lines[1], "  I heard a wise man say,"); // relative indent kept
    assert.match(out, /guineas\n\nBut I was/); // blank-line runs collapse to one stanza break
  });
});

describe("excerptOpening", () => {
  const prosePara = (n) =>
    Array.from({ length: 3 }, (_, s) => `Sentence ${s + 1} of paragraph ${n} continues the story with plenty of narrative words to count here.`).join(" ");

  it("skips front matter and starts at the first real prose paragraph", () => {
    const passage = [
      "[Illustration]",
      "Great Expectations",
      "[1867 Edition]",
      "by Charles Dickens",
      "Contents Chapter I. Chapter II. Chapter III. Chapter IV. Chapter V. Chapter VI.",
      "Chapter I.",
      "My father's family name being Pirrip, and my Christian name Philip, my infant tongue could make of both names nothing longer than Pip. So I called myself Pip, and came to be called Pip too, and that is how the whole thing began for me in those early years.",
      prosePara(2),
      prosePara(3),
    ].join("\n\n");
    const out = excerptOpening(passage, 200, "Great Expectations");
    assert.match(out, /^My father's family name/);
    assert.doesNotMatch(out, /1867 Edition/);
    assert.doesNotMatch(out, /Contents Chapter/);
  });

  it("stops at a paragraph boundary once the target length is reached", () => {
    const paras = Array.from({ length: 40 }, (_, i) => prosePara(i + 1));
    const out = excerptOpening(paras.join("\n\n"), 200, "Title");
    const words = out.split(/\s+/).length;
    assert.ok(words >= 200 && words < 300, `expected ~200-300 words, got ${words}`);
    assert.match(out, /paragraph 1 /);
  });

  it("cuts a single enormous paragraph at a sentence end", () => {
    const giant = Array.from({ length: 400 }, (_, i) => `Sentence number ${i + 1} keeps the single paragraph going without a break.`).join(" ");
    const out = excerptOpening(giant, 300, "Title");
    const words = out.split(/\s+/).length;
    assert.ok(words <= 320, `expected <=320 words, got ${words}`);
    assert.match(out, /[.!?]$/);
  });
});

describe("passage formatting", () => {
  it("unwrapProse joins hard wraps but keeps paragraph breaks", () => {
    const wrapped =
      "The thousand injuries of Fortunato I had borne as I best\n" +
      "could, but when he ventured upon insult, I vowed revenge.\n\n" +
      "You, who so well know the nature of my soul, will not\n" +
      "suppose, however, that I gave utterance to a threat.";
    const out = unwrapProse(wrapped);
    assert.match(out, /as I best could, but/); // wrap joined within paragraph
    assert.equal(out.split("\n\n").length, 2); // two paragraphs preserved
    assert.doesNotMatch(out, /best\ncould/); // no mid-sentence line break
  });

  it("splitPassageBlocks keeps poem lines and stanza breaks", () => {
    const poem = "Line one\nLine two\n\nLine three\nLine four";
    const blocks = splitPassageBlocks(poem);
    assert.equal(blocks.length, 2); // two stanzas
    assert.deepEqual(blocks[0], ["Line one", "Line two"]);
    assert.deepEqual(blocks[1], ["Line three", "Line four"]);
  });

  it("splitPassageBlocks treats a flowing paragraph as one block of one line", () => {
    const blocks = splitPassageBlocks("A single flowing paragraph with no breaks.");
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].length, 1);
  });

  it("stripGutenbergFrontMatter drops a leading title page but keeps the prose", () => {
    const body =
      "The Cask of Amontillado\n\nby\n\nEdgar Allan Poe\n\n" +
      "The thousand injuries of Fortunato I had borne as I best could, but when he " +
      "ventured upon insult I vowed revenge and resolved upon a course of action.";
    const out = stripGutenbergFrontMatter(body, "The Cask of Amontillado");
    assert.match(out, /^The thousand injuries/);
    assert.doesNotMatch(out, /Edgar Allan Poe/);
  });

  it("stripGutenbergFrontMatter leaves the body untouched when it does not start with the title", () => {
    const body = "A different opening line that is not the title at all and runs on for a while here.";
    assert.equal(stripGutenbergFrontMatter(body, "The Cask of Amontillado"), body);
  });
});

describe("Wikisource poem extraction", () => {
  it("extracts a clean <poem> block at high confidence", () => {
    const wikitext = [
      "{{header | title = X | author = Y}}",
      "<poem>",
      "Two roads diverged in a yellow wood,",
      "And sorry I could not travel both",
      "</poem>",
      "[[Category:Poems]]",
    ].join("\n");
    const { text, confidence } = extractPoemFromWikitext(wikitext);
    assert.equal(confidence, "high");
    assert.match(text, /Two roads diverged/);
    assert.doesNotMatch(text, /Category/);
  });

  it("falls back to low confidence when there is no <poem> tag", () => {
    const { confidence } = extractPoemFromWikitext("{{versions}}\nSome prose with no poem tag.");
    assert.notEqual(confidence, "high");
  });

  it("cleanWikiMarkup resolves links and strips emphasis", () => {
    assert.equal(cleanWikiMarkup("[[The Road|road]] is '''bold'''"), "road is bold");
    assert.equal(cleanWikiMarkup("[[Plain]] link"), "Plain link");
  });
});

describe("source dispatch", () => {
  const poemSelection = { title: "P", author: "A", type: "poem" };
  const proseSelection = { title: "S", author: "B", type: "short-story" };

  it("isPoem detects poem selections", () => {
    assert.equal(isPoem(poemSelection), true);
    assert.equal(isPoem(proseSelection), false);
  });

  it("routes poems to Wikisource and prose to Gutenberg", async () => {
    const calls = [];
    const wikisource = async (a) => { calls.push(["ws", a.title]); return { ok: true, passage: "poem" }; };
    const gutenberg = async ({ selection }) => { calls.push(["gb", selection.title]); return { ok: true, passage: "prose" }; };

    const poem = await sourceVerifiedText({ selection: poemSelection, wikisource, gutenberg });
    const prose = await sourceVerifiedText({ selection: proseSelection, wikisource, gutenberg });

    assert.deepEqual(calls, [["ws", "P"], ["gb", "S"]]);
    assert.equal(poem.passage, "poem");
    assert.equal(prose.passage, "prose");
    assert.equal(poem.selection, poemSelection);
  });

  it("falls back to Gutenberg when Wikisource cannot verify a poem", async () => {
    const wikisource = async () => ({ ok: false, source: "Wikisource", passage: null });
    const gutenberg = async ({ selection }) => ({ ok: true, passage: "sliced verse", source: "Project Gutenberg", title: selection.title });
    const result = await sourceVerifiedText({ selection: poemSelection, wikisource, gutenberg });
    assert.equal(result.ok, true);
    assert.equal(result.passage, "sliced verse");
    assert.equal(result.source, "Project Gutenberg");
  });

  it("keeps the Wikisource failure when the Gutenberg fallback also misses", async () => {
    const wikisource = async () => ({ ok: false, source: "Wikisource", passage: null, tried: [] });
    const gutenberg = async () => ({ ok: false, source: "Project Gutenberg", passage: null });
    const result = await sourceVerifiedText({ selection: poemSelection, wikisource, gutenberg });
    assert.equal(result.ok, false);
    assert.equal(result.source, "Wikisource");
  });

  it("selects via the model when no selection is supplied", async () => {
    const select = async () => ({ title: "Chosen", author: "Z", type: "short-story" });
    const gutenberg = async ({ selection }) => ({ ok: true, passage: "x", title: selection.title });
    const result = await sourceVerifiedText({ apiKey: "k", brief: {}, select, gutenberg, wikisource: async () => ({}) });
    assert.equal(result.selection.title, "Chosen");
  });
});

describe("single public-domain selection", () => {
  it("falls back from Sonnet 5 to Terra with the same structured request", async () => {
    const calls = [];
    const callAi = async (payload) => {
      calls.push(payload);
      if (payload.model === "claude-sonnet-5") throw new Error("Claude down");
      return {
        parsed: { title: "The Raven", author: "Edgar Allan Poe", type: "poem" },
        model: payload.model,
        provider: "openai",
        usage: {},
      };
    };
    const selected = await selectPublicDomainText({
      anthropicApiKey: "anthropic-key",
      openaiApiKey: "openai-key",
      brief: {
        year: 8,
        textType: "poem",
        lengthWords: 300,
        skillFocus: "close reading",
      },
      callAi,
    });
    assert.deepEqual(calls.map((call) => call.model), ["claude-sonnet-5", "gpt-5.6-terra"]);
    assert.equal(calls[0].thinkingDisabled, true);
    assert.equal(calls[0].maxTokens, 4096);
    assert.equal(calls[1].effort, "low");
    assert.equal(selected._planner.effectiveModel, "gpt-5.6-terra");
  });
});

describe("passage sourcing gate", () => {
  const base = { subject: "english", resourceType: "annotation-task" };

  it("enables only for english passage-based types with the flag on and no upload", () => {
    assert.equal(shouldSourcePassage({ job: base, enablePdTextSourcing: true, hasUploadedContent: false }), true);
    assert.equal(shouldSourcePassage({ job: base, enablePdTextSourcing: false, hasUploadedContent: false }), false);
    assert.equal(shouldSourcePassage({ job: base, enablePdTextSourcing: true, hasUploadedContent: true }), false);
  });

  it("does not enable for maths or non-passage resource types", () => {
    assert.equal(shouldSourcePassage({ job: { subject: "maths", resourceType: "annotation-task" }, enablePdTextSourcing: true, hasUploadedContent: false }), false);
    assert.equal(shouldSourcePassage({ job: { subject: "english", resourceType: "worksheet" }, enablePdTextSourcing: true, hasUploadedContent: false }), false);
  });
});

describe("maybeSourcePassage", () => {
  const job = { year: 8, resourceType: "annotation-task", subject: "english" };

  it("returns used:true when a verified passage is found", async () => {
    const sourceText = async () => ({ ok: true, passage: "real text", source: "Wikisource" });
    const r = await maybeSourcePassage({ job, apiKey: "k", sourceText });
    assert.equal(r.used, true);
    assert.equal(r.sourced.passage, "real text");
  });

  it("returns used:false with a warning when nothing is found", async () => {
    const sourceText = async () => ({ ok: false, passage: null });
    const r = await maybeSourcePassage({ job, apiKey: "k", sourceText });
    assert.equal(r.used, false);
    assert.match(r.warning, /No verified public-domain text/);
  });

  it("never throws — sourcing errors degrade to fallback", async () => {
    const sourceText = async () => { throw new Error("network down"); };
    const r = await maybeSourcePassage({ job, apiKey: "k", sourceText });
    assert.equal(r.used, false);
    assert.match(r.warning, /network down/);
  });

  it("reuses a persisted selection on a fresh main-model attempt without curating again", async () => {
    const savedSelection = {
      title: "The Open Window",
      author: "Saki",
      type: "short-story",
      pieceTitle: "The Open Window",
    };
    let receivedSelection = null;
    const r = await maybeSourcePassage({
      job: { ...job, sourceSelections: [savedSelection] },
      sourceText: async ({ selection }) => {
        receivedSelection = selection;
        return { ok: true, passage: "canonical bytes", selection };
      },
    });

    assert.deepEqual(receivedSelection, savedSelection);
    assert.equal(r.sourced.passage, "canonical bytes");
  });

  it("propagates cancellation instead of degrading it to model-written text", async () => {
    const cancelled = Object.assign(new Error("cancelled"), { name: "AbortError" });
    await assert.rejects(
      () => maybeSourcePassage({
        job,
        sourceText: async () => { throw cancelled; },
      }),
      (err) => err === cancelled
    );
  });
});

describe("stimulus-set sourcing gate", () => {
  const job = { subject: "english", resourceType: "practice-paper", year: 10 };

  it("enables for english stimulus types with the flag on", () => {
    assert.equal(shouldSourceStimulusSet({ job, enablePdTextSourcing: true }), true);
    assert.equal(shouldSourceStimulusSet({ job, enablePdTextSourcing: false }), false);
  });

  it("stays enabled when the tutor uploaded reference files — the planner decides", () => {
    // Uploads are usually context (notification, past paper, copyrighted
    // booklet), so they must not silently disable sourcing at the gate.
    assert.equal(shouldSourceStimulusSet({ job, enablePdTextSourcing: true, hasUploadedContent: true }), true);
  });

  it("enables across all english stimulus resource types", () => {
    for (const resourceType of ["worksheet", "diagnostic-test", "mixed-review", "study-guide", "essay-scaffold"]) {
      assert.equal(
        shouldSourceStimulusSet({ job: { subject: "english", resourceType, year: 10 }, enablePdTextSourcing: true }),
        true,
        `expected sourcing enabled for ${resourceType}`
      );
    }
  });

  it("does not enable for topic booklets, which no longer present a stimulus", () => {
    // A booklet is teaching material, not a comprehension task — the planner
    // consistently returned "not needed" for one. It shows textual evidence
    // through each sub-topic's modelAnalysis instead of a stimulus booklet.
    assert.equal(
      shouldSourceStimulusSet({
        job: { subject: "english", resourceType: "topic-booklet", year: 10 },
        enablePdTextSourcing: true,
      }),
      false
    );
  });

  it("does not enable for maths or the single-passage annotation task", () => {
    assert.equal(shouldSourceStimulusSet({ job: { subject: "maths", resourceType: "practice-paper" }, enablePdTextSourcing: true }), false);
    assert.equal(shouldSourceStimulusSet({ job: { subject: "english", resourceType: "annotation-task" }, enablePdTextSourcing: true }), false);
    assert.equal(shouldSourceStimulusSet({ job: { subject: "maths", resourceType: "worksheet" }, enablePdTextSourcing: true }), false);
  });

});

describe("planStimulusSelections", () => {
  const job = { year: 10, resourceType: "practice-paper", subject: "english", customPrompt: "poetry about growing up" };

  it("passes the resource type, year and tutor instructions to the planner", async () => {
    let seen = null;
    const callAi = async (payload) => {
      seen = payload;
      return { parsed: { needed: true, texts: [{ title: "P", author: "A", type: "poem" }] } };
    };
    const plan = await planStimulusSelections({ apiKey: "k", job, callAi });
    assert.equal(plan.needed, true);
    assert.match(seen.userMessage, /practice paper/);
    assert.match(seen.userMessage, /poetry about growing up/);
    assert.equal(seen.mathBearing, false);
    assert.equal(seen.model, "claude-sonnet-5");
    assert.equal(seen.maxTokens, 4096);
    assert.equal(seen.thinkingDisabled, true);
    assert.equal(seen.responseSchema.type, "object");
  });

  it("uses Terra when the Sonnet planner call fails", async () => {
    const calls = [];
    const callAi = async (payload) => {
      calls.push(payload);
      if (payload.model === "claude-sonnet-5") {
        const err = new Error("Anthropic unavailable");
        err.modelFailure = true;
        throw err;
      }
      return {
        parsed: { needed: true, texts: [{ title: "P", author: "A", type: "poem" }] },
        model: payload.model,
        provider: "openai",
        usage: {},
      };
    };
    const plan = await planStimulusSelections({
      anthropicApiKey: "anthropic-key",
      openaiApiKey: "openai-key",
      job,
      callAi,
    });
    assert.deepEqual(calls.map((call) => call.model), ["claude-sonnet-5", "gpt-5.6-terra"]);
    assert.equal(calls[1].effort, "low");
    assert.equal(plan.planner.effectiveModel, "gpt-5.6-terra");
    assert.equal(plan.planner.fallbackUsed, true);
  });

  it("shows uploaded reference documents to the planner as truncated excerpts", async () => {
    let seen = null;
    const callAi = async (payload) => {
      seen = payload;
      return { parsed: { needed: true, texts: [{ title: "P", author: "A", type: "poem" }] } };
    };
    await planStimulusSelections({
      apiKey: "k",
      job,
      uploadedContent: [
        { fileName: "Stimulus Booklet.pdf", content: `poem about belonging ${"x".repeat(2000)}` },
        { fileName: "Notification.pdf", content: "Section I: reading. Section II: writing." },
        { fileName: "empty.pdf", content: "   " },
      ],
      callAi,
    });
    assert.match(seen.userMessage, /UPLOADED DOCUMENT 1 \(Stimulus Booklet\.pdf\)/);
    assert.match(seen.userMessage, /poem about belonging/);
    assert.match(seen.userMessage, /\[\.\.\.truncated\]/);
    assert.match(seen.userMessage, /UPLOADED DOCUMENT 2 \(Notification\.pdf\)/);
    assert.match(seen.userMessage, /Section I: reading/);
    // Blank extractions are dropped rather than shown as empty blocks.
    assert.doesNotMatch(seen.userMessage, /empty\.pdf/);
    // The excerpt is capped, so the oversized booklet content is not sent whole.
    assert.ok(seen.userMessage.length < 2500);
  });

  it("omits the uploaded-documents block when there are no uploads", async () => {
    let seen = null;
    const callAi = async (payload) => {
      seen = payload;
      return { parsed: { needed: false, texts: [] } };
    };
    await planStimulusSelections({ apiKey: "k", job, callAi });
    assert.doesNotMatch(seen.userMessage, /UPLOADED DOCUMENT/);
  });

  it("returns needed:false when the planner says no reading text is required", async () => {
    const callAi = async () => ({ parsed: { needed: false, texts: [] } });
    const plan = await planStimulusSelections({ apiKey: "k", job, callAi });
    assert.equal(plan.needed, false);
    assert.equal(plan.texts.length, 0);
  });

  it("drops malformed selections and caps the plan at three texts", async () => {
    const callAi = async () => ({
      parsed: {
        needed: true,
        texts: [
          { title: "One", author: "A", type: "poem" },
          { title: "Two", author: "B", type: "short-story" },
          { title: "no author", type: "poem" },
          { title: "Three", author: "C", type: "nonfiction" },
          { title: "Four", author: "D", type: "poem" },
        ],
      },
    });
    const plan = await planStimulusSelections({ apiKey: "k", job, callAi });
    assert.equal(plan.texts.length, 3);
    assert.deepEqual(plan.texts.map((t) => t.title), ["One", "Two", "Three"]);
  });
});

describe("maybeSourceStimulusSet", () => {
  const job = { year: 10, resourceType: "practice-paper", subject: "english" };

  it("fetches exactly the planned texts and reports their kinds", async () => {
    const planStimulus = async () => ({
      needed: true,
      texts: [
        { title: "The Poem", author: "P", type: "poem" },
        { title: "The Story", author: "S", type: "short-story" },
      ],
    });
    const fetched = [];
    const sourceText = async ({ selection }) => {
      fetched.push(selection.title);
      return { ok: true, passage: `body-${selection.title}`, selection, sourceName: "Src", sourceUrl: "https://x" };
    };
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", planStimulus, sourceText });
    assert.equal(r.used, true);
    assert.deepEqual(fetched, ["The Poem", "The Story"]);
  });

  it("forwards uploaded reference content to the planner", async () => {
    let seenUploads = null;
    const planStimulus = async ({ uploadedContent }) => {
      seenUploads = uploadedContent;
      return { needed: false, texts: [] };
    };
    const uploads = [{ fileName: "booklet.pdf", content: "text" }];
    await maybeSourceStimulusSet({ job, apiKey: "k", planStimulus, uploadedContent: uploads, sourceText: async () => ({ ok: true }) });
    assert.deepEqual(seenUploads, uploads);
  });

  it("fetches nothing when the planner says no stimulus is needed", async () => {
    const planStimulus = async () => ({ needed: false, texts: [] });
    let fetchCalls = 0;
    const sourceText = async () => { fetchCalls += 1; return { ok: true, passage: "x" }; };
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", planStimulus, sourceText });
    assert.equal(r.used, false);
    assert.equal(r.skipped, true);
    assert.equal(fetchCalls, 0);
  });

  it("skips planned texts that do not verify but keeps the ones that do", async () => {
    const planStimulus = async () => ({
      needed: true,
      texts: [
        { title: "Good", author: "A", type: "poem" },
        { title: "Bad", author: "B", type: "short-story" },
      ],
    });
    const sourceText = async ({ selection }) =>
      selection.title === "Good"
        ? { ok: true, passage: "verse", selection }
        : { ok: false, passage: null };
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", planStimulus, sourceText });
    assert.equal(r.used, true);
    assert.equal(r.texts.length, 1);
  });

  it("asks Terra for a different work after a canonical source miss", async () => {
    const planStimulus = async () => ({
      needed: true,
      texts: [{ title: "Missing", author: "A", type: "poem" }],
      planner: {
        requestedModel: "claude-sonnet-5",
        effectiveModel: "claude-sonnet-5",
        effectiveProvider: "anthropic",
        fallbackUsed: false,
      },
    });
    const fetched = [];
    const sourceText = async ({ selection }) => {
      fetched.push(selection.title);
      return selection.title === "Verified"
        ? { ok: true, passage: "canonical bytes", selection, sourceUrl: "https://example.test/verified" }
        : { ok: false, passage: null, selection };
    };
    const selectAlternative = async ({ excludedTitles }) => {
      assert.deepEqual(excludedTitles, ["Missing"]);
      return {
        title: "Verified",
        author: "B",
        type: "poem",
        _planner: {
          effectiveModel: "gpt-5.6-terra",
          effectiveProvider: "openai",
          fallbackUsed: false,
        },
      };
    };
    const result = await maybeSourceStimulusSet({
      job,
      planStimulus,
      sourceText,
      selectAlternative,
    });
    assert.deepEqual(fetched, ["Missing", "Verified"]);
    assert.equal(result.texts[0].passage, "canonical bytes");
    assert.equal(result.planner.effectiveModel, "gpt-5.6-terra");
    assert.equal(result.planner.alternateWorkRequired, true);
  });

  it("returns used:false with a warning when planned texts cannot be verified", async () => {
    const planStimulus = async () => ({ needed: true, texts: [{ title: "X", author: "A", type: "poem" }] });
    const sourceText = async () => ({ ok: false, passage: null });
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", planStimulus, sourceText });
    assert.equal(r.used, false);
    assert.match(r.warning, /could not be verified/);
  });

  it("degrades to a warning when planning itself fails", async () => {
    const planStimulus = async () => { throw new Error("planner down"); };
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", planStimulus, sourceText: async () => ({ ok: true }) });
    assert.equal(r.used, false);
    assert.match(r.warning, /planning failed/i);
  });
});

describe("stimulus-set injection and overwrite", () => {
  it("buildUserMessage injects multiple verified stimulus texts in order", () => {
    const job = { resourceType: "practice-paper", year: 10, subject: "english" };
    const msg = buildUserMessage(job, null, {
      texts: [
        { passage: "poem body", selection: { title: "The Poem", author: "Poet" }, sourceName: "Wikisource", sourceUrl: "https://w" },
        { passage: "story body", selection: { title: "The Story", author: "Writer" }, sourceName: "Gutenberg", sourceUrl: "https://g" },
      ],
    });
    assert.match(msg, /VERIFIED PUBLIC-DOMAIN STIMULUS TEXTS/);
    assert.match(msg, /Text 1:/);
    assert.match(msg, /The Poem/);
    assert.match(msg, /Text 2:/);
    assert.match(msg, /story body/);
  });

  it("applySourcedStimulus replaces the model's booklet with source bytes, in order", () => {
    const parsed = { stimulus: [{ title: "model junk", body: "invented" }], sections: [] };
    applySourcedStimulus(parsed, [
      { passage: "verse one\nverse two", selection: { title: "Poem", author: "P", type: "poem" }, sourceName: "Wikisource", sourceUrl: "https://w" },
      { passage: "prose body", selection: { title: "Story", author: "S", type: "short-story" }, sourceName: "Gutenberg", sourceUrl: "https://g" },
    ]);
    assert.equal(parsed.stimulus.length, 2);
    assert.equal(parsed.stimulus[0].label, "Text 1");
    assert.equal(parsed.stimulus[0].textType, "poem");
    assert.equal(parsed.stimulus[0].title, "Poem");
    assert.equal(parsed.stimulus[0].body, "verse one\nverse two");
    assert.equal(parsed.stimulus[1].label, "Text 2");
    assert.equal(parsed.stimulus[1].textType, "prose");
    assert.match(parsed.stimulus[1].source, /gutenberg\.org|Gutenberg|https:\/\/g/i);
  });

  it("applySourcedStimulus keeps model-written texts beyond the sourced count", () => {
    // Live-generation regression (2026-07-03): the tutor asked for a poem and a
    // contemporary prose extract; only the poem could be verified, so the model
    // wrote its own prose as Text 2 and questions referenced it. Wholesale
    // replacement deleted that text while the questions survived, shipping a
    // paper whose Section on "Text 2" pointed at nothing.
    const parsed = {
      stimulus: [
        { label: "Text 1", title: "model copy of poem", body: "mangled verse" },
        { label: "Text 2", textType: "prose", title: "The New Path", author: "Tenacity Resources", body: "Maya walked the track..." },
      ],
      sections: [],
    };
    applySourcedStimulus(parsed, [
      { passage: "verse one\nverse two", selection: { title: "Poem", author: "P", type: "poem" }, sourceName: "Wikisource", sourceUrl: "https://w" },
    ]);
    assert.equal(parsed.stimulus.length, 2);
    assert.equal(parsed.stimulus[0].label, "Text 1");
    assert.equal(parsed.stimulus[0].body, "verse one\nverse two");
    assert.equal(parsed.stimulus[1].label, "Text 2");
    assert.equal(parsed.stimulus[1].title, "The New Path");
    assert.equal(parsed.stimulus[1].body, "Maya walked the track...");
  });

  it("applySourcedStimulus leaves the booklet untouched when nothing was sourced", () => {
    const parsed = { stimulus: [{ title: "kept", body: "kept body" }] };
    applySourcedStimulus(parsed, []);
    assert.equal(parsed.stimulus[0].title, "kept");
  });

  it("marks sourced texts verbatim but never the model's own extras", () => {
    const parsed = {
      stimulus: [
        { label: "Text 1", title: "model copy", body: "mangled" },
        { label: "Text 2", title: "The New Path", body: "Marcus walked..." },
      ],
    };
    // The pipeline scrubs model-emitted flags before applying sourced texts,
    // so the model cannot exempt its own writing from the de-AI backstop.
    parsed.stimulus[1].verbatim = true;
    stripVerbatimFlags(parsed);
    applySourcedStimulus(parsed, [
      { passage: "verse", selection: { title: "Poem", author: "P", type: "poem" }, sourceName: "Wikisource", sourceUrl: "https://w" },
    ]);

    assert.equal(parsed.stimulus[0].verbatim, true);
    assert.equal(parsed.stimulus[1].verbatim, undefined);
  });

  it("stripVerbatimFlags clears a model-emitted passageVerbatim; applySourcedPassage restores it", () => {
    const parsed = { passageText: "model text", passageVerbatim: true };
    stripVerbatimFlags(parsed);
    assert.equal(parsed.passageVerbatim, undefined);

    applySourcedPassage(parsed, {
      passage: "real bytes — with a dash",
      selection: { title: "Poem", author: "P", type: "poem" },
      sourceName: "Wikisource",
      sourceUrl: "https://w",
    });
    assert.equal(parsed.passageVerbatim, true);
    assert.equal(parsed.passageText, "real bytes — with a dash");
  });

  it("labels an excerpted work as an extract in the booklet and the prompt", () => {
    const sourced = {
      passage: "My father's family name being Pirrip...",
      selection: { title: "Great Expectations", author: "Charles Dickens", type: "short-story" },
      sourceName: "Great Expectations",
      sourceUrl: "https://www.gutenberg.org/ebooks/1400",
      excerpted: true,
    };
    const parsed = { stimulus: [] };
    applySourcedStimulus(parsed, [sourced]);
    assert.equal(parsed.stimulus[0].title, "Extract from Great Expectations");

    const job = { resourceType: "practice-paper", year: 10, subject: "english" };
    const msg = buildUserMessage(job, null, { texts: [sourced] });
    assert.match(msg, /Title: Extract from Great Expectations/);
  });
});

describe("passage injection and overwrite", () => {
  it("buildUserMessage injects the verified passage with a verbatim instruction", () => {
    const job = { resourceType: "annotation-task", year: 8, subject: "english" };
    const sourced = {
      passage: "Two roads diverged",
      selection: { title: "The Road Not Taken", author: "Robert Frost" },
      sourceName: "Wikisource — The Road Not Taken",
      sourceUrl: "https://en.wikisource.org/wiki/x",
    };
    const msg = buildUserMessage(job, null, sourced);
    assert.match(msg, /VERIFIED PUBLIC-DOMAIN SOURCE TEXT/);
    assert.match(msg, /Two roads diverged/);
    assert.match(msg, /The Road Not Taken/);
  });

  it("applySourcedPassage overwrites the model's passage fields with source bytes", () => {
    const parsed = { passageText: "model invented text", passageTitle: "Wrong", tasks: [] };
    applySourcedPassage(parsed, {
      passage: "the real verified passage",
      selection: { title: "Real Title", author: "Real Author" },
      sourceName: "Wikisource — Real Title",
      sourceUrl: "https://en.wikisource.org/wiki/real",
    });
    assert.equal(parsed.passageText, "the real verified passage");
    assert.equal(parsed.passageTitle, "Real Title");
    assert.equal(parsed.passageAuthor, "Real Author");
    // The rendered attribution names where the text came from, not the link.
    // The canonical URL is kept on the job document for auditing instead.
    assert.equal(parsed.passageSource, "Wikisource — Real Title");
    assert.doesNotMatch(parsed.passageSource, /https?:/);
  });
});
