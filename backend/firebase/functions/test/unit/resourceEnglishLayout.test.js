"use strict";

// RES-92 and RES-99: the English DOCX layout of the 6-7 November papers. Page
// 2 held only the "Stimulus booklet" heading because the whole Text 1 box
// moved to page 3, and an extended-response row of the marking guide ran over
// several pages with no headings or question number on the continued pages.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");

const { buildResourceDocx } = require("../../src/resources/builder");
const { makePassageGroups } = require("../../src/resources/builder/passage");
const { generatePlannedResource, stemHoldsPassage } = require("../../src/resources/plannedGeneration");

const sentence = (n) => `Sentence ${n} of the extract carries the narrative forward with ordinary words and a clear full stop.`;
const proseParagraph = (n) => [1, 2, 3, 4].map((i) => sentence(`${n}.${i}`)).join(" ");

function paper({ planLines = 40 } = {}) {
  const plan = [
    "- Thesis: The writer shows that choosing honesty costs the narrator something real.",
    ...Array.from({ length: planLines }, (_, i) => `- ETA: "quotation ${i + 1}" · technique ${i + 1} · analysis of what technique ${i + 1} does with this evidence in the story.`),
    "- Link: Each paragraph returns to the cost of honesty.",
  ].join("\n");
  return {
    title: "Year 8 English Practice Paper",
    subject: "english",
    year: 8,
    totalMarks: 22,
    timeAllowed: "60 minutes",
    topics: ["Reading", "Writing"],
    stimulus: [
      { label: "Text 1", textType: "prose", title: "Extract from The Adventures of Tom Sawyer", author: "Mark Twain", source: "Project Gutenberg: The Adventures of Tom Sawyer, Complete", licence: "Public domain", verbatim: true,
        body: Array.from({ length: 24 }, (_, i) => proseParagraph(i + 1)).join("\n\n") },
      { label: "Text 2", textType: "poem", title: "The Eagle", author: "Alfred, Lord Tennyson", source: "Wikisource — The Eagle", licence: "Public domain", verbatim: true,
        body: "He clasps the crag with crooked hands;\nClose to the sun in lonely lands,\nRing'd with the azure world, he stands.\n\nThe wrinkled sea beneath him crawls;\nHe watches from his mountain walls,\nAnd like a thunderbolt he falls." },
    ],
    sections: [
      { title: "Section A: Reading", questions: [{ number: 1, stem: "In Text 1, what does Tom do with the brush?", type: "short-answer", options: null, marks: 2, parts: null, diagram: null, diagramRequired: false }] },
      { title: "Section B: Writing", questions: [{ number: 2, stem: "Write a short story about a difficult choice.", type: "short-answer", options: null, marks: 20, parts: null, diagram: null, diagramRequired: false }] },
    ],
    markingGuide: [
      { questionNumber: 1, partLabel: null, suggestedResponse: "He dips it in the whitewash.", markingCriteria: ["1 mark: identifies the action", "1 mark: supports it from the text"], marks: 2 },
      { questionNumber: 2, partLabel: null, suggestedResponse: plan, markingCriteria: ["4 marks: a focused central idea", "4 marks: connected narrative stages", "9 marks: purposeful language techniques", "3 marks: opening, ending and expression"], marks: 20 },
    ],
  };
}

async function documentXml(resource) {
  const buffer = await buildResourceDocx("practice-paper", resource, { answerMode: "worked", studentName: "Test", showMarks: true });
  return (await JSZip.loadAsync(buffer)).file("word/document.xml").async("string");
}

// The <w:tbl> element whose text contains `marker`.
function tableContaining(xml, marker) {
  const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
  return tables.find((table) => table.includes(marker));
}

