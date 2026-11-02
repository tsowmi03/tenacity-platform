"use strict";

const { controlError } = require("./durableStages");
const { isCancellationError } = require("./cancellation");
const { resourceEvent, resourceStage } = require("./resourceLog");
const object = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };
const num = { type: "number" };
const array = (items) => ({ type: "array", items });
const REVIEW_SCHEMA = object({
  scopePass: { type: "boolean" }, difficultyPass: { type: "boolean" }, issues: array(str),
  questions: array(object({ number: { type: "integer" }, coveredSourceIds: array(str), estimatedMinutes: num })),
});

function requestedMinutes(prompt = "") {
  const match = prompt.match(/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(minutes?|mins?|hours?|hrs?)\b/i);
  return match ? Number(match[1]) * (/^(?:hour|hr)/i.test(match[2]) ? 60 : 1) : null;
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
  if (!unique.length || !exhaustive) return { eligible: [], excluded: [], minutes: requestedMinutes(prompt) };
  const chapters = [...prompt.matchAll(/\b(?:except|exclude|excluding|omit)\s+(?:all\s+(?:of\s+)?)?(?:of\s+)?(?:chapter|chapters)\s+(\d+)\b/gi)].map((m) => Number(m[1]));
  const cutoff = prompt.match(/\b(?:after|beyond)\s+(?:section\s+)?(\d+[A-Z])\b/i)?.[1].toUpperCase();
  if (cutoff && !unique.some((t) => t.id === cutoff)) throw controlError("RESOURCE_SCOPE_CLARIFICATION", "The requested section boundary could not be found in the reference contents.");
  const after = (id) => cutoff && (Number(id.match(/^\d+/)[0]) > Number(cutoff.match(/^\d+/)[0]) ||
    (Number(id.match(/^\d+/)[0]) === Number(cutoff.match(/^\d+/)[0]) && id.at(-1) > cutoff.at(-1)));
  const excluded = unique.filter((t) => chapters.includes(t.chapter) || after(t.id));
  const excludedIds = new Set(excluded.map((t) => t.id));
  const explicitSections = /\b(?:all|every|each)\s+(?:individual\s+)?(?:subsections?|subtopics?|sections?)\b|\b(?:per|each)\s+topic/i.test(prompt);
  return { eligible: unique.filter((t) => !excludedIds.has(t.id)), excluded, minutes: requestedMinutes(prompt),
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
  if (coverage.missing || coverage.excluded) warnings.push({ code: "RESOURCE_PLAN_COVERAGE_WARNING", message: "The plan may not fully match the requested coverage or exclusions. Tutor review recommended." });
  if (scope.minutes) {
    const minutes = plan.questions.reduce((n, q) => n + (Number(q.estimatedMinutes) || 0), 0);
    if (requestedMinutes(plan.timeAllowed || "") !== scope.minutes || minutes > scope.minutes || minutes < scope.minutes * 0.75) {
      warnings.push({ code: "RESOURCE_PLAN_TIMING_WARNING", message: `The plan may need a different workload for the requested ${scope.minutes}-minute sitting. Tutor review recommended.` });
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

function unavailableReviewWarning(stage = "Content review") {
  return { code: "RESOURCE_REVIEW_UNAVAILABLE", message: `${stage} could not finish. A downloadable draft is retained; tutor review is required before use.` };
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
    return await resourceStage(args.job, "content.review", () => verifyPlannedContentLogged(args));
  } catch (err) {
    if (!canKeepDraftAfterReview(err)) throw err;
    resourceEvent(args.job, "content.review_unavailable", { outcome: "draft", errorCode: err?.code || "REVIEW_FAILED", recoveryDecision: "keep_draft" }, "warn");
    return { status: "draft", warnings: [unavailableReviewWarning()], summary: { status: "unavailable" } };
  }
}

async function verifyPlannedContentLogged({ job, request, callAi, plan, parsed, scope }) {
  const questions = job.resourceType === "practice-paper" ? parsed.sections.flatMap((s) => s.questions) : parsed.questions;
  const result = await callAi({ ...request, optionalReview: true, stageId: "content.review.v1", stageLabel: "Checking topic coverage, exclusions and sitting time",
    maxTokens: 12000, effort: "medium", responseSchema: REVIEW_SCHEMA,
    systemPrompt: `Independently audit an educational resource against the ORIGINAL tutor request and source contents. Do not accept the planner's coverage labels as proof. Read the actual questions and parts. For each question list only source IDs substantively tested (not merely mentioned), and estimate realistic student answering minutes, including multipart work. Check exclusions, mathematical validity, fair chapter coverage and accessible-to-extending difficulty progression. Use SOURCE SCOPE coverageMode: chapter means representative coverage across each eligible chapter; section means every eligible subsection was explicitly requested. Report missing requested coverage and any excluded content in issues. scopePass and difficultyPass must be false when their corresponding checks fail. Assess difficultyPass only on the progression of question difficulty; do not make it false merely because the workload takes too long. Timing is checked separately using your estimatedMinutes. Do not rewrite the resource.`,
    userMessage: `${request.userMessage}\n\nSOURCE SCOPE: ${JSON.stringify(scope)}\nSAVED PLAN: ${JSON.stringify(plan)}\nGENERATED RESOURCE TO CHECK: ${JSON.stringify(parsed)}`,
    validateStageResult: (r) => validateReview(r, questions),
  });
  validateReview(result, questions);
  const review = result.parsed;
  const covered = review.questions.flatMap((q) => q.coveredSourceIds);
  const coverage = coverageCounts(scope, covered);
  const estimatedMinutes = review.questions.reduce((n, q) => n + q.estimatedMinutes, 0);
  const timingMatches = !scope.minutes || (estimatedMinutes <= scope.minutes && estimatedMinutes >= scope.minutes * 0.75);
  const warnings = [];
  if (coverage.missing) warnings.push({ code: "RESOURCE_COVERAGE_WARNING", message: `Review confirmed ${coverage.covered} of ${coverage.required} requested ${scope.coverageMode === "chapter" ? "chapters" : "subsection topics"}. Tutor review recommended.` });
  if (coverage.excluded) warnings.push({ code: "RESOURCE_EXCLUSIONS_WARNING", message: "The review identified content outside the requested scope. Check the exclusions before use." });
  if (!timingMatches) warnings.push({ code: "RESOURCE_TIMING_WARNING", message: `Estimated answering time is ${estimatedMinutes} minutes for the requested ${scope.minutes}-minute sitting. Tutor review recommended.` });
  if (!review.difficultyPass) warnings.push({ code: "RESOURCE_DIFFICULTY_WARNING", message: "Check the difficulty progression before using this resource." });
  if (review.issues.length || !review.scopePass) warnings.push({ code: "RESOURCE_CONTENT_WARNING", message: "The content review raised concerns. Check the questions and answers before use." });
  const status = warnings.length ? "warnings" : "passed";
  const summary = { status, coverageMode: scope.coverageMode || "section", requiredTopics: coverage.required,
    coveredTopics: coverage.covered, missingTopics: coverage.missing, excludedTopics: coverage.excluded,
    estimatedMinutes, requestedMinutes: scope.minutes || null, issueCount: review.issues.length };
  resourceEvent(job, "content.verified", { outcome: status, questionCount: questions.length,
    requiredTopicCount: coverage.required, coveredTopicCount: coverage.covered, estimatedMinutes, requestedMinutes: scope.minutes, issueCount: review.issues.length,
    scopePass: review.scopePass && !coverage.missing && !coverage.excluded, timingPass: timingMatches, difficultyPass: review.difficultyPass,
    missingTopicCount: coverage.missing, excludedTopicCount: coverage.excluded }, warnings.length ? "warn" : "info");
  return { status, warnings, summary };
}

module.exports = { sourceScope, requestedMinutes, validatePlannedCoverage, verifyPlannedContent, validateReview,
  coverageCounts, canKeepDraftAfterReview, unavailableReviewWarning };
