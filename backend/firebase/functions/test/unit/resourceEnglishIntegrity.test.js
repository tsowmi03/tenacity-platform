"use strict";

// RES-88, RES-98, RES-100 and the RES-11 sourcing fixes, from the English
// papers of 6-7 November 2026.

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  excerptOpening,
  readsAsBodyText,
  resolveGutenbergBook,
  stripGutenbergBoilerplate,
  unwrapProse,
  STIMULUS_PLAN_SYSTEM_PROMPT,
} = require("../../src/resources/publicDomainText");
const {
  normaliseStimulusAttribution,
  referencedTextNumbers,
  removeUnusedStimulusTexts,
  stimulusMissingSourceLine,
  textSourceLine,
} = require("../../src/resources/stimulusIntegrity");
const { ENGLISH_GUIDANCE, stripStructureGuidance } = require("../../src/resources/englishGuidance");
const { applySourcedStimulus } = require("../../src/resources/index");

const narration = (n) =>
  `Narrative paragraph ${n} follows the boy along the fence. He dips the brush and sighs, and the long board stretches away from him in the morning sun.`;

// The shape of Project Gutenberg's Tom Sawyer: a contents list of one
// paragraph per chapter (one of them short), an illustrations list, a preface,
// then the chapters themselves.
function tomSawyerLike() {
  const contents = [
    "CHAPTER I. Y-o-u-u Tom—Aunt Polly Decides Upon Her Duty—Tom Practices Music—The Challenge—A Private Entrance",
    "CHAPTER II. Strong Temptations—Strategic Movements—The Innocents Beguiled",
    "CHAPTER XVI. A Day’s Amusements—Tom Reveals a Secret—The Pirates take a Lesson—A Night Surprise—An Indian War",
    "CHAPTER XIX. Tom Tells the Truth",
    "CHAPTER XX. Becky in a Dilemma—Tom’s Nobility Asserts Itself",
    "CHAPTER XXI. Youthful Eloquence—Compositions by the Young Ladies—A Lengthy Vision—The Boy’s Vengeance Satisfied",
  ];
  return [
    "CONTENTS",
    ...contents,
    "ILLUSTRATIONS",
    "Tom at Home Aunt Polly Beguiled A Good Opportunity Who’s Afraid Late Home Mary The Glorious Whitewasher Tom Contemplates",
    "PREFACE",
    "Most of the adventures recorded in this book really occurred; one or two were experiences of my own, the rest those of boys who were schoolmates of mine. Huck Finn is drawn from life; Tom Sawyer also, but not from an individual.",
    "CHAPTER I.",
    "“TOM!”",
    "No answer.",
    "The old lady pulled her spectacles down and looked over them about the room; then she put them up and looked out under them, and the boy was nowhere to be seen in the room at all.",
    narration(1),
    narration(2),
    "CHAPTER II.",
    "Saturday morning was come, and all the summer world was bright and fresh, and brimming with life. There was a song in every heart, and cheer in every face.",
    narration(3),
    narration(4),
    narration(5),
  ].join("\n\n");
}