describe("stimulus booklet layout (RES-92)", () => {
  it("lays a long text out a paragraph per row, with nothing inside holding the whole box to the next page", async () => {
    const xml = await documentXml(paper());
    const box = tableContaining(xml, "Text 1: Extract from The Adventures of Tom Sawyer");
    assert.ok(box, "the Text 1 box is rendered");
    assert.equal((box.match(/<w:tr>/g) || []).length, 24, "one row per paragraph");
    // keepNext inside a table cell is what made LibreOffice move the whole box.
    assert.doesNotMatch(box, /<w:keepNext\/>/);
    // The opening row (title, source line, first paragraph) never splits.
    const firstRow = box.match(/<w:tr>[\s\S]*?<\/w:tr>/)[0];
    assert.match(firstRow, /<w:cantSplit\/>/);
    assert.match(firstRow, /Text 1: Extract from The Adventures of Tom Sawyer/);
    assert.match(firstRow, /Author: Mark Twain/);
    assert.match(firstRow, /Sentence 1\.1 of the extract/);
  });

  it("keeps each stanza of a poem in one piece", async () => {
    const xml = await documentXml(paper());
    const box = tableContaining(xml, "Text 2: The Eagle");
    const rows = box.match(/<w:tr>[\s\S]*?<\/w:tr>/g);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => /<w:cantSplit\/>/.test(row)));
    assert.match(rows[1], /The wrinkled sea beneath him crawls/);
  });

  it("holds the booklet's instruction to the first text and names what the booklet holds", async () => {
    const xml = await documentXml(paper());
    const at = xml.indexOf("Examine the following texts carefully");
    assert.ok(at > 0);
    const paragraphStart = xml.lastIndexOf("<w:p>", at);
    assert.match(xml.slice(paragraphStart, at), /<w:keepNext\/>/);
  });

  it("marks which passage groups must stay whole", () => {
    const groups = makePassageGroups({ label: "Text 1", title: "T", body: `Short opening.\n\n${"Long paragraph words ".repeat(60)}\n\nShort close.` });
    assert.equal(groups.length, 3);
    assert.deepEqual(groups.map((group) => group.keepTogether), [true, false, true]);
  });
});

describe("marking guide layout (RES-92)", () => {
  it("repeats the header row on every page", async () => {
    const xml = await documentXml(paper());
    const guide = tableContaining(xml, "Marking Criteria");
    const header = guide.match(/<w:tr>[\s\S]*?<\/w:tr>/)[0];
    assert.match(header, /<w:tblHeader\/>/);
    assert.match(header, /Suggested Response/);
  });

  it("lays a long extended-response row out full width, with the question number on every row", async () => {
    const xml = await documentXml(paper());
    const guide = tableContaining(xml, "Marking Criteria");
    const rows = guide.match(/<w:tr>[\s\S]*?<\/w:tr>/g);
    const q2 = rows.filter((row) => />Q2( cont\.)?</.test(row));
    assert.ok(q2.length >= 3, `Q2 runs over several rows (${q2.length})`);
    assert.match(q2[0], />Q2</);
    assert.ok(q2.slice(1).every((row) => />Q2 cont\.</.test(row)), "continued rows say so");
    assert.ok(q2.every((row) => /<w:gridSpan w:val="2"\/>/.test(row)), "the answer spans the response and criteria columns");
    assert.ok(q2.every((row) => /<w:cantSplit\/>/.test(row)), "each row stays on one page");
    assert.match(q2[0], /Suggested response/);
    assert.ok(q2.some((row) => /Marking criteria/.test(row) && /9 marks: purposeful language techniques/.test(row)));
    // A short row keeps the usual three columns.
    const q1 = rows.find((row) => />Q1</.test(row));
    assert.doesNotMatch(q1, /gridSpan/);
  });

  it("leaves a guide of short answers in three columns", async () => {
    const xml = await documentXml(paper({ planLines: 3 }));
    const guide = tableContaining(xml, "Marking Criteria");
    assert.doesNotMatch(guide, /Q2 cont\./);
    assert.doesNotMatch(guide, /gridSpan/);
  });
});

