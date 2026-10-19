"use strict";

// RES-45: maths the renderer falls back on must be repaired before a resource
// becomes Ready, or the job fails with the expressions named. Production job
// gNEDlAVOWGQVoGBobpTI shipped Q27 as frac(a^(6))(27|b|^(9)) with only a
// warning.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { buildResourceDocx } = require("../../src/resources/builder");
const { zipEntries } = require("../../src/resources/builder/docxText");
const { buildDocxWithDiagramReliability, runGenerationPipeline } = require("../../src/resources");
const { inlineScriptSegments, parseMath, normaliseLaTeXCommands } = require("../../src/resources/mathNotation");
const { affectedFields, repairMathFallbacks } = require("../../src/resources/mathRepair");

const clock = () => new Date("2026-10-20T00:00:00.000Z");
const Q27 = String.raw`\frac{a^{6}}{27|b|^{9}}`;
const BROKEN = "Broken x^{2 + 1 here.";

function documentXml(buffer) {
  return zipEntries(buffer).find((entry) => entry.name === "word/document.xml").read();
}

function plainText(xml) {
  return (xml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join(" ");
}

function worksheet(stems, answers = []) {
  return {
    title: "Index Laws",
    subject: "maths",
    year: 9,
    topic: "Index laws",
    totalMarks: stems.length,
    questions: stems.map((stem, i) => ({ number: i + 1, stem, marks: 1, workingLines: 1, parts: null })),
    answers: (answers.length ? answers : stems.map(() => "See working"))
      .map((answer, i) => ({ questionNumber: i + 1, partLabel: null, answer })),
  };
}

const OPTIONS = { studentName: "Test Student", subject: "maths", year: 9, answerMode: "included" };

function fakeStorage() {
  const saved = [];
  return {
    saved,
    bucket() {
      return {
        file(path) {
          return {
            async download() { return [Buffer.from("")]; },
            async save(buffer, options) { saved.push({ path, buffer, options }); },
          };
        },
      };
    },
  };
}

describe("absolute values with powers (Q27)", () => {
  it("parses |b|^{9} inside a fraction, a root and on its own", () => {
    for (const source of [Q27, "|b|^{9}", String.raw`\sqrt{|x|^{2}}`, "|x^2 - 4|^{3}"]) {
      const parsed = parseMath(normaliseLaTeXCommands(source));
      assert.equal(parsed.ok, true, `${source}: ${parsed.error}`);
    }
    const [frac] = parseMath(normaliseLaTeXCommands(Q27)).nodes;
    const power = frac.den.find((node) => node.type === "script");
    assert.deepEqual(power.base, [{ type: "paren", open: "|", close: "|", children: [{ type: "text", value: "b" }] }]);
    assert.deepEqual(power.sup, [{ type: "text", value: "9" }]);
  });

  it("leaves bars without a power as they were", () => {
    assert.deepEqual(parseMath("|a| + |b|").nodes, [{ type: "text", value: "|a| + |b|" }]);
    assert.equal(JSON.stringify(parseMath("P(A|B)").nodes).includes('"open":"|"'), false);
  });

  it("renders Q27 as a Word equation with no fallback", async () => {
    const mathIssues = [];
    const buffer = await buildResourceDocx("worksheet", worksheet([`Simplify ${Q27}.`], [`${Q27}`]), { ...OPTIONS, mathIssues });
    const xml = documentXml(buffer);
    assert.deepEqual(mathIssues, []);
    assert.doesNotMatch(plainText(xml), /frac|\^\(/);
    assert.match(xml, /<m:f>/);
    assert.match(xml, /<m:sSup>/);
  });

  it("raises the power on |b| in headings and labels", () => {
    const segments = inlineScriptSegments.withoutRecording("Simplify |b|^{9}");
    assert.deepEqual(segments, [{ text: "Simplify |b|", level: [] }, { text: "9", level: ["sup"] }]);
  });
});

describe("maths repair before Ready", () => {
  it("sends only the fields holding the broken notation", async () => {
    const resource = worksheet(["Fine x^2.", BROKEN, "Also fine."]);
    const calls = [];
    const changed = await repairMathFallbacks({
      resource,
      issues: [{ location: "Q2", source: "x^{", shownAs: "x^(" }],
      round: 1,
      attempt: 1,
      model: "claude-opus-5-5",
      callAi: async (request) => {
        calls.push(request);
        return { parsed: { fixes: [{ index: 1, text: "Broken x^{2 + 1} here." }] } };
      },
    });
    assert.equal(changed, 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].userMessage, /\(Q2\) could not typeset: x\^\{/);
    assert.match(calls[0].userMessage, /Broken x\^\{2 \+ 1 here\./);
    assert.doesNotMatch(calls[0].userMessage, /Fine x\^2|Also fine/);
    assert.equal(resource.questions[1].stem, "Broken x^{2 + 1} here.");
    assert.equal(resource.questions[0].stem, "Fine x^2.");
  });

  it("ignores a rewrite that is no longer the same text", async () => {
    const resource = worksheet([BROKEN]);
    const changed = await repairMathFallbacks({
      resource,
      issues: [{ location: "Q1", source: "x^{", shownAs: "x^(" }],
      round: 1,
      attempt: 1,
      callAi: async () => ({ parsed: { fixes: [{ index: 1, text: "x" }] } }),
    });
    assert.equal(changed, 0);
    assert.equal(resource.questions[0].stem, BROKEN);
  });

  it("finds fields through the builder's text cleaning", () => {
    const resource = worksheet(["Broken  x^{2 + 1\nhere."]);
    const fields = affectedFields(resource, [{ location: "Q1", source: "x^{2 + 1 here.", shownAs: "" }]);
    assert.deepEqual(fields.map((field) => field.path), [["questions", 0, "stem"]]);
  });

  it("rebuilds with the repaired expression and returns the JSON it built", async () => {
    const parsed = worksheet(["Fine x^2.", BROKEN]);
    const rounds = [];
    const built = await buildDocxWithDiagramReliability({
      resourceType: "worksheet",
      parsed,
      options: OPTIONS,
      buildDocx: buildResourceDocx,
      repairMath: async ({ resource, issues, round }) => {
        rounds.push({ round, issues });
        resource.questions[1].stem = "Broken x^{2 + 1} here.";
        return 1;
      },
    });
    assert.equal(rounds.length, 1);
    assert.deepEqual(rounds[0].issues.map((issue) => issue.location), ["Q2"]);
    assert.deepEqual(built.warnings, []);
    assert.equal(built.resource.questions[1].stem, "Broken x^{2 + 1} here.");
    assert.equal(parsed.questions[1].stem, BROKEN, "the caller's copy is untouched");
    assert.doesNotMatch(plainText(documentXml(built.buffer)), /\^\(/);
  });

  it("fails after the bounded rounds when fallbacks remain", async () => {
    let rounds = 0;
    await assert.rejects(
      buildDocxWithDiagramReliability({
        resourceType: "worksheet",
        parsed: worksheet([BROKEN]),
        options: OPTIONS,
        buildDocx: buildResourceDocx,
        repairMath: async ({ resource }) => {
          rounds += 1;
          resource.questions[0].stem = `Broken x^{2 + ${rounds} here.`;
          return 1;
        },
      }),
      (err) => {
        assert.equal(err.code, "RESOURCE_MATH_UNRESOLVED");
        assert.equal(err.resourceControl, true);
        assert.match(err.message, /document was held back: Q1 "x\^\{"/);
        assert.match(err.message, /Press Retry/);
        assert.equal(err.mathIssues[0].location, "Q1");
        return true;
      }
    );
    assert.equal(rounds, 2);
  });

  it("fails at once when the repair changes nothing", async () => {
    await assert.rejects(
      buildDocxWithDiagramReliability({
        resourceType: "worksheet",
        parsed: worksheet([BROKEN]),
        options: OPTIONS,
        buildDocx: buildResourceDocx,
        repairMath: async () => 0,
      }),
      { code: "RESOURCE_MATH_UNRESOLVED" }
    );
  });
});

describe("generation pipeline (RES-45)", () => {
  const job = {
    jobId: "job-45",
    attemptId: "attempt-1",
    attemptCount: 1,
    createdBy: "tutor-1",
    studentName: "Test Student",
    subject: "maths",
    year: 9,
    resourceType: "worksheet",
    answerMode: "included",
    customPrompt: "Index laws.",
  };

  it("repairs the broken expression, uploads once and stores the built JSON", async () => {
    const storage = fakeStorage();
    const generated = worksheet(["Fine x^2.", BROKEN], ["x^2", "7"]);
    const calls = [];
    const result = await runGenerationPipeline(job, {
      storage,
      clock,
      callAi: async (request) => {
        calls.push(request.stageLabel || "generate");
        if (/^Fixing maths/.test(request.stageLabel || "")) {
          return { parsed: { fixes: [{ index: 1, text: "Broken x^{2 + 1} here." }] } };
        }
        return { parsed: generated, raw: JSON.stringify(generated) };
      },
    });
    assert.deepEqual(calls.filter((label) => /^Fixing maths/.test(label)), ["Fixing maths formatting in 1 place"]);
    assert.equal(storage.saved.length, 1);
    assert.deepEqual(result.warnings.filter((w) => w.code === "MATH_FALLBACK"), []);
    const stored = JSON.parse(result.generatedJson);
    assert.equal(stored.questions[1].stem, "Broken x^{2 + 1} here.");
    assert.equal(stored.questions[0].stem, "Fine x^2.");
  });

  it("keeps the DOCX unavailable when the maths can't be repaired", async () => {
    const storage = fakeStorage();
    const generated = worksheet([BROKEN], ["7"]);
    await assert.rejects(
      runGenerationPipeline(job, {
        storage,
        clock,
        callAi: async (request) => (/^Fixing maths/.test(request.stageLabel || "")
          ? { parsed: { fixes: [] } }
          : { parsed: generated, raw: JSON.stringify(generated) }),
      }),
      { code: "RESOURCE_MATH_UNRESOLVED" }
    );
    assert.deepEqual(storage.saved, []);
  });
});
