"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  stripGutenbergBoilerplate,
  extractNamedPiece,
  unwrapProse,
  stripGutenbergFrontMatter,
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

  it("selects via the model when no selection is supplied", async () => {
    const select = async () => ({ title: "Chosen", author: "Z", type: "short-story" });
    const gutenberg = async ({ selection }) => ({ ok: true, passage: "x", title: selection.title });
    const result = await sourceVerifiedText({ apiKey: "k", brief: {}, select, gutenberg, wikisource: async () => ({}) });
    assert.equal(result.selection.title, "Chosen");
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
});

describe("stimulus-set sourcing gate", () => {
  const job = { subject: "english", resourceType: "practice-paper", year: 10 };

  it("enables only for english practice papers with the flag on and no upload", () => {
    assert.equal(shouldSourceStimulusSet({ job, enablePdTextSourcing: true, hasUploadedContent: false }), true);
    assert.equal(shouldSourceStimulusSet({ job, enablePdTextSourcing: false, hasUploadedContent: false }), false);
    assert.equal(shouldSourceStimulusSet({ job, enablePdTextSourcing: true, hasUploadedContent: true }), false);
  });

  it("does not enable for maths or single-passage types", () => {
    assert.equal(shouldSourceStimulusSet({ job: { subject: "maths", resourceType: "practice-paper" }, enablePdTextSourcing: true, hasUploadedContent: false }), false);
    assert.equal(shouldSourceStimulusSet({ job: { subject: "english", resourceType: "annotation-task" }, enablePdTextSourcing: true, hasUploadedContent: false }), false);
  });
});

describe("maybeSourceStimulusSet", () => {
  const job = { year: 10, resourceType: "practice-paper", subject: "english" };

  it("sources several verified texts best-effort and reports the types requested", async () => {
    const requested = [];
    const sourceText = async ({ brief }) => {
      requested.push(brief.textType);
      return {
        ok: true,
        passage: `body-${brief.textType}`,
        selection: { title: `T-${brief.textType}`, author: "A", type: brief.textType === "poem" ? "poem" : "short-story" },
        sourceName: "Src",
        sourceUrl: "https://x",
      };
    };
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", sourceText });
    assert.equal(r.used, true);
    assert.ok(r.texts.length >= 2);
    assert.deepEqual(requested, ["poem", "short story"]);
  });

  it("skips texts that do not verify but keeps the ones that do", async () => {
    const sourceText = async ({ brief }) =>
      brief.textType === "poem"
        ? { ok: true, passage: "verse", selection: { title: "P", type: "poem" } }
        : { ok: false, passage: null };
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", sourceText });
    assert.equal(r.used, true);
    assert.equal(r.texts.length, 1);
  });

  it("returns used:false with a warning when nothing verifies", async () => {
    const sourceText = async () => ({ ok: false, passage: null });
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", sourceText });
    assert.equal(r.used, false);
    assert.match(r.warning, /No verified public-domain texts/);
  });

  it("never throws on per-text errors — degrades to fallback", async () => {
    const sourceText = async () => { throw new Error("network down"); };
    const r = await maybeSourceStimulusSet({ job, apiKey: "k", sourceText });
    assert.equal(r.used, false);
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

  it("applySourcedStimulus leaves the booklet untouched when nothing was sourced", () => {
    const parsed = { stimulus: [{ title: "kept", body: "kept body" }] };
    applySourcedStimulus(parsed, []);
    assert.equal(parsed.stimulus[0].title, "kept");
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
    assert.match(parsed.passageSource, /wikisource\.org\/wiki\/real/);
  });
});
