"use strict";

// RES-49. The visual check: Claude reads the printed pages, the fixes it can
// place are applied once, and the rest become tutor warnings.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const { Document, Packer } = require("docx");

const {
  VISUAL_CHECK_STAGE_ID,
  findLayoutFaults,
  layoutWarnings,
  parseQuestionRef,
  planLayoutFixes,
  resolveQuestion,
} = require("../../src/resources/visualCheck");
const { responseLineCount } = require("../../src/resources/builder/shared");
const { layoutDiagramBlock, lineItems } = require("../../src/resources/builder/questionLayout");
const { runGenerationPipeline, runVisualCheck } = require("../../src/resources");

const fault = (kind, question = "", extra = {}) => ({ page: 3, kind, question, excerpt: "", description: "d", ...extra });

function paper() {
  return {
    title: "Year 8 Paper",
    subject: "maths",
    year: 8,
    questions: [
      { number: 1, stem: "Find the area.", marks: 2, diagram: { type: "source-image", image: Buffer.from("x"), width: 400, height: 300 } },
      { number: 2, stem: "Solve each equation.", marks: 4, parts: [
        { label: "a", stem: "3y = 18", marks: 1 },
        { label: "b", stem: "Sketch y = 2x.", marks: 3, diagram: { type: "number-plane" } },
      ] },
      { number: 3, stem: "Write \\frac{1}{2} as a decimal.", marks: 1 },
    ],
    answers: [{ questionNumber: 1, answer: "12" }],
  };
}

describe("question references", () => {
  it("reads the ways a page prints a question number", () => {
    assert.deepEqual(parseQuestionRef("7"), { number: 7, part: null });
    assert.deepEqual(parseQuestionRef("Q7"), { number: 7, part: null });
    assert.deepEqual(parseQuestionRef("Question 12"), { number: 12, part: null });
    assert.deepEqual(parseQuestionRef("7(b)"), { number: 7, part: "b" });
    assert.deepEqual(parseQuestionRef("7 b"), { number: 7, part: "b" });
    assert.deepEqual(parseQuestionRef("2(ii)"), { number: 2, part: "ii" });
    assert.equal(parseQuestionRef("the cover"), null);
  });

  it("finds a part, and refuses a number two questions share", () => {
    const resource = paper();
    assert.equal(resolveQuestion(resource, "2(b)").part, resource.questions[1].parts[1]);
    // A booklet's sub-topics restart their numbering.
    const booklet = { subTopics: [{ questions: [{ number: 1, stem: "a" }] }, { questions: [{ number: 1, stem: "b" }] }] };
    assert.equal(resolveQuestion(booklet, "1"), null);
    // Answer rows name questions but never are one.
    assert.equal(resolveQuestion(resource, "1").question, resource.questions[0]);
  });
});

describe("planLayoutFixes", () => {
  const plan = (resource, faults, subject = "maths") => planLayoutFixes({ resource, faults, subject, responseLineCount });

  it("prints a clipped or oversized diagram smaller, and a tiny one larger", () => {
    const resource = paper();
    const result = plan(resource, [fault("diagram_clipped", "1"), fault("diagram_too_small", "2(b)")]);
    assert.equal(result.applied.length, 2);
    assert.equal(resource.questions[0].diagram.printSize, "smaller");
    assert.equal(resource.questions[1].parts[1].diagram.printSize, "larger");
  });

  it("only resizes a diagram once", () => {
    const resource = paper();
    resource.questions[0].diagram.printSize = "smaller";
    const result = plan(resource, [fault("diagram_too_small", "1"), fault("diagram_clipped", "1")]);
    assert.equal(result.applied.length, 0);
    assert.equal(result.unresolved.length, 2);
  });

  it("starts the next question on a near-blank page by shrinking its diagram", () => {
    const resource = paper();
    assert.equal(plan(resource, [fault("blank_page", "1")]).applied.length, 1);
    assert.equal(resource.questions[0].diagram.printSize, "smaller");
    // No diagram to shrink: left for the tutor.
    assert.equal(plan(paper(), [fault("blank_page", "3")]).unresolved.length, 1);
  });

  it("adds or removes answer lines from what actually printed", () => {
    const resource = paper();
    assert.equal(responseLineCount(resource.questions[0]), 6);
    plan(resource, [fault("answer_space_short", "1"), fault("answer_space_excess", "2(a)")]);
    assert.equal(resource.questions[0].answerLines, 9);
    assert.equal(resource.questions[1].parts[0].answerLines, 2);
    assert.equal(responseLineCount(resource.questions[0]), 9, "the builder honours the adjustment");
  });

  it("swaps lines for blank space in maths only", () => {
    const resource = paper();
    plan(resource, [fault("answer_space_wrong_kind", "2(b)")]);
    assert.equal(resource.questions[1].parts[1].answerSpace, "blank");
    const english = { questions: [{ number: 1, stem: "Explain.", marks: 4 }] };
    assert.equal(plan(english, [fault("answer_space_wrong_kind", "1")], "english").unresolved.length, 1);
  });

  it("hands raw maths notation to the maths repair, and leaves English notation to the tutor", () => {
    const result = plan(paper(), [fault("raw_markup", "3", { excerpt: "\\frac{1}{2}" })]);
    assert.deepEqual(result.mathIssues.map((issue) => issue.source), ["\\frac{1}{2}"]);
    assert.equal(plan(paper(), [fault("raw_markup", "3", { excerpt: "**bold**" })], "english").unresolved.length, 1);
  });

  it("leaves faults with no fix, or no question it can place, to the tutor", () => {
    const result = plan(paper(), [fault("diagram_missing", "3"), fault("numbering"), fault("diagram_clipped", "9")]);
    assert.equal(result.applied.length, 0);
    assert.equal(result.unresolved.length, 3);
  });
});