describe("excerpting a novel (RES-88)", () => {
  it("never starts inside the contents list, even at a short contents entry", () => {
    const out = excerptOpening(tomSawyerLike(), 200, "The Adventures of Tom Sawyer");
    assert.match(out, /^The old lady pulled her spectacles down/);
    assert.doesNotMatch(out, /CHAPTER XX|Tom Tells the Truth|ILLUSTRATIONS|Glorious Whitewasher/);
    assert.equal(readsAsBodyText(out), true);
  });

  it("skips a merged contents list even when an entry holds an abbreviation", () => {
    const collection = [
      "Contents",
      "At the Bay The Garden-Party The Daughters of the Late Colonel Mr. and Mrs. Dove The Young Girl Life of Ma Parker Marriage à la Mode The Voyage Miss Brill Her First Ball The Lady’s Maid",
      "At the Bay",
      "I",
      "Very early morning. The sun was not yet risen, and the whole of the bay was hidden under a white sea-mist.",
      narration(1),
      narration(2),
    ].join("\n\n");
    const out = excerptOpening(collection, 200, "The Garden Party and Other Stories");
    assert.match(out, /^Very early morning/);
    assert.doesNotMatch(out, /Lady’s Maid/);
  });

  it("starts at the chapter the planner named", () => {
    const out = excerptOpening(tomSawyerLike(), 200, "The Adventures of Tom Sawyer", { pieceTitle: "Chapter II (The Glorious Whitewasher)" });
    assert.match(out, /^Saturday morning was come/);
  });

  it("recognises a contents page or an illustrations list as not body text", () => {
    const contents = [
      "CHAPTER XVI. A Day’s Amusements—Tom Reveals a Secret—The Pirates take a Lesson—A Night Surprise—An Indian War",
      "CHAPTER XVII. Memories of the Lost Heroes—The Point in Tom’s Secret",
      "CHAPTER XVIII. Tom’s Feelings Investigated—Wonderful Dream—Becky Thatcher Overshadowed—Tom Becomes Jealous—Black Revenge",
      "CHAPTER XIX. Tom Tells the Truth",
    ].join("\n\n");
    assert.equal(readsAsBodyText(contents), false);
    assert.equal(readsAsBodyText(`ILLUSTRATIONS\n\nTom at Home\n\nAunt Polly Beguiled\n\n${narration(1)}`), false);
    assert.equal(readsAsBodyText([narration(1), "“TOM!”", "No answer.", narration(2)].join("\n\n")), true);
  });

  it("drops an etext note at the start of an old ebook and Gutenberg's italic underscores", () => {
    const raw = [
      "*** START OF THE PROJECT GUTENBERG EBOOK LINCOLN'S GETTYSBURG ADDRESS ***",
      "",
      "This is a retranscription of one of the first Project",
      "Gutenberg Etexts, offically dated December 31, 1974.",
      "",
      "",
      "Four score and seven years ago, our fathers brought forth",
      "upon this continent a new nation.",
      "*** END OF THE PROJECT GUTENBERG EBOOK LINCOLN'S GETTYSBURG ADDRESS ***",
    ].join("\n");
    assert.match(stripGutenbergBoilerplate(raw), /^Four score and seven years ago/);
    assert.equal(readsAsBodyText("This is a retranscription of one of the first Project Gutenberg Etexts, officially dated 1974."), false);
    assert.equal(unwrapProse("She seldom looked _through_ them; snake_case stays."), "She seldom looked through them; snake_case stays.");
  });
});

describe("finding a Gutenberg ebook when Gutendex is down (RES-11)", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it("falls back to Project Gutenberg's own catalogue search", async () => {
    const urls = [];
    global.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes("gutendex")) return { ok: false, status: 503 };
      return {
        ok: true,
        text: async () => `<feed>
          <entry><id>https://www.gutenberg.org/ebooks/7256.opds</id><title>The Gift of the Magi</title><content type="text">O. Henry</content></entry>
          <entry><id>https://www.gutenberg.org/ebooks/20831.opds</id><title>Short Stories of Various Types</title><content type="text">1777 downloads</content></entry>
        </feed>`,
      };
    };
    const match = await resolveGutenbergBook({
      title: "The Gift of the Magi",
      author: "O. Henry",
      queries: [{ query: "The Gift of the Magi O. Henry", matchTitle: "The Gift of the Magi" }],
    });
    assert.equal(match.matched, true);
    assert.equal(match.gutenbergId, 7256);
    assert.equal(match.textUrl, "https://www.gutenberg.org/cache/epub/7256/pg7256.txt");
    assert.ok(urls.some((u) => u.startsWith("https://www.gutenberg.org/ebooks/search.opds/")));
  });

  it("tells the planner how texts are fetched", () => {
    assert.match(STIMULUS_PLAN_SYSTEM_PROMPT, /own Gutenberg ebook/i);
    assert.match(STIMULUS_PLAN_SYSTEM_PROMPT, /name the chapter/);
    assert.match(STIMULUS_PLAN_SYSTEM_PROMPT, /at least 12 lines/);
  });
});

