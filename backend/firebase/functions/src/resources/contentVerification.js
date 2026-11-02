"use strict";

const { controlError } = require("./durableStages");
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
  return { eligible: unique.filter((t) => !excludedIds.has(t.id)), excluded, minutes: requestedMinutes(prompt) };
}

function validatePlannedCoverage(plan, scope) {
  const invalid = (reason) => { throw Object.assign(controlError("RESOURCE_PLAN_INVALID", "The plan omitted required topics, included excluded topics, or did not fit the requested sitting time."), { reason }); };
  if (scope.eligible.length) {
    const eligible = new Set(scope.eligible.map((t) => t.id));
    const covered = new Set();
    for (const q of plan.questions) {
      if (!Array.isArray(q.sourceIds) || !q.sourceIds.length || q.sourceIds.some((id) => !eligible.has(id))) invalid("missing_or_excluded_source_ids");
      q.sourceIds.forEach((id) => covered.add(id));
    }
    if (covered.size !== eligible.size) invalid("incomplete_source_coverage");
    // Allocate marks across chapters; a multi-topic question shares its marks.
    const weights = new Map();
    for (const q of plan.questions) for (const id of q.sourceIds) {
      const chapter = Number(id.match(/^\d+/)[0]);
      weights.set(chapter, (weights.get(chapter) || 0) + q.marks / q.sourceIds.length);
    }
    const mean = [...weights.values()].reduce((a, b) => a + b, 0) / weights.size;
    if (weights.size > 1 && [...weights.values()].some((w) => w > mean * 1.8)) invalid("chapter_marks_unbalanced");
  }
  if (scope.minutes) {
    const allowed = requestedMinutes(plan.timeAllowed || "");
    const minutes = plan.questions.reduce((n, q) => n + (Number(q.estimatedMinutes) || 0), 0);
    if (allowed !== scope.minutes || plan.questions.some((q) => !(q.estimatedMinutes > 0)) || minutes > scope.minutes || minutes < scope.minutes * 0.75) invalid("sitting_time_mismatch");
  }
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
  return resourceStage(args.job, "content.review", () => verifyPlannedContentLogged(args));
}

async function verifyPlannedContentLogged({ job, request, callAi, plan, parsed, scope }) {
  const questions = job.resourceType === "practice-paper" ? parsed.sections.flatMap((s) => s.questions) : parsed.questions;
  const result = await callAi({ ...request, stageId: "content.review.v1", stageLabel: "Checking topic coverage, exclusions and sitting time",
    maxTokens: 12000, effort: "medium", responseSchema: REVIEW_SCHEMA,
    systemPrompt: `Independently audit an educational resource against the ORIGINAL tutor request and source contents. Do not accept the planner's coverage labels as proof. Read the actual questions and parts. For each question list only source IDs substantively tested (not merely mentioned), and estimate realistic student answering minutes, including multipart work. Check exclusions, mathematical validity, fair chapter coverage and accessible-to-extending difficulty progression. Report missing requested coverage and any excluded content in issues. scopePass and difficultyPass must be false when their corresponding checks fail. Assess difficultyPass only on the progression of question difficulty; do not make it false merely because the workload takes too long. Timing is checked separately using your estimatedMinutes. Do not rewrite the resource.`,
    userMessage: `${request.userMessage}\n\nSOURCE SCOPE: ${JSON.stringify(scope)}\nSAVED PLAN: ${JSON.stringify(plan)}\nGENERATED RESOURCE TO CHECK: ${JSON.stringify(parsed)}`,
    validateStageResult: (r) => validateReview(r, questions),
  });
  validateReview(result, questions);
  const review = result.parsed;
  const eligible = new Set(scope.eligible.map((t) => t.id));
  const covered = new Set(review.questions.flatMap((q) => q.coveredSourceIds));
  const estimatedMinutes = review.questions.reduce((n, q) => n + q.estimatedMinutes, 0);
  const scopeMatches = !eligible.size || (covered.size === eligible.size && [...covered].every((id) => eligible.has(id)));
  const timingMatches = !scope.minutes || (estimatedMinutes <= scope.minutes && estimatedMinutes >= scope.minutes * 0.75);
  const passed = review.scopePass && review.difficultyPass && !review.issues.length && scopeMatches && timingMatches;
  resourceEvent(job, "content.verified", { outcome: passed ? "passed" : "rejected", questionCount: questions.length,
    requiredTopicCount: eligible.size, coveredTopicCount: covered.size, estimatedMinutes, requestedMinutes: scope.minutes, issueCount: review.issues.length,
    scopePass: review.scopePass && scopeMatches, timingPass: timingMatches, difficultyPass: review.difficultyPass,
    missingTopicCount: [...eligible].filter((id) => !covered.has(id)).length,
    excludedTopicCount: eligible.size ? [...covered].filter((id) => !eligible.has(id)).length : 0 });
  if (!passed) {
    const failedChecks = [];
    if (!review.scopePass || !scopeMatches) failedChecks.push("topic coverage/exclusions");
    if (!timingMatches) failedChecks.push("estimated sitting time");
    if (!review.difficultyPass) failedChecks.push("difficulty progression");
    if (!failedChecks.length) failedChecks.push("content quality");
    throw Object.assign(controlError("RESOURCE_CONTENT_INVALID", `The generated resource failed ${failedChecks.join(", ")} checks. Retry for a fresh generation; narrow the scope or allow more time if needed.`),
      { reason: failedChecks.join("|") });
  }
  return review;
}

module.exports = { sourceScope, requestedMinutes, validatePlannedCoverage, verifyPlannedContent, validateReview };
