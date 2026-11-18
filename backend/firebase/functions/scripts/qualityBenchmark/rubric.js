"use strict";

// RES-113. The rubric, the grader request and the run summary for the
// resource quality benchmark. Everything here is pure so it can be unit
// tested; scripts/qualityBenchmark.js does the I/O.

const GRADER_MODEL = "claude-opus-5-5";
const GRADER_EFFORT = "high";
const GRADER_MAX_TOKENS = 32000;
// v2 (2026-11-18): an English "Marking guide" is for students and leaves
// the answers out on purpose; v1 marked that down.
const RUBRIC_VERSION = 2;

// Score 0 means "not applicable"; it is left out of every average.
const CRITERIA = Object.freeze([
  {
    id: "accuracy",
    label: "Accuracy",
    guide: "Answers, worked solutions, facts, quotations and attributions are correct. Maths is right; quoted text matches the source; nothing is invented and presented as real.",
  },
  {
    id: "yearFit",
    label: "Year and syllabus fit",
    guide: "Difficulty, vocabulary and content suit the stated year level (NSW syllabus) and the topic requested. Not too easy, not beyond the year.",
  },
  {
    id: "visuals",
    label: "Diagrams and stimuli",
    guide: "Diagrams, graphs, images and reading texts are present wherever a question needs them, correct, consistent with the question and answer, legible and print-ready in black and white. Score 0 only if the resource needs no diagram, image or stimulus at all.",
  },
  {
    id: "layout",
    label: "Layout",
    guide: "The document looks finished: no blank or near-blank pages, nothing cut off or overflowing, maths typeset rather than raw code, consistent formatting, numbering and marks that line up, enough working or answer space.",
  },
  {
    id: "answers",
    label: "Answers and marking guide",
    guide: "Judge it against the answer mode requested. Maths answers or worked solutions: complete, correct and matching every question by number. English marking guide: written for students, it explains how to approach each question and what a strong response includes, and deliberately does NOT give the answers; giving answers away is a fault, leaving them out is not. English model answers: a full model response for each question. Score 0 only when the request asked for no answers.",
  },
  {
    id: "requestFit",
    label: "Request fit",
    guide: "The resource is the type requested and does what the tutor's instructions asked: topics, counts, length, sections and any named texts.",
  },
]);
const CRITERION_IDS = Object.freeze(CRITERIA.map((c) => c.id));

// What each answer mode means, as the portal labels it per subject.
const ANSWER_MODE_TEXT = Object.freeze({
  maths: {
    none: "No answers (questions only)",
    answers: "Answers only (final answers)",
    worked: "Answers with working out",
  },
  english: {
    none: "No answers (questions only)",
    answers: "Marking guide, for students: guidance on how to answer each question, deliberately without the answers",
    worked: "Model answers: a full model response for each question",
  },
});

function answerModeText(request) {
  return ANSWER_MODE_TEXT[request.subject]?.[request.answerMode] || request.answerMode;
}

const scoreProperty = {
  type: "object",
  additionalProperties: false,
  required: ["score", "reason"],
  properties: {
    score: { type: "integer", enum: [0, 1, 2, 3, 4, 5] },
    reason: { type: "string" },
  },
};

const GRADE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["scores", "issues", "summary"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: [...CRITERION_IDS],
      properties: Object.fromEntries(CRITERION_IDS.map((id) => [id, scoreProperty])),
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "severity", "criterion", "description"],
        properties: {
          page: { type: "integer" },
          severity: { type: "string", enum: ["major", "minor"] },
          criterion: { type: "string", enum: [...CRITERION_IDS] },
          description: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
});

const SYSTEM_PROMPT = `You review printable teaching resources made by an AI generator for Tenacity Tutoring, a tutoring business in NSW, Australia. Tutors print these resources and use them with students in class. Your job is to grade one finished resource honestly against a fixed rubric, so that scores can be compared across runs.

Grade only what is in the document. Read every page, including the answer section. Check maths answers yourself rather than trusting the document. The student's name in the header, name field and footers is filled in by design (here it reads "Local replay"); don't treat it as a problem.

Scores (whole numbers):
5 = Ready to print. A careful tutor would change nothing.
4 = Ready to print with only cosmetic nits.
3 = Usable, but a tutor would want to fix something first.
2 = Has a problem that would stop a tutor using it as is (a wrong answer, a missing diagram a question needs, a broken page).
1 = Largely unusable for this criterion.
0 = Not applicable (only where the criterion's guide allows it).

Be consistent: the same flaw should cost the same score every time. Each reason is one or two sentences naming the specific evidence (question number or page). List every problem you find in issues, with the PDF page number (0 if it applies to the whole document). A major issue is one that would stop a tutor using the resource as is; everything else is minor. The summary is two sentences for a tutor.`;

