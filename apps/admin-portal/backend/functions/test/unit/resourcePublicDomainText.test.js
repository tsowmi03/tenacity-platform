"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  stripGutenbergBoilerplate,
  extractNamedPiece,
  sourceGutenbergWork,
} = require("../../src/resources/publicDomainText");
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