describe("a passage pasted into a question (RES-99)", () => {
  it("is recognised in the 7 Nov Year 7 shape and not in an ordinary long task", () => {
    const passage = Array.from({ length: 4 }, (_, i) => proseParagraph(i + 1)).join("\n\n");
    assert.equal(stemHoldsPassage({ stem: `Read the prose extract below.\n\n${passage}\n\nWhat happens when Toby tests the bridge?` }), true);
    assert.equal(stemHoldsPassage({ stem: "Study Image 1. Write a persuasive piece about an issue it raises.\n\nChoose an audience who could act on your argument.\n\nUse observations or examples to support your position." }), false);
  });

  it("sends the batch back so the passage goes in the booklet", async () => {
    const passage = Array.from({ length: 4 }, (_, i) => proseParagraph(i + 1)).join("\n\n");
    const englishPlan = { title: "Paper", clarification: "", timeAllowed: "30 minutes", topics: [{ name: "Reading", evidence: "paper" }],
      questions: [{ number: 1, topic: "Reading", section: "Section A: Reading", difficulty: "easy", marks: 2, focus: "detail", sourceIds: [], estimatedMinutes: 20 }] };
    const messages = [];
    let pastedSent = false;
    const callAi = async (req) => {
      if (req.systemPrompt.startsWith("Plan an educational")) return { parsed: englishPlan };
      if (req.systemPrompt.startsWith("Independently audit")) return { parsed: { scopePass: true, difficultyPass: true, issues: [], questions: [{ number: 1, coveredSourceIds: [], estimatedMinutes: 20 }] } };
      if (/SAVED PLAN/.test(req.userMessage)) {
        messages.push(req.userMessage);
        const pasted = !pastedSent;
        pastedSent = true;
        const result = { parsed: { title: "Paper", subject: "english", year: 7, totalMarks: 2, timeAllowed: "30 minutes",
          stimulus: pasted ? null : [{ title: "The bridge", author: null, source: null, body: passage }],
          sections: [{ title: "Section A: Reading", questions: [{ number: 1, marks: 2, type: "short-answer", options: null, parts: null,
            stem: pasted ? `Read the extract below.\n\n${passage}\n\nWhat is Toby testing?` : "In Text 1, what is Toby testing?" }] }], markingGuide: [] } };
        try { req.validateStageResult?.(result); } catch (err) { messages.push(err.reason || err.message); throw err; }
        return result;
      }
      return { parsed: { markingGuide: [{ questionNumber: 1, partLabel: null, suggestedResponse: "A cardboard bridge.", markingCriteria: ["2 marks: identifies it"], marks: 2 }] } };
    };
    // Retry once by hand: a plain caller does not loop on validation failures.
    const job = { jobId: "j", subject: "english", year: 7, resourceType: "practice-paper", answerMode: "worked", customPrompt: "paper" };
    const request = { model: "gpt-test", userMessage: "Write a Year 7 English paper.", systemPrompt: "" };
    await assert.rejects(generatePlannedResource({ job, hasStimulus: true, request, callAi }), { code: "RESOURCE_BATCH_INVALID" });
    assert.ok(messages.some((m) => /passage_in_question: Q1/.test(m)));
    const result = await generatePlannedResource({ job, hasStimulus: true, request, callAi });
    assert.equal(result.parsed.stimulus[0].title, "The bridge");
    assert.equal(result.parsed.sections[0].questions[0].stem, "In Text 1, what is Toby testing?");
  });
});