function rubricText() {
  return CRITERIA.map((c) => `- ${c.id} (${c.label}): ${c.guide}`).join("\n");
}

function requestText(request) {
  const checks = (request.checks || []).map((c) => `- ${c}`).join("\n");
  return [
    `Request (${request.id}):`,
    `- Subject: ${request.subject}, Year ${request.year}`,
    `- Resource type: ${request.resourceType}`,
    `- Answers requested: ${answerModeText(request)}`,
    `- Marks shown: ${request.showMarks ? "yes" : "no"}`,
    `- Tutor's instructions: ${request.customPrompt}`,
    checks ? `\nAlso check specifically (these feed the normal criteria; they are not extra criteria):\n${checks}` : "",
  ].join("\n");
}

function buildGraderParams({ request, pdfBase64, model = GRADER_MODEL, effort = GRADER_EFFORT }) {
  if (!pdfBase64) throw new TypeError("pdfBase64 is required");
  return {
    model,
    max_tokens: GRADER_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema: GRADE_SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: `${requestText(request)}\n\nRubric:\n${rubricText()}\n\nGrade the attached resource.` },
      ],
    }],
  };
}

function validateGrade(grade) {
  if (!grade || typeof grade !== "object") throw new Error("Grade is not an object");
  for (const id of CRITERION_IDS) {
    const entry = grade.scores?.[id];
    if (!entry || !Number.isInteger(entry.score) || entry.score < 0 || entry.score > 5) {
      throw new Error(`Grade is missing a valid score for ${id}`);
    }
  }
  if (!Array.isArray(grade.issues)) throw new Error("Grade issues must be an array");
  return grade;
}

/** The grade from a Messages API response, or a thrown error saying why not. */
function readGradeMessage(message) {
  if (message?.stop_reason === "refusal") {
    throw Object.assign(new Error(`Grader refused (${message.stop_details?.category || "no category"})`), { code: "GRADER_REFUSED" });
  }
  if (message?.stop_reason === "max_tokens") {
    throw Object.assign(new Error("Grader hit max_tokens"), { code: "GRADER_TRUNCATED" });
  }
  const text = (message?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let grade;
  try { grade = JSON.parse(text); } catch {
    throw Object.assign(new Error("Grader returned invalid JSON"), { code: "GRADER_INVALID_JSON" });
  }
  return validateGrade(grade);
}

const round2 = (n) => Math.round(n * 100) / 100;
const mean = (values) => (values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null);

/** Mean of the applicable (non-zero) criterion scores. */
function overallScore(grade) {
  return mean(CRITERION_IDS.map((id) => grade.scores[id].score).filter((s) => s > 0));
}

// USD per million tokens. Claude rates from the Anthropic price list
// (2026-11). OpenAI rates are not recorded here; their tokens are reported
// but left out of the dollar total until a rate is added.
const PRICES_PER_MTOK = Object.freeze({
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
});

/**
 * Dollar cost of normalised usage ({ inputTokens, cachedInputTokens,
 * cacheWriteTokens, outputTokens }), or null when the model has no rate.
 * inputTokens excludes cached tokens, as both providers report it.
 */
function costOf(model, usage = {}) {
  const price = PRICES_PER_MTOK[model];
  if (!price) return null;
  const cost = ((usage.inputTokens || 0) * price.input
    + (usage.cachedInputTokens || 0) * price.cacheRead
    + (usage.cacheWriteTokens || 0) * price.cacheWrite
    + (usage.outputTokens || 0) * price.output) / 1e6;
  return Math.round(cost * 10000) / 10000;
}

/** Normalised usage from a raw Anthropic usage object. */
function anthropicUsage(usage = {}) {
  return {
    inputTokens: usage.input_tokens || 0,
    cachedInputTokens: usage.cache_read_input_tokens || 0,
    cacheWriteTokens: usage.cache_creation_input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
  };
}

/**
 * The run summary. `results` has one entry per request:
 * { id, subject, status, grade?, error?, generation?, graderCost? }.
 * `previous` is an earlier summary to compare against, by request id.
 */
function summariseRun(results, { previous = null, meta = {} } = {}) {
  const graded = results.filter((r) => r.grade);
  const rows = results.map((r) => ({
    id: r.id,
    subject: r.subject,
    status: r.grade ? "graded" : r.status,
    overall: r.grade ? overallScore(r.grade) : null,
    scores: r.grade ? Object.fromEntries(CRITERION_IDS.map((id) => [id, r.grade.scores[id].score])) : null,
    majorIssues: r.grade ? r.grade.issues.filter((i) => i.severity === "major").length : null,
    minorIssues: r.grade ? r.grade.issues.filter((i) => i.severity === "minor").length : null,
    warnings: r.generation?.warnings ?? null,
    error: r.error || null,
  }));
  const byCriterion = Object.fromEntries(CRITERION_IDS.map((id) => [
    id, mean(graded.map((r) => r.grade.scores[id].score).filter((s) => s > 0)),
  ]));
  const bySubject = Object.fromEntries(["maths", "english"].map((subject) => [
    subject, mean(rows.filter((r) => r.subject === subject && r.overall !== null).map((r) => r.overall)),
  ]));
  const overall = mean(rows.filter((r) => r.overall !== null).map((r) => r.overall));

  let comparison = null;
  if (previous) {
    const prevRows = new Map((previous.rows || []).map((r) => [r.id, r]));
    const delta = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : round2(a - b));
    comparison = {
      previousRunId: previous.meta?.runId || null,
      overall: delta(overall, previous.overall),
      bySubject: Object.fromEntries(Object.keys(bySubject).map((s) => [s, delta(bySubject[s], previous.bySubject?.[s])])),
      byCriterion: Object.fromEntries(CRITERION_IDS.map((id) => [id, delta(byCriterion[id], previous.byCriterion?.[id])])),
      rows: Object.fromEntries(rows.map((r) => [r.id, delta(r.overall, prevRows.get(r.id)?.overall)])),
    };
  }

  const graderCost = round2(results.reduce((sum, r) => sum + (r.graderCost || 0), 0));
  const generationCostKnown = round2(results.reduce((sum, r) => sum + (r.generation?.cost?.known || 0), 0));
  const unpricedModels = [...new Set(results.flatMap((r) => r.generation?.cost?.unpricedModels || []))];
  return {
    meta: { rubricVersion: RUBRIC_VERSION, ...meta },
    counts: {
      requests: results.length,
      graded: graded.length,
      failed: results.length - graded.length,
    },
    overall,
    bySubject,
    byCriterion,
    cost: { grader: graderCost, generationKnown: generationCostKnown, unpricedModels },
    comparison,
    rows,
  };
}

