"use strict";

const { controlError } = require("./durableStages");
const { isCancellationError } = require("./cancellation");
const { resourceEvent, resourceStage } = require("./resourceLog");
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };
const num = { type: "number" };
const array = (items) => ({ type: "array", items });
const REVIEW_SCHEMA = object({
  scopePass: { type: "boolean" }, difficultyPass: { type: "boolean" },
  // RES-95. Each issue names its questions and a fix, so the generator can act
  // on it and a tutor can see what is wrong.
  issues: array(object({ questions: array({ type: "integer" }), problem: str, fix: str })),
  questions: array(object({ number: { type: "integer" }, coveredSourceIds: array(str), estimatedMinutes: num })),
});

const TIME_PHRASE = /\b(\d+(?:\.\d+)?)\s*[- ]?\s*(minutes?|mins?|hours?|hrs?)\b/gi;
const toMinutes = (match) => Number(match[1]) * (/^(?:hour|hr)/i.test(match[2]) ? 60 : 1);
// "10 minutes reading time" / "reading time of 10 minutes" / "perusal: 5 mins".
function isExplicitReadingTime(prompt, match) {
  const end = match.index + match[0].length;
  return /^\s*(?:of\s+)?(?:reading\s+time|perusal)\b/i.test(prompt.slice(end, end + 24)) ||
    /\b(?:reading\s+time|perusal(?:\s+time)?)\s*(?:of|is|:|-)?\s*$/i.test(prompt.slice(Math.max(0, match.index - 24), match.index));
}

// "Reading" alone usually names the assessment ("a 60-minute reading
// comprehension paper", "a 60-minute reading, writing and grammar paper"). It
// is an allocation only beside another stated time for the sitting: "10
// minutes reading, then 50 minutes writing", "Reading: 10 minutes; writing: 50".
function isReadingTime(prompt, match) {
  if (isExplicitReadingTime(prompt, match)) return true;
  const end = match.index + match[0].length;
  const standsAlone = /^\s*(?:of\s+)?reading\s*(?:$|[,.;)]|then\b|before\b|first\b|and\s+\d)/i.test(prompt.slice(end, end + 24)) ||
    /\breading\s*[:\-–]\s*$/i.test(prompt.slice(Math.max(0, match.index - 24), match.index));
  return standsAlone && [...prompt.matchAll(TIME_PHRASE)].some((m) => m.index !== match.index && !isExplicitReadingTime(prompt, m));
}

// The sitting time, skipping any separately stated reading time (RES-89).
function requestedMinutes(prompt = "") {
  const match = [...String(prompt).matchAll(TIME_PHRASE)].find((m) => !isReadingTime(prompt, m));
  return match ? toMinutes(match) : null;
}

function separateReadingMinutes(prompt = "") {
  const match = [...String(prompt).matchAll(TIME_PHRASE)].find((m) => isReadingTime(prompt, m));
  return match ? toMinutes(match) : null;
}

// RES-95. A paper "fits" within these bounds. Over by up to 15% is within what
// two estimates of the same paper differ by. Under is looser (75%, the
// planner's own lower bound): finishing a little early costs a student nothing.
const TIMING_OVER_TOLERANCE = 1.15;
const TIMING_UNDER_TOLERANCE = 0.75;
function timingFits(estimated, requested) {
  return !requested || (estimated <= requested * TIMING_OVER_TOLERANCE && estimated >= requested * TIMING_UNDER_TOLERANCE);
}