describe("stimulus source lines (RES-100)", () => {
  it("prints Tenacity Original for the generator's own text and a full line for a sourced one", () => {
    assert.equal(textSourceLine({ author: null, source: null }), "Tenacity Original");
    assert.equal(
      textSourceLine({ author: "Mark Twain", source: "Project Gutenberg: The Adventures of Tom Sawyer, Complete", licence: "Public domain" }),
      "Author: Mark Twain   |   Source: Project Gutenberg: The Adventures of Tom Sawyer, Complete   |   Public domain"
    );
  });

  it("strips an author or source the model typed onto its own text", () => {
    const stimulus = [
      { title: "Sourced", author: "Mark Twain", source: "Project Gutenberg", body: "x", verbatim: true },
      { title: "Model", author: "Robert Frost", source: "Collected Poems", body: "y" },
    ];
    assert.deepEqual(normaliseStimulusAttribution(stimulus), { originals: 1 });
    assert.equal(stimulus[0].author, "Mark Twain");
    assert.equal(stimulus[0].licence, "Public domain");
    assert.equal(stimulus[1].author, null);
    assert.equal(stimulus[1].source, null);
  });

  it("drops an 'original' tag the model put in its own text's title", () => {
    const stimulus = [
      { title: "A green space for our school (original speech)", body: "x" },
      { title: "Original Sin and Other Stories", body: "y" },
    ];
    normaliseStimulusAttribution(stimulus);
    assert.equal(stimulus[0].title, "A green space for our school");
    assert.equal(stimulus[1].title, "Original Sin and Other Stories");
  });

  it("names the archive and edition of a sourced text", () => {
    const parsed = { stimulus: [] };
    applySourcedStimulus(parsed, [
      { passage: "body", selection: { title: "The Adventures of Tom Sawyer", author: "Mark Twain", type: "short-story" }, source: "Project Gutenberg", sourceName: "The Adventures of Tom Sawyer, Complete", excerpted: true },
      { passage: "verse", selection: { title: "Ozymandias", author: "Shelley", type: "poem" }, source: "Wikisource", sourceName: "Wikisource — Ozymandias" },
    ]);
    assert.equal(parsed.stimulus[0].source, "Project Gutenberg: The Adventures of Tom Sawyer, Complete");
    assert.equal(parsed.stimulus[0].licence, "Public domain");
    assert.equal(parsed.stimulus[1].source, "Wikisource — Ozymandias");
  });

  it("finds an image that would print without a credit", () => {
    assert.deepEqual(stimulusMissingSourceLine([
      { kind: "image", label: "Image 1", title: "Poster" },
      { kind: "image", label: "Image 2", title: "Photo", source: "Wikimedia Commons" },
      { label: "Text 1", title: "Ours", body: "x" },
    ]), ["Image 1"]);
  });
});

