"use strict";
const { it, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const rubric = require("../../scripts/qualityBenchmark/rubric");
const bench = require("../../scripts/qualityBenchmark");
const { RESOURCE_TYPES } = require("../../src/resources/modelMap");
const { ANSWER_MODES } = require("../../src/resources/answerMode");

const gradeWith = (scores, issues = []) => ({
  scores: Object.fromEntries(rubric.CRITERION_IDS.map((id, i) => [id, { score: scores[i], reason: "r" }])),
  issues,
  summary: "s",
});

describe("request set", () => {
  const requests = bench.loadRequests();
  it("has about twenty valid requests split across maths and English", () => {
    assert.ok(requests.length >= 18 && requests.length <= 24);
    const maths = requests.filter((r) => r.subject === "maths").length;
    assert.ok(maths >= 8 && requests.length - maths >= 8);
    for (const r of requests) {
      assert.ok(RESOURCE_TYPES.includes(r.resourceType), `${r.id} resourceType`);
      assert.ok(ANSWER_MODES.includes(r.answerMode), `${r.id} answerMode`);
      assert.ok(r.year >= 5 && r.year <= 10, `${r.id} year is one the portal accepts`);
    }
  });
  it("covers every year level from 5 to 10 in both subjects", () => {
    for (const subject of ["maths", "english"]) {
      const years = new Set(requests.filter((r) => r.subject === subject).map((r) => r.year));
      for (let y = 5; y <= 10; y++) assert.ok(years.has(y), `${subject} Year ${y}`);
    }
  });
  it("selects by id and subject, and rejects unknown ids", () => {
    assert.equal(bench.selectRequests(requests, { subject: "english" }).every((r) => r.subject === "english"), true);
    assert.deepEqual(bench.selectRequests(requests, { only: ["m01-y5-fractions-worksheet"] }).map((r) => r.id), ["m01-y5-fractions-worksheet"]);
    assert.throws(() => bench.selectRequests(requests, { only: ["nope"] }), /Unknown request/);
  });
  it("passes only job fields to the replay", () => {
    const input = bench.replayInput(requests[0]);
    assert.deepEqual(Object.keys(input).sort(), ["answerMode", "customPrompt", "resourceType", "showMarks", "subject", "year"]);
  });
});

describe("arguments", () => {
  it("parses options and rejects bad ones", () => {
    const o = bench.parseArgs(["--only", "a,b", "--subject", "maths", "--firebase-secrets"]);
    assert.deepEqual(o.only, ["a", "b"]);
    assert.equal(o.firebaseSecrets, true);
    assert.throws(() => bench.parseArgs(["--subject", "science"]), /maths or english/);
    assert.throws(() => bench.parseArgs(["--compare"]), /needs a value/);
    assert.throws(() => bench.parseArgs(["--grade-only", "x", "--output", "y"]), /drop --output/);
    assert.throws(() => bench.parseArgs(["--production"]), /Unknown option/);
  });
});

describe("grader", () => {
  it("sends the PDF before the request text, with structured output and adaptive thinking", () => {
    const params = rubric.buildGraderParams({ request: bench.loadRequests()[0], pdfBase64: "QUJD" });
    assert.equal(params.model, "claude-opus-5-5");
    assert.deepEqual(params.thinking, { type: "adaptive" });
    assert.equal(params.output_config.effort, "high");
    assert.equal(params.output_config.format.type, "json_schema");
    const [doc, text] = params.messages[0].content;
    assert.equal(doc.type, "document");
    assert.equal(doc.source.media_type, "application/pdf");
    assert.match(text.text, /m01-y5-fractions-worksheet/);
    assert.match(text.text, /stacked fractions/);
    assert.throws(() => rubric.buildGraderParams({ request: {}, pdfBase64: "" }), /pdfBase64/);
  });
  it("reads a valid grade and rejects refusals, truncation and bad JSON", () => {
    const grade = gradeWith([5, 4, 3, 4, 5, 4]);
    assert.deepEqual(rubric.readGradeMessage({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(grade) }] }), grade);
    assert.throws(() => rubric.readGradeMessage({ stop_reason: "refusal", stop_details: { category: "cyber" } }), { code: "GRADER_REFUSED" });
    assert.throws(() => rubric.readGradeMessage({ stop_reason: "max_tokens", content: [] }), { code: "GRADER_TRUNCATED" });
    assert.throws(() => rubric.readGradeMessage({ stop_reason: "end_turn", content: [{ type: "text", text: "{" }] }), { code: "GRADER_INVALID_JSON" });
    const bad = gradeWith([5, 4, 3, 4, 5, 4]); bad.scores.layout.score = 7;
    assert.throws(() => rubric.readGradeMessage({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(bad) }] }), /layout/);
  });
  it("schema requires a score for every criterion", () => {
    assert.deepEqual(rubric.GRADE_SCHEMA.properties.scores.required, rubric.CRITERION_IDS);
  });
});