// Contents pages identify their own sections. This is intentionally a narrow
// parser: other reference formats still need the planner's scope clarification.
function sourceScope(job, text = "") {
  const topics = [...text.matchAll(/^\s*(\d{1,2}[A-Z])\s+([^\n]+)/gm)].map((m) => ({
    id: m[1], chapter: Number(m[1].match(/^\d+/)[0]), title: m[2].replace(/\s+(?:\d+|CONSOLIDATING|EXTENDING)\s*$/g, "").trim(),
  }));
  const unique = [...new Map(topics.map((t) => [t.id, t])).values()];
  const prompt = job.customPrompt || "";
  const exhaustive = /\ball\s+(?:of\s+)?(?:the\s+)?(?:remaining\s+)?(?:topics|chapters)|\bevery\s+(?:remaining\s+)?chapter|\b(?:per|each)\s+topic|\bremaining topics/i.test(prompt);
  if (!unique.length || !exhaustive) return { eligible: [], excluded: [], minutes: requestedMinutes(prompt), separateReadingMinutes: separateReadingMinutes(prompt) };
  const chapters = [...prompt.matchAll(/\b(?:except|exclude|excluding|omit)\s+(?:all\s+(?:of\s+)?)?(?:of\s+)?(?:chapter|chapters)\s+(\d+)\b/gi)].map((m) => Number(m[1]));
  const cutoff = prompt.match(/\b(?:after|beyond)\s+(?:section\s+)?(\d+[A-Z])\b/i)?.[1].toUpperCase();
  if (cutoff && !unique.some((t) => t.id === cutoff)) throw controlError("RESOURCE_SCOPE_CLARIFICATION", "The requested section boundary could not be found in the reference contents.");
  const after = (id) => cutoff && (Number(id.match(/^\d+/)[0]) > Number(cutoff.match(/^\d+/)[0]) ||
    (Number(id.match(/^\d+/)[0]) === Number(cutoff.match(/^\d+/)[0]) && id.at(-1) > cutoff.at(-1)));
  const excluded = unique.filter((t) => chapters.includes(t.chapter) || after(t.id));
  const excludedIds = new Set(excluded.map((t) => t.id));
  const explicitSections = /\b(?:all|every|each)\s+(?:individual\s+)?(?:subsections?|subtopics?|sections?)\b|\b(?:per|each)\s+topic/i.test(prompt);
  return { eligible: unique.filter((t) => !excludedIds.has(t.id)), excluded, minutes: requestedMinutes(prompt), separateReadingMinutes: separateReadingMinutes(prompt),
    coverageMode: job.resourceType === "practice-paper" && !explicitSections ? "chapter" : "section" };
}

function coverageCounts(scope, ids) {
  const eligible = new Set(scope.eligible.map((t) => t.id));
  const covered = new Set(ids);
  const chapter = (id) => String(id).match(/^\d+/)?.[0];
  const requiredUnits = scope.coverageMode === "chapter" ? new Set([...eligible].map(chapter)) : eligible;
  const coveredUnits = scope.coverageMode === "chapter" ? new Set([...covered].filter((id) => eligible.has(id)).map(chapter)) : covered;
  return { required: requiredUnits.size, covered: [...requiredUnits].filter((id) => coveredUnits.has(id)).length,
    missing: [...requiredUnits].filter((id) => !coveredUnits.has(id)).length,
    excluded: eligible.size ? [...covered].filter((id) => !eligible.has(id)).length : 0 };
}

function validatePlannedCoverage(plan, scope) {
  const warnings = [];
  const coverage = coverageCounts(scope, plan.questions.flatMap((q) => q.sourceIds || []));
  if (coverage.missing || coverage.excluded) warnings.push({ code: "RESOURCE_PLAN_COVERAGE_WARNING", message: "This resource may not match the topics you asked for. Check them before printing." });
  if (scope.minutes) {
    const minutes = plan.questions.reduce((n, q) => n + (Number(q.estimatedMinutes) || 0), 0);
    if (requestedMinutes(plan.timeAllowed || "") !== scope.minutes || !timingFits(minutes, scope.minutes)) {
      warnings.push({ code: "RESOURCE_PLAN_TIMING_WARNING", message: `This paper may not fit the ${scope.minutes}-minute sitting. Check its length before printing.` });
    }
  }
  return warnings;
}