describe("layoutWarnings", () => {
  it("names the page and question and says what to do", () => {
    const [warning] = layoutWarnings([fault("diagram_clipped", "7")]);
    assert.equal(warning.code, "VISUAL_LAYOUT_FAULT");
    assert.equal(warning.message, "Page 3, Question 7 has a diagram that is cut off. Resize it before printing.");
    const [raw] = layoutWarnings([fault("raw_markup", "", { page: 9, excerpt: "x^{2}" })]);
    assert.match(raw.message, /^Page 9 shows maths as raw code\. Retype it before printing\. \(“x\^\{2\}”\)$/);
  });
});

describe("findLayoutFaults", () => {
  it("sends the PDF as a document and keeps only well-formed, distinct faults", async () => {
    const requests = [];
    const callAi = async (request) => {
      requests.push(request);
      return { parsed: { faults: [
        fault("diagram_clipped", "4"),
        fault("diagram_clipped", "4"),
        { page: 2, kind: "not_a_kind", question: "", excerpt: "", description: "" },
        // An answers table read as answer space: no question, dropped.
        fault("answer_space_excess", ""),
        fault("raw_markup", "", { page: 0, excerpt: "\\sqrt{2}" }),
      ] } };
    };
    const faults = await findLayoutFaults({ pdfBuffer: Buffer.from("%PDF-1.7"), job: { subject: "maths", year: 8 }, callAi, model: "claude-sonnet-5-5" });
    assert.equal(faults.length, 2);
    assert.equal(faults[1].page, null);
    const [request] = requests;
    assert.equal(request.stageId, VISUAL_CHECK_STAGE_ID);
    assert.equal(request.bestEffort, true);
    const [doc] = request.messages[0].content;
    assert.equal(doc.type, "document");
    assert.equal(doc.source.media_type, "application/pdf");
    assert.equal(Buffer.from(doc.source.data, "base64").toString(), "%PDF-1.7");
    assert.ok(request.responseSchema.properties.faults);
  });

  it("refuses to run without an Anthropic model", async () => {
    await assert.rejects(findLayoutFaults({ pdfBuffer: Buffer.from("%PDF"), callAi: async () => ({}), model: null }), /No Anthropic model/);
  });
});

// The widths of the images a block lays out, in EMU.
async function imageWidths(elements) {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: elements }] }));
  const xml = await (await JSZip.loadAsync(buffer)).file("word/document.xml").async("string");
  return [...xml.matchAll(/<wp:extent cx="(\d+)"/g)].map((m) => Number(m[1]));
}

describe("printSize in the question layout", () => {
  const png = require("sharp")({ create: { width: 600, height: 400, channels: 3, background: "#fff" } }).png().toBuffer();
  const block = async (printSize) => layoutDiagramBlock({
    lead: [],
    follow: lineItems([], 400),
    diagram: { type: "source-image", image: await png, width: 600, height: 400, ...(printSize ? { printSize } : {}) },
    context: { label: "Q1" },
    alignBefore: 0,
  });

  it("prints smaller at two thirds and larger above the default", async () => {
    const [normal] = await imageWidths(await block(null));
    const [smaller] = await imageWidths(await block("smaller"));
    const [larger] = await imageWidths(await block("larger"));
    assert.ok(Math.abs(smaller / normal - 2 / 3) < 0.02, `${smaller} vs ${normal}`);
    assert.ok(larger > normal * 1.2, `${larger} vs ${normal}`);
  });
});