describe("scoring and summary", () => {
  it("leaves not-applicable criteria out of the overall score", () => {
    assert.equal(rubric.overallScore(gradeWith([4, 4, 0, 5, 0, 3])), 4);
  });
  it("prices Claude usage and reports unknown models as null", () => {
    assert.equal(rubric.costOf("claude-opus-5-5", { inputTokens: 1e6, outputTokens: 1e5 }), 6);
    assert.equal(rubric.costOf("gpt-6.1-sol", { inputTokens: 1e6 }), null);
  });
  it("summarises by subject and criterion, counts failures and compares by id", () => {
    const results = [
      { id: "m1", subject: "maths", status: "graded", grade: gradeWith([5, 5, 5, 5, 5, 5], [{ page: 2, severity: "minor", criterion: "layout", description: "d" }]), graderCost: 0.3, generation: { warnings: 1, cost: { known: 0.5, unpricedModels: ["gpt-x"] } } },
      { id: "e1", subject: "english", status: "graded", grade: gradeWith([3, 3, 3, 3, 0, 3], [{ page: 1, severity: "major", criterion: "accuracy", description: "d" }]), graderCost: 0.2 },
      { id: "e2", subject: "english", status: "generation_failed", error: "RESOURCE_LOCAL_BUDGET" },
    ];
    const previous = { meta: { runId: "base" }, overall: 3.5, bySubject: { maths: 4, english: 3 }, byCriterion: { accuracy: 4 }, rows: [{ id: "m1", overall: 4 }] };
    const s = rubric.summariseRun(results, { previous, meta: { runId: "now" } });
    assert.deepEqual(s.counts, { requests: 3, graded: 2, failed: 1 });
    assert.equal(s.overall, 4);
    assert.deepEqual(s.bySubject, { maths: 5, english: 3 });
    assert.equal(s.byCriterion.answers, 5);
    // Only m1 was graded in both runs, so the averages compare m1 with m1.
    assert.equal(s.comparison.matchedRequests, 1);
    assert.equal(s.comparison.overall, 1);
    assert.equal(s.comparison.bySubject.english, null);
    assert.equal(s.comparison.rows.m1, 1);
    assert.equal(s.comparison.rows.e2, null);
    assert.equal(s.rows.find((r) => r.id === "e1").majorIssues, 1);
    assert.deepEqual(s.cost, { grader: 0.5, generationKnown: 0.5, unpricedModels: ["gpt-x"] });
    const md = rubric.renderMarkdown(s);
    assert.match(md, /\*\*Overall\*\* \| \*\*4\.00\*\* \(\+1\.00\)/);
    assert.match(md, /over the 1 request graded in both/);
    assert.match(md, /e2 \| generation_failed: RESOURCE_LOCAL_BUDGET/);
    assert.match(md, /not priced: gpt-x/);
  });
});

