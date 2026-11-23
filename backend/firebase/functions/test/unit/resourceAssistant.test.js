"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  CAPABILITIES_TOKEN_BUDGET,
  LOOKUP_TOOLS,
  capabilitiesOverview,
  estimateTokens,
  runLookupTool,
} = require("../../src/resources/resourceCapabilities");
const { normaliseAssistantReply, normaliseProposal, buildAssistantSystemPrompt } = require("../../src/resources/resourceAssistant");
const {
  describeCoverage,
  loadBankCoverage,
  resetBankCoverageCache,
  summariseEnglishStimuli,
  summariseMathsQuestions,
} = require("../../src/resources/bankCoverage");
const { promptVisibleDiagramEntries } = require("../../src/resources/diagramRegistry");
const { CHAT_LIMITS } = require("../../src/resources/chatPrompt");

describe("capabilities overview", () => {
  for (const subject of ["maths", "english"]) {
    it(`stays inside the token budget for ${subject}`, () => {
      const overview = capabilitiesOverview(subject);
      assert.ok(estimateTokens(overview) <= CAPABILITIES_TOKEN_BUDGET, `${estimateTokens(overview)} tokens`);
    });
  }

  it("lists only the types a subject can have", () => {
    assert.match(capabilitiesOverview("english"), /annotation-task/);
    assert.doesNotMatch(capabilitiesOverview("maths"), /annotation-task|essay-scaffold/);
  });

  it("says what isn't supported", () => {
    assert.match(capabilitiesOverview("maths"), /Not supported, so say so and offer the closest option/);
  });

  it("sits in the system prompt with the current form", () => {
    const prompt = buildAssistantSystemPrompt({
      form: { subject: "english", year: 6, resourceType: "topic-booklet", answerMode: "none", showMarks: false },
      studentName: "Sam",
      customPrompt: "",
      files: [],
      history: [],
    });
    assert.match(prompt, /What the generator can make for English/);
    assert.match(prompt, /The form right now .*: subject English, Year 6, type Topic Booklet, no answer section, marks hidden\./);
    assert.match(prompt, /Reference documents \(summaries\):\nNone attached\./);
  });
});