describe("runVisualCheck", () => {
  const job = { jobId: "job-1", subject: "maths", year: 8, resourceType: "worksheet" };
  const built = () => ({ buffer: Buffer.from("PK first"), warnings: [], resource: paper() });
  const converter = (log = []) => ({ async convert({ docxBuffer }) { log.push(docxBuffer.toString()); return Buffer.from(`%PDF of ${docxBuffer}`); } });

  it("skips without a converter, delivering the build unchanged", async () => {
    const original = built();
    const result = await runVisualCheck({ job, built: original, fileName: "a.docx", pdfConverter: null, callAi: async () => ({}), rebuild: async () => assert.fail("no rebuild") });
    assert.equal(result.built, original);
    assert.equal(result.pdf, null);
    assert.deepEqual(result.warnings, []);
  });

  it("delivers the first PDF as the preview when the layout is fine", async () => {
    const result = await runVisualCheck({ job, built: built(), fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => ({ parsed: { faults: [] } }), rebuild: async () => assert.fail("no rebuild") });
    assert.equal(result.pdf.toString(), "%PDF of PK first");
    assert.equal(result.summary.outcome, "passed");
  });

  // RES-40. The layout pass reads the converted pages before the model does.
  const header = ["Year 8 Paper", "Maths"];
  const page = (number, ...lines) => [...header, `Mei | Tenacity Tutoring - Determination Meets Success. Page ${number}`, ...lines].join("\n");
  const longPage = (number, first) => page(number, first, ...Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`));
  const pagesOf = (layouts) => async (pdf) => layouts[pdf.toString()];

  it("joins a section to a page left with a few lines, when that saves a page (RES-40)", async () => {
    const converted = [];
    let rebuiltFrom = null;
    const result = await runVisualCheck({
      job, built: built(), fileName: "a.docx", pdfConverter: converter(converted),
      callAi: async () => ({ parsed: { faults: [] } }),
      rebuild: async (resource) => { rebuiltFrom = resource; return { buffer: Buffer.from("PK joined"), warnings: [], resource }; },
      readPages: pagesOf({
        "%PDF of PK first": [longPage(1, "Stimulus booklet"), page(2, "the last two lines", "of the text."), longPage(3, "Section A")],
        "%PDF of PK joined": [longPage(1, "Stimulus booklet"), longPage(2, "the last two lines")],
      }),
    });
    assert.deepEqual(rebuiltFrom.layout, { joinBefore: ["Section A"] });
    assert.deepEqual(converted, ["PK first", "PK joined"]);
    assert.equal(result.built.buffer.toString(), "PK joined");
    assert.equal(result.pdf.toString(), "%PDF of PK joined", "the preview and the model's check use the joined pages");
    assert.equal(result.summary.outcome, "passed");
  });

  it("keeps the first build when joining saves no page, or the layout pass fails (RES-40)", async () => {
    const original = built();
    const same = [longPage(1, "Questions"), page(2, "one line"), longPage(3, "Answers")];
    const noGain = await runVisualCheck({
      job, built: original, fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => ({ parsed: { faults: [] } }),
      rebuild: async (resource) => ({ buffer: Buffer.from("PK joined"), warnings: [], resource }),
      readPages: pagesOf({ "%PDF of PK first": same, "%PDF of PK joined": same }),
    });
    assert.equal(noGain.built, original);
    assert.equal(noGain.pdf.toString(), "%PDF of PK first");

    const failed = await runVisualCheck({
      job, built: original, fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => ({ parsed: { faults: [] } }),
      rebuild: async () => assert.fail("no rebuild"),
      readPages: async () => { throw new Error("unreadable PDF"); },
    });
    assert.equal(failed.built, original);
    assert.equal(failed.summary.outcome, "passed");
  });

  it("fixes what it can, rebuilds once, previews the rebuild and warns about the rest", async () => {
    const converted = [];
    let rebuiltFrom = null;
    const result = await runVisualCheck({
      job, built: built(), fileName: "a.docx", pdfConverter: converter(converted),
      callAi: async () => ({ parsed: { faults: [fault("diagram_clipped", "1"), fault("diagram_missing", "3", { page: 5 })] } }),
      rebuild: async (resource) => { rebuiltFrom = resource; return { buffer: Buffer.from("PK second"), warnings: [], resource }; },
    });
    assert.equal(rebuiltFrom.questions[0].diagram.printSize, "smaller");
    assert.deepEqual(converted, ["PK first", "PK second"]);
    assert.equal(result.pdf.toString(), "%PDF of PK second");
    assert.equal(result.built.buffer.toString(), "PK second");
    assert.deepEqual(result.warnings.map((w) => w.message), ["Page 5, Question 3 refers to a diagram that isn't shown. Add it or reword the question before printing."]);
    assert.deepEqual({ ...result.summary, durationMs: 0, kinds: undefined }, { outcome: "warnings", faults: 2, fixed: 1, warned: 1, durationMs: 0, kinds: undefined });
  });

  it("counts raw notation fixed when the repair rewrote the field that printed it", async () => {
    const issues = [];
    let rebuiltStem = null;
    const result = await runVisualCheck({
      job, built: built(), fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => ({ parsed: { faults: [fault("raw_markup", "3", { excerpt: "\\frac{1}{2}" })] } }),
      // The usual repair: same notation, now delimited.
      repairMath: async ({ resource, issues: sent }) => { issues.push(...sent); resource.questions[2].stem = "Write $\\frac{1}{2}$ as a decimal."; return 1; },
      rebuild: async (resource) => { rebuiltStem = resource.questions[2].stem; return { buffer: Buffer.from("PK fixed"), warnings: [], resource }; },
    });
    assert.equal(issues.length, 1);
    assert.equal(rebuiltStem, "Write $\\frac{1}{2}$ as a decimal.");
    assert.equal(result.summary.fixed, 1);
    assert.equal(result.summary.warned, 0);
  });

  it("warns about raw notation the repair left alone", async () => {
    const result = await runVisualCheck({
      job, built: built(), fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => ({ parsed: { faults: [fault("raw_markup", "3", { excerpt: "\\frac{1}{2}" })] } }),
      repairMath: async () => 0,
      rebuild: async () => assert.fail("nothing to rebuild"),
    });
    assert.equal(result.summary.warned, 1);
    assert.match(result.warnings[0].message, /raw code/);
  });

  it("keeps the first build when the rebuild fails, and warns about every fault", async () => {
    const original = built();
    const result = await runVisualCheck({
      job, built: original, fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => ({ parsed: { faults: [fault("answer_space_short", "1")] } }),
      rebuild: async () => { throw new Error("build broke"); },
    });
    assert.equal(result.built, original);
    assert.equal(result.pdf.toString(), "%PDF of PK first");
    assert.equal(result.warnings.length, 1);
  });

  it("delivers without a check when the model call fails, but still keeps the preview", async () => {
    const result = await runVisualCheck({ job, built: built(), fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => { throw new Error("overloaded"); }, rebuild: async () => assert.fail("no rebuild") });
    assert.equal(result.pdf.toString(), "%PDF of PK first");
    assert.deepEqual(result.warnings, []);
    assert.equal(result.summary.reason, "check_failed");
  });

  it("lets a cancellation through", async () => {
    const cancelled = Object.assign(new Error("cancelled"), { resourceControl: true });
    await assert.rejects(runVisualCheck({ job, built: built(), fileName: "a.docx", pdfConverter: converter(),
      callAi: async () => { throw cancelled; }, rebuild: async () => null }), /cancelled/);
  });
});

describe("visual check in the generation pipeline", () => {
  const worksheet = {
    title: "Linear Equations Worksheet", subject: "maths", year: 8, topic: "Solving linear equations", totalMarks: 2,
    questions: [{ number: 1, stem: "Solve 2x + 3 = 11.", marks: 2, parts: null }],
    answers: [{ questionNumber: 1, partLabel: null, answer: "x = 4" }],
  };
  function storage() {
    const saved = [];
    return { saved, bucket: () => ({ file: (path) => ({ async save(buffer) { saved.push({ path, buffer }); }, async download() { return [Buffer.from("")]; } }) }) };
  }

  it("stores the checked PDF as the preview and adds the warnings to the job", async () => {
    const store = storage();
    const converted = [];
    const result = await runGenerationPipeline({
      jobId: "job-1", attemptId: "attempt-1", createdBy: "tutor-1", studentName: "Mei Tanaka", subject: "maths", year: 8,
      resourceType: "worksheet", model: "claude-sonnet-4-6", customPrompt: "",
    }, {
      storage: store, anthropicApiKey: "test-key", clock: () => new Date("2026-11-19T00:00:00Z"),
      pdfConverter: { async convert({ docxBuffer }) { converted.push(docxBuffer.length); return Buffer.from("%PDF-1.7 checked"); } },
      callAi: async (request) => (request.stageId === VISUAL_CHECK_STAGE_ID
        ? { parsed: { faults: [fault("answer_space_short", "1", { page: 2 }), fault("numbering", "", { page: 2 })] } }
        : { parsed: worksheet, raw: JSON.stringify(worksheet) }),
    });
    assert.equal(converted.length, 2, "converted before and after the fix");
    assert.equal(result.previewPath, result.outputPath.replace(/\.docx$/, ".pdf"));
    assert.deepEqual(store.saved.map((s) => s.path), [result.outputPath, result.previewPath]);
    assert.equal(JSON.parse(result.generatedJson).questions[0].answerLines, 9);
    assert.ok(result.warnings.some((w) => w.code === "VISUAL_LAYOUT_FAULT" && /numbering/.test(w.message)));
    assert.equal(result.visualCheck.fixed, 1);
  });
});