describe("only the texts the questions use (RES-88)", () => {
  function paper() {
    return {
      stimulus: [
        { label: "Text 1", title: "Extract from The Adventures of Tom Sawyer", body: "contents" },
        { label: "Text 2", title: "Before the red light", body: "Leon" },
        { label: "Text 3", title: "A quiet place at lunch", body: "speech" },
        { kind: "image", label: "Image 1", title: "Poster", source: "Wikimedia Commons" },
      ],
      sections: [
        { title: "Section A", questions: [
          { number: 1, stem: "In Text 2, why does Leon close the door gently?" },
          { number: 2, stem: "Compare Texts 2 and 3.", parts: [{ label: "a", stem: "Quote Text 3." }] },
          { number: 3, stem: "Write a story inspired by Image 1." },
        ] },
      ],
      markingGuide: [{ questionNumber: 2, suggestedResponse: "Text 2 is quiet where Text 3 is public." }],
    };
  }

  it("removes the unused text and renumbers every reference", () => {
    const parsed = paper();
    const result = removeUnusedStimulusTexts(parsed);
    assert.deepEqual(result.removed, [{ label: "Text 1", title: "Extract from The Adventures of Tom Sawyer" }]);
    assert.deepEqual(parsed.stimulus.map((s) => s.label), ["Text 1", "Text 2", "Image 1"]);
    assert.deepEqual(parsed.stimulus.map((s) => s.title), ["Before the red light", "A quiet place at lunch", "Poster"]);
    const [q1, q2, q3] = parsed.sections[0].questions;
    assert.equal(q1.stem, "In Text 1, why does Leon close the door gently?");
    assert.equal(q2.stem, "Compare Texts 1 and 2.");
    assert.equal(q2.parts[0].stem, "Quote Text 2.");
    assert.equal(q3.stem, "Write a story inspired by Image 1.");
    assert.equal(parsed.markingGuide[0].suggestedResponse, "Text 1 is quiet where Text 2 is public.");
  });

  it("keeps a text the questions name by title", () => {
    const parsed = paper();
    parsed.sections[0].questions.push({ number: 4, stem: "What does the narrator of the extract from the adventures of tom sawyer want?" });
    assert.deepEqual(removeUnusedStimulusTexts(parsed).removed, []);
    assert.equal(parsed.stimulus.length, 4);
  });

  it("leaves a single text, or questions that never number the texts, alone", () => {
    assert.deepEqual(removeUnusedStimulusTexts({ stimulus: [{ title: "Only", body: "x" }], sections: [] }).removed, []);
    const unnumbered = { stimulus: [{ title: "A", body: "x" }, { title: "B", body: "y" }], questions: [{ number: 1, stem: "What happens in the extract?" }] };
    assert.deepEqual(removeUnusedStimulusTexts(unnumbered).removed, []);
    assert.equal(unnumbered.stimulus.length, 2);
  });

  it("reads lists and ranges of text numbers", () => {
    assert.deepEqual([...referencedTextNumbers(["Texts 1-3", "texts 5, 6 and 7", "Text 9"])].sort((a, b) => a - b), [1, 2, 3, 5, 6, 7, 9]);
  });
});

describe("questions give only the task (RES-98)", () => {
  it("tells the generator so, and keeps the structure in the marking", () => {
    assert.match(ENGLISH_GUIDANCE, /QUESTIONS STATE THE TASK ONLY/);
    assert.match(ENGLISH_GUIDANCE, /Never drop the structure from the marking criteria and model answers/);
  });

  it("removes coaching sentences from the 7 Nov Year 7 questions", () => {
    const parsed = {
      sections: [{ questions: [
        { number: 5, stem: "How does the writer show Amira's growing confidence during the group task? Begin with a thesis that answers the question. Support it with one ETA: Evidence, Technique, Analysis." },
        { number: 10, stem: "Study Image 1 in the stimulus booklet. Write a persuasive piece about an issue the image raises. You are not being asked to analyse the image's visual techniques.\n\nChoose an audience who could act on your argument. Begin with a thesis that states your position. Develop three body paragraphs, each with its own thesis.\n\nUse TETAL when planning each body paragraph: Thesis, Evidence, Technique, Analysis, Link. Each paragraph should link back to its own thesis." },
      ] }],
      markingGuide: [{ questionNumber: 5, markingCriteria: ["1 mark: a thesis that answers the question", "2 marks: one ETA"] }],
    };
    const result = stripStructureGuidance(parsed, { resourceType: "practice-paper", customPrompt: "Year 7 practice paper, 60 minutes." });
    assert.equal(result.questions, 2);
    const [q5, q10] = parsed.sections[0].questions;
    assert.equal(q5.stem, "How does the writer show Amira's growing confidence during the group task?");
    assert.equal(q10.stem, "Study Image 1 in the stimulus booklet. Write a persuasive piece about an issue the image raises.\n\nChoose an audience who could act on your argument.");
    assert.deepEqual(parsed.markingGuide[0].markingCriteria, ["1 mark: a thesis that answers the question", "2 marks: one ETA"]);
  });

  it("leaves a question that asks the student to write a thesis, and a tutor who asked for structure practice", () => {
    const thesisTask = { questions: [{ number: 1, stem: "Write a thesis statement for this question: How does Owen present war?" }] };
    assert.equal(stripStructureGuidance(thesisTask, { resourceType: "worksheet", customPrompt: "short answers" }).removed, 0);
    const asked = { questions: [{ number: 1, stem: "How is fear shown? Begin with a thesis." }] };
    assert.equal(stripStructureGuidance(asked, { resourceType: "worksheet", customPrompt: "Practise writing a thesis and ETAs" }).removed, 0);
    const scaffold = { questions: [{ number: 1, stem: "How is fear shown? Begin with a thesis." }] };
    assert.equal(stripStructureGuidance(scaffold, { resourceType: "essay-scaffold", customPrompt: "" }).removed, 0);
  });
});