describe("lookup tools", () => {
  it("are the four the prompt names", () => {
    assert.deepEqual(LOOKUP_TOOLS.map((tool) => tool.name), ["get_resource_types", "get_bank_coverage", "get_diagram_types", "get_english_stimuli"]);
  });

  it("describe resource types from the descriptors", async () => {
    const { content, activity } = await runLookupTool("get_resource_types", { subject: "maths" });
    assert.match(content, /topic-booklet \(Topic Booklet\)/);
    assert.match(content, /• End-of-topic quiz/);
    assert.doesNotMatch(content, /annotation-task/);
    assert.equal(activity, "Checked maths resource types");
  });

  it("list every drawable diagram type from the registry", async () => {
    const { content } = await runLookupTool("get_diagram_types", {});
    for (const entry of promptVisibleDiagramEntries()) assert.match(content, new RegExp(`\\b${entry.type}\\b`));
  });

  it("apply the Years 5-6 stimulus rule", async () => {
    assert.match((await runLookupTool("get_english_stimuli", { year: 5 })).content, /not one tagged only Year 11 or 12/);
    assert.match((await runLookupTool("get_english_stimuli", { year: 9 })).content, /may be given any stimulus/);
  });

  it("report coverage, or that there's none yet", async () => {
    const none = await runLookupTool("get_bank_coverage", { subject: "maths", year: 8 }, { loadCoverage: async () => null });
    assert.match(none.content, /hasn't been summarised yet/);
    const coverage = { maths: summariseMathsQuestions([{ status: "live", diagramType: "solid_3d", years: [8] }]), english: summariseEnglishStimuli([]) };
    const some = await runLookupTool("get_bank_coverage", { subject: "maths", year: 8, topic: "volume" }, { loadCoverage: async () => coverage });
    assert.match(some.content, /3D solids.*: 1/);
  });

  it("flag an unknown tool as an error", async () => {
    assert.equal((await runLookupTool("delete_everything", {})).isError, true);
  });
});

describe("proposals", () => {
  it("clears the answer section and marks for a type without questions", () => {
    assert.deepEqual(
      normaliseProposal({ subject: "maths", resourceType: "study-guide", answerMode: "worked", showMarks: true, sections: ["A"], brief: "B" }),
      { subject: "maths", resourceType: "study-guide", answerMode: "none", showMarks: false, sections: ["A"], brief: "B" }
    );
  });

  it("moves an English-only type to English", () => {
    assert.equal(normaliseProposal({ subject: "maths", resourceType: "essay-scaffold", answerMode: "none", showMarks: false, sections: [], brief: "" }).subject, "english");
  });

  it("drops an unknown type", () => {
    assert.equal(normaliseProposal({ subject: "maths", resourceType: "quiz-show", brief: "x" }), null);
  });

  it("caps the brief, sections and suggestions", () => {
    const result = normaliseAssistantReply({
      reply: "  Here you go. ",
      proposal: {
        subject: "maths",
        resourceType: "worksheet",
        answerMode: "answers",
        showMarks: true,
        sections: Array.from({ length: 12 }, (_, i) => `Section ${i}`),
        brief: "p".repeat(CHAT_LIMITS.maxPromptChars + 50),
      },
      suggestions: ["Shorter", "", "x".repeat(CHAT_LIMITS.maxSuggestionChars + 1), "Harder", "Easier", "Extra"],
    }, { fallbackSubject: "maths" });
    assert.equal(result.reply, "Here you go.");
    assert.equal(result.proposal.brief.length, CHAT_LIMITS.maxPromptChars);
    assert.equal(result.proposal.sections.length, 8);
    assert.equal(result.proposedPrompt, result.proposal.brief);
    assert.deepEqual(result.suggestions, ["Shorter", "Harder", "Easier"]);
  });

  it("clips a reply to the length a transcript message may be, and rejects an empty one", () => {
    assert.equal(normaliseAssistantReply({ reply: "r".repeat(CHAT_LIMITS.maxMessageChars + 500) }).reply.length, CHAT_LIMITS.maxMessageChars);
    assert.throws(() => normaliseAssistantReply({ reply: "  " }), (err) => err.modelFailure === true);
  });
});

describe("bank coverage", () => {
  beforeEach(() => resetBankCoverageCache());

  it("counts live maths questions by category and year", () => {
    const summary = summariseMathsQuestions([
      { status: "live", diagramType: "shape_2d", years: [7, 8] },
      { status: "live", diagramType: "shape_2d", years: [8] },
      { status: "hidden", diagramType: "shape_2d", years: [8] },
      { status: "live", diagramType: "mystery", years: [] },
    ]);
    assert.equal(summary.total, 3);
    assert.deepEqual(summary.byCategory.shape_2d, { total: 2, byYear: { 7: 1, 8: 2 } });
    assert.equal(summary.byCategory.other.total, 1);
  });

  it("counts English stimuli a Years 5-6 student may use", () => {
    const summary = summariseEnglishStimuli([
      { status: "live", type: "poem", years: [12] },
      { status: "live", type: "poem", years: [8] },
      { status: "live", type: "poem", years: [] },
      { status: "retired", type: "poem", years: [] },
    ]);
    assert.deepEqual(summary.byType.poem, { total: 3, primaryUsable: 2 });
  });

  it("describes only the year asked for, and filters by topic", () => {
    const coverage = {
      maths: summariseMathsQuestions([
        { status: "live", diagramType: "shape_2d", years: [8] },
        { status: "live", diagramType: "data_display", years: [9] },
      ]),
      english: summariseEnglishStimuli([{ status: "live", type: "poster", years: [12] }]),
    };
    const year8 = describeCoverage(coverage, { subject: "maths", year: 8 });
    assert.match(year8, /2D and composite shapes.*: 1/);
    assert.doesNotMatch(year8, /column, line, pie/);
    assert.match(describeCoverage(coverage, { subject: "maths", year: 8, topic: "histogram" }), /none match/);
    assert.match(describeCoverage(coverage, { subject: "english", year: 5 }), /none match/);
    assert.match(describeCoverage(coverage, { subject: "english", year: 9 }), /poster.*: 1/);
  });

  it("caches the weekly summary between turns", async () => {
    let reads = 0;
    const db = { collection: () => ({ doc: () => ({ get: async () => { reads += 1; return { exists: true, data: () => ({ maths: {} }) }; } }) }) };
    await loadBankCoverage(db, { now: 0 });
    await loadBankCoverage(db, { now: 60_000 });
    assert.equal(reads, 1);
    await loadBankCoverage(db, { now: 11 * 60_000 });
    assert.equal(reads, 2);
  });
});

describe("assistant eval checks", () => {
  const { CASES, checkResult } = require("../../scripts/resourceAssistantEval");
  const unsupported = CASES.find((c) => c.kind === "unsupported");
  const chat = CASES.find((c) => c.id === "maths-chat-2");
  const proposal = { subject: "maths", resourceType: "worksheet", answerMode: "answers", showMarks: false, sections: ["Questions"], brief: "Ten questions." };

  it("has 5 unsupported requests and 5 chats per subject", () => {
    for (const subject of ["maths", "english"]) {
      assert.equal(CASES.filter((c) => c.form.subject === subject && c.kind === "unsupported").length, 5);
      assert.equal(CASES.filter((c) => c.form.subject === subject && c.kind === "chat").length, 5);
    }
  });

  it("passes a decline with an alternative, and fails a silent yes", () => {
    assert.deepEqual(checkResult(unsupported, { reply: "I can't make interactive quizzes, but I could make a worksheet instead.", proposal: null }), []);
    assert.deepEqual(checkResult(unsupported, { reply: "Sure, here it is.", proposal: null }), ["doesn't say it can't", "offers no alternative"]);
  });

  it("checks a chat's proposal against the expected types", () => {
    assert.deepEqual(checkResult(chat, { reply: "Here.", proposal }), []);
    assert.deepEqual(checkResult(chat, { reply: "Here.", proposal: { ...proposal, resourceType: "study-guide" } }), ["proposed study-guide; expected one of worksheet"]);
    assert.deepEqual(checkResult(chat, { reply: "Hm?", proposal: null }), ["no proposal"]);
  });
});

describe("assistant eval failures", () => {
  const { CASES, checkResult } = require("../../scripts/resourceAssistantEval");
  it("counts a failed call as a failure, whatever its error says", () => {
    const unsupported = CASES.find((c) => c.kind === "unsupported");
    const problems = checkResult(unsupported, { failed: true, reply: "400: send between_tools instead", proposal: null });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^call failed/);
  });
});