// Control flow and unusable documents must still stop. A failed optional review
// should not discard valid questions/answer links or restart the whole resource.
function canKeepDraftAfterReview(err) {
  if (isCancellationError(err) || ["RESOURCE_STAGE_YIELD", "RESOURCE_SUPERSEDED"].includes(err?.code) ||
      err?.resourceInfrastructure || err?.name === "ResourceValidationError" || err?.diagramRequired) return false;
  return Boolean(err?.modelFailure || ["RESOURCE_REVIEW_UNAVAILABLE", "RESOURCE_STAGE_TIMEOUT", "RESOURCE_RECOVERY_EXHAUSTED", "RESOURCE_STAGE_LIMIT", "RESOURCE_BATCH_INVALID", "RESOURCE_MATH_UNRESOLVED", "RESOURCE_LOCAL_BUDGET"].includes(err?.code));
}

function unavailableReviewWarning() {
  return { code: "RESOURCE_REVIEW_UNAVAILABLE", message: "We couldn't finish checking this resource. Read it through before printing." };
}

function validateReview(result, questions) {
  const review = result?.parsed;
  const numbers = review?.questions?.map((q) => q.number);
  if (!review || typeof review.scopePass !== "boolean" || typeof review.difficultyPass !== "boolean" ||
      !Array.isArray(review.issues) || !Array.isArray(numbers) || numbers.length !== questions.length ||
      new Set(numbers).size !== numbers.length || questions.some((q) => !numbers.includes(q.number)) ||
      review.questions.some((q) => !Array.isArray(q.coveredSourceIds) || !(q.estimatedMinutes > 0))) {
    throw controlError("RESOURCE_BATCH_INVALID", "The content review returned incomplete question checks.");
  }
}

async function verifyPlannedContent(args) {
  try {
    return await resourceStage(args.job, args.attempt ? `content.review.r${args.attempt}` : "content.review", () => verifyPlannedContentLogged(args));
  } catch (err) {
    if (!canKeepDraftAfterReview(err)) throw err;
    resourceEvent(args.job, "content.review_unavailable", { outcome: "draft", errorCode: err?.code || "REVIEW_FAILED", recoveryDecision: "keep_draft" }, "warn");
    return { status: "draft", warnings: [unavailableReviewWarning()], summary: { status: "unavailable" } };
  }
}

// Older checkpoints and test doubles hold plain strings.
function normaliseIssue(issue) {
  if (typeof issue === "string") return { questions: [], problem: issue.trim(), fix: "" };
  return {
    questions: (Array.isArray(issue?.questions) ? issue.questions : []).map(Number).filter(Number.isInteger),
    problem: String(issue?.problem ?? "").trim(),
    fix: String(issue?.fix ?? "").trim(),
  };
}

const hasPlannedDiagram = (q) => [q, ...(q?.parts || [])].some((node) => node?.diagramType && node.diagramType !== "none");
const DIAGRAM_WORD = /\b(?:diagrams?|graphs?|grids?|figures?|images?|pictures?|charts?|histograms?)\b/i;
const NOT_THERE = /\b(?:missing|absent|not (?:been )?(?:supplied|provided|included|shown|given|present)|(?:none|no \w+(?: \w+)?) (?:is|are) (?:supplied|provided|included))\b/i;

// RES-106. Backstop for the instruction in reviewContext: diagrams are added
// after the review, so this claim about a question due one is always false, and
// acting on it would rewrite a good question.
function reportsPlannedDiagramMissing(issue, questions) {
  if (!DIAGRAM_WORD.test(issue.problem) || !NOT_THERE.test(issue.problem)) return false;
  const named = issue.questions.length ? questions.filter((q) => issue.questions.includes(q.number)) : questions.filter(hasPlannedDiagram);
  return named.length > 0 && named.every(hasPlannedDiagram);
}

function issueMessage({ questions, problem }) {
  const where = questions.length ? `${questions.length > 1 ? "Questions" : "Question"} ${questions.join(", ")}: ` : "";
  return `${where}${problem}`;
}