describe("a text reference every part repeats (RES-99)", () => {
  const { hoistSharedPartReference, hoistPartReferences } = require("../../src/resources/stimulusIntegrity");

  it("says it once, in the question, as the 8 Nov Year 7 Q1 needed", () => {
    const q = { number: 1, stem: "Select the correct answer to each question about Mole's spring-cleaning in Text 1.", parts: [
      { label: "a", stem: "In the opening paragraph of Text 1, what does Mole throw onto the floor?" },
      { label: "b", stem: "In the opening paragraph of Text 1, what has splashed onto Mole's black fur?" },
      { label: "c", stem: "In the opening paragraph of Text 1, how has the cleaning affected Mole's body?" },
    ] };
    assert.equal(hoistSharedPartReference(q), true);
    assert.equal(q.stem, "Refer to the opening paragraph of Text 1. Select the correct answer to each question about Mole's spring-cleaning.");
    assert.deepEqual(q.parts.map((p) => p.stem), ["What does Mole throw onto the floor?", "What has splashed onto Mole's black fur?", "How has the cleaning affected Mole's body?"]);
  });

  it("only trims the parts when the question already names the text", () => {
    const q = { stem: "In Text 1, identify the setting details in the opening paragraph.", parts: [
      { stem: "In Text 1, when does the scene take place?" }, { stem: "In Text 1, where is Cardiff Hill?" }] };
    hoistSharedPartReference(q);
    assert.equal(q.stem, "In Text 1, identify the setting details in the opening paragraph.");
    assert.deepEqual(q.parts.map((p) => p.stem), ["When does the scene take place?", "Where is Cardiff Hill?"]);
  });

  it("leaves parts that refer to different texts, or not all to one", () => {
    const mixed = { stem: "Compare the texts.", parts: [{ stem: "In Text 1, what?" }, { stem: "In Text 2, why?" }] };
    const partial = { stem: "Answer these.", parts: [{ stem: "In Text 1, what?" }, { stem: "Why does it matter?" }] };
    assert.equal(hoistSharedPartReference(mixed), false);
    assert.equal(hoistSharedPartReference(partial), false);
    assert.equal(mixed.parts[0].stem, "In Text 1, what?");
    assert.equal(partial.parts[0].stem, "In Text 1, what?");
  });

  // From review: a question naming several texts, or "Text 10", must not lose
  // the parts' "In Text 1".
  it("moves nothing when the question names a different text", () => {
    const both = { stem: "After reading Text 1 and Text 2, answer the following questions.", parts: [{ stem: "In Text 1, what?" }, { stem: "In Text 1, why?" }] };
    const ten = { stem: "Answer these about Text 10.", parts: [{ stem: "In Text 1, what?" }, { stem: "In Text 1, why?" }] };
    assert.equal(hoistSharedPartReference(both), false);
    assert.equal(hoistSharedPartReference(ten), false);
    assert.deepEqual(both.parts.map((p) => p.stem), ["In Text 1, what?", "In Text 1, why?"]);
    assert.deepEqual(ten.parts.map((p) => p.stem), ["In Text 1, what?", "In Text 1, why?"]);
    assert.equal(both.stem, "After reading Text 1 and Text 2, answer the following questions.");
  });

  it("walks every question in a paper and leaves the marking guide alone", () => {
    const parsed = { sections: [{ questions: [{ number: 1, stem: "Answer these.", parts: [{ stem: "In Text 1, what?" }, { stem: "In Text 1, why?" }] }] }],
      markingGuide: [{ questionNumber: 1, suggestedResponse: "In Text 1, the answer." }] };
    assert.deepEqual(hoistPartReferences(parsed), { questions: 1 });
    assert.equal(parsed.sections[0].questions[0].stem, "Refer to Text 1. Answer these.");
    assert.equal(parsed.markingGuide[0].suggestedResponse, "In Text 1, the answer.");
  });

  it("tells the generator to name a shared text once", () => {
    const { buildSystemPrompt } = require("../../src/resources/promptBuilder");
    const prompt = buildSystemPrompt("practice-paper", { year: 7, subject: "english", answerMode: "worked", hasStimulus: true });
    assert.match(prompt, /name it once in the question's own stem/);
  });
});

describe("stimulus booklet heading spacing", () => {
  it("sets the instruction a little below the heading band", async () => {
    const xml = await documentXml(paper());
    const at = xml.indexOf("Examine the following texts carefully");
    const paragraph = xml.slice(xml.lastIndexOf("<w:p>", at), at);
    assert.match(paragraph, /<w:spacing w:after="160" w:before="120"\/>/);
  });
});