describe("runOne", () => {
  it("grades a replayed resource and records generation usage, without real providers", async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "res113-test-"));
    try {
      const request = bench.loadRequests()[0];
      const replay = async ({ output }) => {
        fs.mkdirSync(path.join(output, "provider-responses"), { recursive: true });
        fs.writeFileSync(path.join(output, "provider-responses", "1.json"), JSON.stringify({ model: "claude-opus-5-5", result: { model: "claude-opus-5-5", usage: { inputTokens: 1000, outputTokens: 500 } } }));
        fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ status: "complete", warnings: [{}], providerCalls: 1 }));
        fs.writeFileSync(path.join(output, "resource.docx"), "docx");
      };
      const client = { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: "text", text: JSON.stringify(gradeWith([4, 4, 4, 4, 4, 4])) }] }) }) } };
      // Stand in for LibreOffice: write the PDF where docxToPdf expects it.
      const fakeSoffice = path.join(runDir, "soffice.sh");
      fs.writeFileSync(fakeSoffice, "#!/bin/sh\nprev=\"\"\nfor a in \"$@\"; do [ \"$prev\" = \"--outdir\" ] && dir=\"$a\"; prev=\"$a\"; last=\"$a\"; done\ncp \"$last\" \"$dir/resource.pdf\"\n", { mode: 0o755 });
      const result = await bench.runOne(request, { runDir, gradeOnly: false, keys: {}, client, graderModel: "claude-opus-5-5", maxCalls: 5, replay, soffice: fakeSoffice });
      assert.equal(result.status, "graded", result.error);
      assert.equal(result.generation.warnings, 1);
      assert.equal(result.generation.byModel["claude-opus-5-5"].calls, 1);
      assert.equal(result.generation.cost.known, 0.014);
      assert.ok(fs.existsSync(path.join(runDir, request.id, "grade.json")));
    } finally { fs.rmSync(runDir, { recursive: true, force: true }); }
  });
  it("reports a failed generation without grading", async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "res113-test-"));
    try {
      const replay = async ({ output }) => { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ status: "failed", errorCode: "RESOURCE_X" })); };
      const result = await bench.runOne(bench.loadRequests()[1], { runDir, gradeOnly: false, keys: {}, client: null, graderModel: "m", maxCalls: 5, replay });
      assert.equal(result.status, "generation_failed");
      assert.equal(result.error, "RESOURCE_X");
    } finally { fs.rmSync(runDir, { recursive: true, force: true }); }
  });
});