// What the reviewer cannot tell from the JSON it is given. Without this it
// reported the same false problems on every English paper (RES-95): images
// missing (they are inserted later), sourced texts "not verbatim" (the real
// bytes replace this copy later) and marking that expects structure the
// question doesn't mention (which is deliberate).
function reviewContext({ job, images = [], scope, trimmedForTime = false }) {
  const lines = [];
  if (trimmedForTime) {
    lines.push("This paper was too long for the sitting, so tasks in it were deliberately shortened. Do not report a task as too short or ask for it to be longer.");
  }
  if (job.subject !== "english") {
    lines.push('Diagrams are added after this check, so you cannot see them. A question or part whose diagramType is not "none" will have its diagram, graph or grid when printed: never report one as missing or unsupplied. Do report a question that depends on a diagram when its diagramType is "none".');
  }
  if (job.subject === "english") {
    lines.push("Reading texts come from verified sources. Their exact wording, title, author and source are inserted after this check, so the copy you see may differ in punctuation or leave those details out: do not report that.");
    lines.push("On analytical tasks, Tenacity's marking deliberately expects a thesis, ETAs (Evidence, Technique, Analysis) and TETAL, and questions deliberately do not mention them. Do not report that as an unfair or uncommunicated requirement. Extended analytical responses are marked on Tenacity's criteria. A narrative, creative or discursive writing task must never be planned or marked with a thesis, paragraph theses, ETAs, TETAL or links: report that as an issue if you see it.");
  }
  if (images.length) {
    lines.push(`These images are inserted in the stimulus booklet after this check, so you cannot see them. Never report one as missing; judge the questions that use them against these records: ${JSON.stringify(images)}`);
  }
  if (scope.separateReadingMinutes) {
    lines.push(`The tutor gives ${scope.separateReadingMinutes} minutes of separate reading time, outside the sitting time, so do not count first reading of the texts.`);
  }
  return lines.length ? `\n\nCONTEXT:\n- ${lines.join("\n- ")}` : "";
}

