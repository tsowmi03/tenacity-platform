"use strict";

// RES-101. A story named inside a collection is cut from its own heading.
// The fixture copies the layout of Project Gutenberg #1429, The Garden Party,
// and Other Stories: title page, epigraph, dedication and contents list, then
// each story under a heading set off by four blank lines. The book's heading is
// "The Garden-Party"; the planner names it "The Garden Party".

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  extractNamedPiece,
  isNamedPieceInCollection,
  sourceGutenbergWork,
} = require("../../src/resources/publicDomainText");

const wrap = (text) => text.match(/.{1,70}(?:\s|$)/g).map((line) => line.trim()).join("\n");
const para = (seed, n = 6) => wrap(Array.from({ length: n }, (_, i) => `${seed} sentence ${i + 1} runs on with ordinary words about the day.`).join(" "));

const BOOK = [
  "*** START OF THE PROJECT GUTENBERG EBOOK 1429 ***",
  "",
  "The Garden Party",
  "",
  "AND OTHER STORIES",
  "",
  "by Katherine Mansfield",
  "",
  "_Montaigne dit que les hommes vont béant",
  "aux choses futures_",
  "",
  "To John Middleton Murry",
  "",
  "",
  "Contents",
  "",
  " At the Bay",
  " The Garden-Party",
  " The Daughters of the Late Colonel",
  " Miss Brill",
  "",
  "",
  "",
  "",
  "At the Bay",
  "",
  "I",
  "",
  "",
  "Very early morning. The sun was not yet risen, and the whole of Crescent Bay was hidden under a white sea-mist.",
  "",
  para("Bay opening", 30),
  "",
  "",
  "II",
  "",
  para("Bay second part", 30),
  "",
  "",
  "",
  "",
  "The Garden-Party",
  "",
  "",
  "And after all the weather was ideal. They could not have had a more",
  "perfect day for a garden-party if they had ordered it.",
  "",
  para("Garden party", 40),
  "",
  "“Stop the garden-party, of course.” Why did Jose pretend?",
  "",
  para("Laura's walk", 40),
  "",
  "",
  "",
  "",
  "The Daughters of the Late Colonel",
  "",
  "",
  para("Daughters", 30),
  "",
  "",
  "",
  "",
  "Miss Brill",
  "",
  "",
  para("Miss Brill", 30),
  "*** END OF THE PROJECT GUTENBERG EBOOK 1429 ***",
].join("\n");

const SELECTION = {
  title: "The Garden Party",
  author: "Katherine Mansfield",
  type: "short-story",
  standaloneOnGutenberg: false,
  collectionHint: "The Garden Party and Other Stories",
  pieceTitle: "The Garden Party",
  approxWordCount: 600,
};

async function withGutenberg({ title, body }, run) {
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("gutendex")) {
      return { ok: true, json: async () => ({ results: [{ id: 1429, title, authors: [{ name: "Mansfield, Katherine" }], copyright: false, formats: { "text/plain; charset=utf-8": "https://example.test/pg1429.txt" }, download_count: 900 }] }) };
    }
    if (u === "https://example.test/pg1429.txt") return { ok: true, text: async () => body };
    return { ok: true, json: async () => ({ results: [] }) };
  };
  try {
    return await run();
  } finally {
    global.fetch = realFetch;
  }
}