describe("extract endings and piece titles (RES-88)", () => {
  it("does not stop on a paragraph that introduces what follows", () => {
    const long = (n) => `${narration(n)} ${narration(n + 100)}`;
    // Three long paragraphs (~174 words) leave the target (200) to be reached
    // on the paragraph ending in a colon.
    const paras = [long(1), long(2), long(3), "Then with a great flourish of his arms and a long whistle he was boat and captain and engine-bells combined, so he had to imagine himself giving the orders and executing them:", "“Stop her, sir! Ting-a-ling-ling!”", "The headway ran almost out, and he drew up slowly toward the sidewalk.", long(7)];
    const out = excerptOpening(paras.join("\n\n"), 200, "Title", { fromChapterStart: false });
    assert.match(out, /drew up slowly toward the sidewalk\.$/);
  });

  it("titles a text by its piece when the piece's own ebook was found", async () => {
    const { sourceGutenbergWork } = require("../../src/resources/publicDomainText");
    const realFetch = global.fetch;
    try {
      global.fetch = async (url) => {
        const u = String(url);
        if (u.includes("gutendex") && u.includes("Gettysburg")) {
          return { ok: true, json: async () => ({ results: [{ id: 4, title: "Lincoln's Gettysburg Address: Given November 19, 1863 on the battlefield near Gettysburg, Pennsylvania, USA", authors: [{ name: "Lincoln, Abraham" }], copyright: false, formats: { "text/plain; charset=us-ascii": "https://example.test/pg4.txt" }, download_count: 900 }] }) };
        }
        if (u === "https://example.test/pg4.txt") {
          return { ok: true, text: async () => "*** START OF THE PROJECT GUTENBERG EBOOK 4 ***\n\nLincoln's Gettysburg Address, given November 19, 1863\non the battlefield near Gettysburg, Pennsylvania, USA\n\n\nFour score and seven years ago, our fathers brought forth\nupon this continent a new nation, conceived in liberty, and dedicated to the proposition that all men are created equal.\n\nNow we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure.\n*** END OF THE PROJECT GUTENBERG EBOOK 4 ***" };
        }
        return { ok: true, json: async () => ({ results: [] }) };
      };
      const r = await sourceGutenbergWork({ selection: { title: "Speeches and Letters of Abraham Lincoln, 1832-1865", author: "Abraham Lincoln", type: "nonfiction", pieceTitle: "The Gettysburg Address", collectionHint: "Speeches and Letters of Abraham Lincoln" }, brief: { lengthWords: 270 } });
      assert.equal(r.ok, true);
      assert.equal(r.title, "The Gettysburg Address");
      assert.match(r.passage, /^Four score and seven years ago/);
    } finally {
      global.fetch = realFetch;
    }
  });
});