async function verifyPlannedContentLogged({ job, request, callAi, plan, parsed, scope, images = [], attempt = 0, trimmedForTime = false }) {
  const questions = job.resourceType === "practice-paper" ? parsed.sections.flatMap((s) => s.questions) : parsed.questions;
  const result = await callAi({ ...request, optionalReview: true, stageId: attempt ? `content.review.v1.r${attempt}` : "content.review.v1", stageLabel: attempt ? "Re-checking after repairs" : "Checking topic coverage, exclusions and sitting time",
    maxTokens: 12000, effort: "medium", responseSchema: REVIEW_SCHEMA,
    systemPrompt: `Independently audit an educational resource against the ORIGINAL tutor request and source contents. Do not accept the planner's coverage labels as proof. Read the actual questions and parts. For each question list only source IDs substantively tested (not merely mentioned), and estimate realistic minutes for a student of this year level, including multipart work. Those minutes cover the whole of the work: reading the question, rereading for evidence, planning, writing and checking. Count the first reading of each stimulus text once, in the first question that uses it. Check exclusions, mathematical validity, fair chapter coverage and accessible-to-extending difficulty progression. Use SOURCE SCOPE coverageMode: chapter means representative coverage across each eligible chapter; section means every eligible subsection was explicitly requested. scopePass and difficultyPass must be false when their corresponding checks fail. Assess difficultyPass only on the progression of question difficulty; do not make it false merely because the workload takes too long. Timing is checked separately using your estimatedMinutes: never report it in issues. issues lists defects only, never what is fine or a general remark: missing requested coverage, excluded content, a wrong answer, a question that cannot be answered from its text. Give each issue the question numbers it affects (empty only if it concerns the whole resource), the problem in one plain sentence a tutor can act on, and the specific fix. Do not rewrite the resource.${reviewContext({ job, images, scope, trimmedForTime })}`,
    userMessage: `${request.userMessage}\n\nSOURCE SCOPE: ${JSON.stringify(scope)}\nSAVED PLAN: ${JSON.stringify(plan)}\nGENERATED RESOURCE TO CHECK: ${JSON.stringify(parsed)}`,
    validateStageResult: (r) => validateReview(r, questions),
  });
  validateReview(result, questions);
  const review = result.parsed;
  const issues = review.issues.map(normaliseIssue).filter((issue) => issue.problem && !reportsPlannedDiagramMissing(issue, questions));
  const covered = review.questions.flatMap((q) => q.coveredSourceIds);
  const coverage = coverageCounts(scope, covered);
  const estimatedMinutes = review.questions.reduce((n, q) => n + q.estimatedMinutes, 0);
  const timingMatches = timingFits(estimatedMinutes, scope.minutes);
  const overrun = Boolean(scope.minutes) && estimatedMinutes > scope.minutes * TIMING_OVER_TOLERANCE;
  const longest = [...review.questions].sort((a, b) => b.estimatedMinutes - a.estimatedMinutes).slice(0, 3)
    .map((q) => `Question ${q.number} (${Math.round(q.estimatedMinutes)} min)`).join(", ");
  const warnings = [];
  if (coverage.missing) warnings.push({ code: "RESOURCE_COVERAGE_WARNING", message: `This resource covers ${coverage.covered} of the ${coverage.required} requested ${scope.coverageMode === "chapter" ? "chapters" : "topics"}. Check it before printing.` });
  if (coverage.excluded) warnings.push({ code: "RESOURCE_EXCLUSIONS_WARNING", message: "The review identified content outside the requested scope. Check the exclusions before use." });
  if (!timingMatches) warnings.push({ code: "RESOURCE_TIMING_WARNING", message: overrun
    ? `This paper will take about ${Math.round(estimatedMinutes)} minutes for the requested ${scope.minutes}-minute sitting. The longest questions are ${longest}.`
    : `This paper may run short: about ${Math.round(estimatedMinutes)} minutes of work for the requested ${scope.minutes}-minute sitting.` });
  if (!review.difficultyPass && !issues.length) warnings.push({ code: "RESOURCE_DIFFICULTY_WARNING", message: "Check the difficulty progression before using this resource." });
  for (const issue of issues.slice(0, 5)) warnings.push({ code: "RESOURCE_CONTENT_WARNING", message: issueMessage(issue) });
  if (!review.scopePass && !issues.length) warnings.push({ code: "RESOURCE_CONTENT_WARNING", message: "The review found that this resource may not match the request. Check it against what you asked for." });
  const status = warnings.length ? "warnings" : "passed";
  const summary = { status, coverageMode: scope.coverageMode || "section", requiredTopics: coverage.required,
    coveredTopics: coverage.covered, missingTopics: coverage.missing, excludedTopics: coverage.excluded,
    estimatedMinutes, requestedMinutes: scope.minutes || null, issueCount: issues.length };
  resourceEvent(job, "content.verified", { outcome: status, questionCount: questions.length, attempt,
    requiredTopicCount: coverage.required, coveredTopicCount: coverage.covered, estimatedMinutes, requestedMinutes: scope.minutes, issueCount: issues.length,
    scopePass: review.scopePass && !coverage.missing && !coverage.excluded, timingPass: timingMatches, difficultyPass: review.difficultyPass,
    missingTopicCount: coverage.missing, excludedTopicCount: coverage.excluded }, warnings.length ? "warn" : "info");
  // RES-95. What the generator can fix itself: an overrun, and any issue
  // naming its questions and a fix.
  const repairableIssues = issues.filter((issue) => issue.questions.length && issue.fix);
  const minutesByQuestion = Object.fromEntries(review.questions.map((q) => [q.number, q.estimatedMinutes]));
  return { status, warnings, summary, repair: overrun || repairableIssues.length
    ? { overrun, estimatedMinutes, requestedMinutes: scope.minutes || null, minutesByQuestion, issues: repairableIssues } : null };
}

module.exports = { reportsPlannedDiagramMissing, TIMING_OVER_TOLERANCE, TIMING_UNDER_TOLERANCE, separateReadingMinutes, timingFits, sourceScope, requestedMinutes, validatePlannedCoverage, verifyPlannedContent, validateReview,
  coverageCounts, canKeepDraftAfterReview, unavailableReviewWarning };