describe("a story named inside a collection (RES-101)", () => {
  it("cuts the story from its own heading, not the title page or contents list", () => {
    const { text } = extractNamedPiece(BOOK, "The Garden Party");
    assert.ok(text, "expected a slice");
    assert.match(text, /^And after all the weather was ideal/);
    assert.match(text, /Laura's walk sentence/);
    assert.doesNotMatch(text, /AND OTHER STORIES|Contents|Crescent Bay/);
    assert.doesNotMatch(text, /Daughters/, "stops where the next story starts");
  });

  it("matches a heading that differs in punctuation and article", () => {
    assert.ok(extractNamedPiece(BOOK, "Garden-party").text);
    assert.ok(extractNamedPiece(BOOK, "The Daughters of the Late Colonel").text.startsWith("Daughters sentence 1"));
  });

  it("knows a collection named after one of its stories from the story itself", () => {
    assert.equal(isNamedPieceInCollection("The Garden Party, and Other Stories", "The Garden Party"), true);
    assert.equal(isNamedPieceInCollection("The Complete Works of Edgar Allan Poe", "The Tell-Tale Heart"), true);
    assert.equal(isNamedPieceInCollection("The Adventures of Tom Sawyer, Complete", "The Adventures of Tom Sawyer"), false);
    assert.equal(isNamedPieceInCollection("Grimms' Fairy Tales", "Grimms' Fairy Tales"), false);
    assert.equal(isNamedPieceInCollection("Great Expectations", "Great Expectations"), false);
    assert.equal(isNamedPieceInCollection("Twenty Short Stories", "Chapter 2", { pieceTitle: "Chapter 2" }), false);
  });

  it("prints the named story, titled as that story", async () => {
    const r = await withGutenberg({ title: "The Garden Party, and Other Stories", body: BOOK }, () =>
      sourceGutenbergWork({ selection: SELECTION, brief: { lengthWords: 600 } }));
    assert.equal(r.ok, true);
    assert.equal(r.extraction.method.split("+")[0], "named-piece");
    assert.equal(r.title, "The Garden Party");
    assert.match(r.passage, /^And after all the weather was ideal/);
    assert.doesNotMatch(r.passage, /Crescent Bay|Bay opening/);
  });

  it("titles a story cut from a collection by the story, even when the planner named the book", async () => {
    const r = await withGutenberg({ title: "The Garden Party, and Other Stories", body: BOOK }, () =>
      sourceGutenbergWork({ selection: { ...SELECTION, title: "The Garden Party and Other Stories", pieceTitle: "Miss Brill" }, brief: { lengthWords: 300 } }));
    assert.equal(r.ok, true);
    assert.equal(r.title, "Miss Brill");
    assert.match(r.passage, /^Miss Brill sentence 1/);
  });

  it("fails rather than printing the book's opening when the story isn't there", async () => {
    const r = await withGutenberg({ title: "The Garden Party, and Other Stories", body: BOOK }, () =>
      sourceGutenbergWork({ selection: { ...SELECTION, title: "Prelude", pieceTitle: "Prelude" }, brief: { lengthWords: 600 } }));
    assert.equal(r.ok, false);
    assert.equal(r.extraction.method, "named-piece-failed");
  });

  it("still takes a whole standalone work from its opening", async () => {
    const novel = [
      "*** START OF THE PROJECT GUTENBERG EBOOK 1 ***",
      "",
      "A Short Tale",
      "",
      "by Someone",
      "",
      "",
      para("Standalone opening", 20),
      "*** END OF THE PROJECT GUTENBERG EBOOK 1 ***",
    ].join("\n");
    const r = await withGutenberg({ title: "A Short Tale", body: novel }, () =>
      sourceGutenbergWork({ selection: { ...SELECTION, title: "A Short Tale", pieceTitle: "A Short Tale", collectionHint: null }, brief: { lengthWords: 200 } }));
    assert.equal(r.ok, true);
    assert.equal(r.extraction.method.split("+")[0], "whole-work");
    assert.match(r.passage, /^Standalone opening sentence 1/);
  });
});

describe("a replaced named text is never named (RES-101)", () => {
  const { buildUserMessage } = require("../../src/resources/promptBuilder");
  const { renameReplacedTexts } = require("../../src/resources/index");
  const job = { resourceType: "practice-paper", year: 10, subject: "english", customPrompt: "A paper on \"The Garden Party\"." };

  it("tells the writer not to name the missing text, and what to use instead", () => {
    const original = buildUserMessage(job, [], null, { replacedNamedTexts: ["The Garden Party"], replacement: "original" });
    assert.match(original, /"The Garden Party" couldn't be found, and the tutor chose to write an original text instead/);
    assert.match(original, /Do not name "The Garden Party" anywhere/);
    const another = buildUserMessage(job, [], { texts: [{ title: "Miss Brill", author: "Katherine Mansfield", passage: "Although it was so brilliantly fine" }] }, { replacedNamedTexts: ["The Garden Party"], replacement: "another" });
    assert.match(another, /use the verified text supplied here instead/);
    assert.doesNotMatch(buildUserMessage(job, [], null), /NOT AVAILABLE/);
  });

  it("renames a resource title after the text actually printed", () => {
    const parsed = {
      title: "Year 10 English Practice Paper: The Garden Party",
      stimulus: [{ title: "The Welcome Desk", body: "…" }],
      questions: [{ number: 1, text: "How does Text 1 present class?" }, { number: 2, text: "In “The Garden Party”, how is Laura shown?" }],
    };
    const r = renameReplacedTexts(parsed, ["The Garden Party"]);
    assert.deepEqual(r, { retitled: true, stillNamed: 1 });
    assert.equal(parsed.title, "Year 10 English Practice Paper: The Welcome Desk");
  });

  it("drops the name when there's no printed title to use", () => {
    const parsed = { title: "Practice Paper: \"The Garden Party\"", questions: [] };
    assert.deepEqual(renameReplacedTexts(parsed, ["The Garden Party"]), { retitled: true, stillNamed: 0 });
    assert.equal(parsed.title, "Practice Paper");
  });

  it("leaves a title that doesn't name it alone", () => {
    const parsed = { title: "Practice Paper: Class and Perspective", questions: [] };
    assert.deepEqual(renameReplacedTexts(parsed, ["The Garden Party"]), { retitled: false, stillNamed: 0 });
  });
});