describe("resume", () => {
  const ids = ["m01-y5-fractions-worksheet", "m02-y6-area-perimeter-diagnostic", "m03-y7-parallel-lines-worksheet"];
  const fakeClient = (calls) => ({ messages: { stream: () => { calls.grades++; return { finalMessage: async () => ({ stop_reason: "end_turn", usage: {}, content: [{ type: "text", text: JSON.stringify(gradeWith([4, 4, 4, 4, 4, 4])) }] }) }; } } });
  const fakeReplay = (calls) => async ({ output }) => {
    calls.generated++;
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ status: "complete", warnings: [] }));
    fs.writeFileSync(path.join(output, "resource.docx"), "docx");
  };
  const writeSoffice = (dir) => {
    const file = path.join(dir, "soffice.sh");
    fs.writeFileSync(file, "#!/bin/sh\nprev=\"\"\nfor a in \"$@\"; do [ \"$prev\" = \"--outdir\" ] && dir=\"$a\"; prev=\"$a\"; last=\"$a\"; done\ncp \"$last\" \"$dir/resource.pdf\"\n", { mode: 0o755 });
    return file;
  };

  it("reuses saved grades, grades finished resources and regenerates the rest, in one summary", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "res113-resume-"));
    const runDir = path.join(root, "run");
    try {
      // m01: graded earlier. m02: generated but never graded. m03: interrupted mid-generation.
      fs.mkdirSync(path.join(runDir, ids[0], "replay"), { recursive: true });
      fs.writeFileSync(path.join(runDir, ids[0], "replay", "resource.docx"), "docx");
      fs.writeFileSync(path.join(runDir, ids[0], "grade.json"), JSON.stringify({ rubricVersion: rubric.RUBRIC_VERSION, graderModel: rubric.GRADER_MODEL, grade: gradeWith([5, 5, 5, 5, 5, 5]), cost: 0.1 }));
      fs.mkdirSync(path.join(runDir, ids[1], "replay"), { recursive: true });
      fs.writeFileSync(path.join(runDir, ids[1], "replay", "resource.docx"), "docx");
      fs.mkdirSync(path.join(runDir, ids[2], "replay"), { recursive: true });
      fs.writeFileSync(path.join(runDir, ids[2], "replay", "job.json"), "{}");
      assert.equal(bench.resumeAction({ id: ids[0] }, runDir, { graderModel: rubric.GRADER_MODEL }), "reuse");
      assert.equal(bench.resumeAction({ id: ids[0] }, runDir, { graderModel: "other" }), "grade");
      assert.equal(bench.resumeAction({ id: ids[1] }, runDir, { graderModel: rubric.GRADER_MODEL }), "grade");
      assert.equal(bench.resumeAction({ id: ids[2] }, runDir, { graderModel: rubric.GRADER_MODEL }), "generate");

      const calls = { grades: 0, generated: 0 };
      const options = bench.parseArgs(["--resume", runDir, "--only", ids.join(",")]);
      const summary = await bench.runBenchmark(options, { keys: { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }, client: fakeClient(calls), replay: fakeReplay(calls), soffice: writeSoffice(root) });
      assert.deepEqual(calls, { grades: 2, generated: 1 });
      assert.deepEqual(summary.counts, { requests: 3, graded: 3, failed: 0 });
      assert.equal(summary.rows.find((r) => r.id === ids[0]).overall, 5);
      assert.equal(summary.meta.resumed, true);
      assert.equal(fs.existsSync(path.join(runDir, ".lock")), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("refuses a run folder another live process holds, and options that conflict", () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "res113-lock-"));
    try {
      fs.writeFileSync(path.join(runDir, ".lock"), String(process.ppid));
      assert.throws(() => bench.acquireLock(runDir), /in use/);
      fs.writeFileSync(path.join(runDir, ".lock"), "999999");
      const release = bench.acquireLock(runDir);
      release();
      assert.equal(fs.existsSync(path.join(runDir, ".lock")), false);
      assert.throws(() => bench.parseArgs(["--resume", "x", "--output", "y"]), /drop --output/);
    } finally { fs.rmSync(runDir, { recursive: true, force: true }); }
  });
});

describe("answer modes", () => {
  it("tells the grader an English marking guide leaves answers out on purpose", () => {
    assert.match(rubric.answerModeText({ subject: "english", answerMode: "answers" }), /without the answers/);
    assert.match(rubric.answerModeText({ subject: "english", answerMode: "worked" }), /Model answers/);
    assert.match(rubric.answerModeText({ subject: "maths", answerMode: "worked" }), /working out/);
    const answers = rubric.CRITERIA.find((c) => c.id === "answers");
    assert.match(answers.guide, /deliberately does NOT give the answers/);
    const params = rubric.buildGraderParams({ request: { id: "e", subject: "english", year: 8, resourceType: "worksheet", answerMode: "answers", customPrompt: "p" }, pdfBase64: "QQ==" });
    assert.match(params.messages[0].content[1].text, /Marking guide, for students/);
  });
});

describe("resume keeps the run's own request list", () => {
  it("finishes only the requests the interrupted run started with", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "res113-manifest-"));
    const runDir = path.join(root, "run");
    try {
      const calls = { generated: 0 };
      const replay = async ({ output }) => {
        calls.generated++;
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify({ status: "failed", errorCode: "X" }));
      };
      const deps = { keys: { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }, client: {}, replay };
      await bench.runBenchmark(bench.parseArgs(["--output", runDir, "--only", "m01-y5-fractions-worksheet,e01-y5-figurative-language-worksheet"]), deps);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")).requestIds, ["m01-y5-fractions-worksheet", "e01-y5-figurative-language-worksheet"]);
      calls.generated = 0;
      const summary = await bench.runBenchmark(bench.parseArgs(["--resume", runDir]), deps);
      assert.equal(calls.generated, 2, "only the two original requests are generated again");
      assert.equal(summary.counts.requests, 2);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