const fmt = (n) => (n === null || n === undefined ? "–" : Number(n).toFixed(2));
const fmtDelta = (n) => (n === null || n === undefined ? "" : ` (${n >= 0 ? "+" : ""}${n.toFixed(2)})`);

function renderMarkdown(summary) {
  const c = summary.comparison;
  const lines = [
    `# Resource quality benchmark — ${summary.meta.runId || "run"}`,
    "",
    `Rubric v${summary.meta.rubricVersion} · grader ${summary.meta.graderModel || GRADER_MODEL} · ${summary.counts.graded}/${summary.counts.requests} graded`,
    c ? `Compared with ${c.previousRunId || "previous run"}.` : "",
    "",
    "| | Score |",
    "|---|---|",
    `| **Overall** | **${fmt(summary.overall)}**${fmtDelta(c?.overall)} |`,
    ...Object.entries(summary.bySubject).map(([s, v]) => `| ${s} | ${fmt(v)}${fmtDelta(c?.bySubject?.[s])} |`),
    ...CRITERIA.map((cr) => `| ${cr.label} | ${fmt(summary.byCriterion[cr.id])}${fmtDelta(c?.byCriterion?.[cr.id])} |`),
    "",
    "| Request | Overall | " + CRITERIA.map((cr) => cr.id).join(" | ") + " | Major | Minor |",
    "|---|---|" + CRITERIA.map(() => "---").join("|") + "|---|---|",
    ...summary.rows.map((r) => r.overall === null
      ? `| ${r.id} | ${r.status}: ${r.error || "no grade"} |${CRITERIA.map(() => "").join(" |")} | | |`
      : `| ${r.id} | ${fmt(r.overall)}${fmtDelta(c?.rows?.[r.id])} | ${CRITERION_IDS.map((id) => r.scores[id] || "n/a").join(" | ")} | ${r.majorIssues} | ${r.minorIssues} |`),
    "",
    `Cost: grader $${summary.cost.grader.toFixed(2)}, generation $${summary.cost.generationKnown.toFixed(2)} (priced models only${summary.cost.unpricedModels.length ? `; not priced: ${summary.cost.unpricedModels.join(", ")}` : ""}).`,
  ];
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n") + "\n";
}

module.exports = {
  ANSWER_MODE_TEXT,
  CRITERIA,
  CRITERION_IDS,
  GRADE_SCHEMA,
  GRADER_EFFORT,
  GRADER_MODEL,
  PRICES_PER_MTOK,
  RUBRIC_VERSION,
  SYSTEM_PROMPT,
  anthropicUsage,
  answerModeText,
  buildGraderParams,
  costOf,
  overallScore,
  readGradeMessage,
  renderMarkdown,
  requestText,
  summariseRun,
  validateGrade,
};
