"use strict";

const { controlError, requestedQuestionCount, MAX_QUESTIONS } = require("./durableStages");
const { buildResponseSchema } = require("./responseSchema");
const { buildSystemPrompt } = require("./promptBuilder");
const { sourceScope, validatePlannedCoverage, verifyPlannedContent } = require("./contentVerification");
const { resourceEvent, resourceStage } = require("./resourceLog");
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };
const int = { type: "integer" };
const list = (items) => ({ type: "array", items });
const PLAN_SCHEMA = obj({
  title: str, timeAllowed: str, clarification: str,
  topics: list(obj({ name: str, evidence: str })),
  questions: list(obj({ number: int, topic: str, section: str, difficulty: str, marks: int, sourceIds: list(str), estimatedMinutes: { type: "number" } })),
});

function perTopicCount(prompt = "") {
  const match = String(prompt).match(/\b(\d+)\s+(?:[a-z]+[ -]){0,3}(?:questions?|problems?)\s+(?:per|for each|in each|for every)\s+(?:remaining\s+)?(?:topics?|chapters?|sections?)\b/i);
  return match ? Number(match[1]) : null;
}

function validatePlan(result, job, userMessage, scope = { eligible: [], excluded: [], minutes: null }) {
  const plan = result?.parsed;
  if (plan?.clarification === "SIZE_LIMIT") throw controlError("RESOURCE_SIZE_LIMIT", `The resolved request exceeds ${MAX_QUESTIONS} questions. Split it into smaller resources.`);
  if (plan?.clarification) throw controlError("RESOURCE_SCOPE_CLARIFICATION", `Clarify the requested topics or attach the relevant contents pages, then submit again.`);
  const invalid = (reason = "plan_structure_or_count") => { throw Object.assign(controlError("RESOURCE_PLAN_INVALID", "The generation plan did not match the requested scope. Check the topics and requested size, then retry."), { reason }); };
  if (!plan || typeof plan.title !== "string" || !Array.isArray(plan.topics) || !plan.topics.length ||
      !Array.isArray(plan.questions) || !plan.questions.length) invalid();
  if (plan.questions.length > MAX_QUESTIONS) throw controlError("RESOURCE_SIZE_LIMIT", `The resolved request exceeds ${MAX_QUESTIONS} questions. Split it into smaller resources.`);
  const names = plan.topics.map((t) => t?.name);
  if (new Set(names).size !== names.length || plan.topics.some((t) => !t || typeof t.name !== "string" || !t.name.trim() || typeof t.evidence !== "string" || !t.evidence.trim() || !userMessage.replace(/\s+/g, " ").includes(t.evidence.replace(/\s+/g, " ")))) invalid("source_evidence_not_found");
  if (plan.questions.some((q, i) => !q || q.number !== i + 1 || !names.includes(q.topic) ||
      !q.section || !Number.isInteger(q.marks) || q.marks < 1 || q.marks > 30)) invalid();
  const each = perTopicCount(job.customPrompt);
  if (each && scope.eligible.length) {
    if (plan.questions.some((q) => q.sourceIds?.length !== 1) || scope.eligible.some((topic) => plan.questions.filter((q) => q.sourceIds?.includes(topic.id)).length !== each)) invalid("per_topic_count_mismatch");
  } else if (each && names.some((topic) => plan.questions.filter((q) => q.topic === topic).length !== each)) invalid("per_topic_count_mismatch");
  const total = requestedQuestionCount(job.customPrompt);
  if (!each && total && plan.questions.length !== total) invalid();
  // Coded scope is checked through sourceIds; a multipart question may test several topics.
  // Coverage shortfalls are reported as review notes, never a late fatal error.
  const sections = plan.questions.map((q) => q.section).filter((name, i, all) => i === 0 || all[i - 1] !== name);
  if (new Set(sections).size !== sections.length) invalid();
  if (job.resourceType === "practice-paper" && !plan.timeAllowed) invalid();
  validatePlannedCoverage(plan, scope);
}

function questionRows(parsed, type) {
  return type === "practice-paper" ? (parsed?.sections || []).flatMap((s) => s.questions || []) : parsed?.questions;
}

function validateQuestions(result, specs, type, prior = []) {
  const rows = questionRows(result?.parsed, type);
  if (!Array.isArray(rows) || rows.length !== specs.length || rows.some((q, i) =>
    !q || q.number !== specs[i].number || q.marks !== specs[i].marks || (q.parts?.length && q.parts.reduce((n, p) => n + (Number(p.marks) || 0), 0) !== q.marks) || typeof q.stem !== "string" || !q.stem.trim())) {
    throw controlError("RESOURCE_BATCH_INVALID", "A question batch did not match its saved plan. Retry this stage.");
  }
  const stems = [...prior, ...rows.map((q) => q.stem)].map((v) => v.toLowerCase().replace(/\s+/g, " ").trim());
  if (new Set(stems).size !== stems.length) throw controlError("RESOURCE_BATCH_INVALID", "Repeated questions were detected in a question batch. Retry this stage.");
}

function validateAnswers(result, questions, answerKey) {
  const rows = result?.parsed?.[answerKey];
  const expected = questions.flatMap((q) => q.parts?.length
    ? q.parts.map((p) => `${q.number}:${String(p.label).replace(/[()]/g, "")}`) : [`${q.number}:`]);
  const keys = (Array.isArray(rows) ? rows : []).map((a) => `${a?.questionNumber}:${String(a?.partLabel || "").replace(/[()]/g, "")}`);
  if (!Array.isArray(rows) || keys.length !== expected.length || new Set(keys).size !== keys.length ||
      expected.some((key) => !keys.includes(key))) {
    throw controlError("RESOURCE_BATCH_INVALID", "A solution batch is missing answers or contains incorrect question references. Retry this stage.");
  }
}

function usesPlannedGeneration(job) {
  const count = requestedQuestionCount(job.customPrompt);
  return job.generationVersion === 1 && ["worksheet", "practice-paper"].includes(job.resourceType) &&
    (job.resourceType === "practice-paper" || perTopicCount(job.customPrompt) || !count || count > 15);
}

async function generatePlannedResource({ job, request, callAi, hasStimulus = false, stimulusImages = [], referenceText = "" }) {
  const each = perTopicCount(job.customPrompt);
  if (each > MAX_QUESTIONS) throw controlError("RESOURCE_SIZE_LIMIT", "Request fewer questions per topic.");
  const scope = sourceScope(job, referenceText);
  if (each && scope.eligible.length * each > MAX_QUESTIONS) throw controlError("RESOURCE_SIZE_LIMIT", `The resolved request needs ${scope.eligible.length * each} questions, above the ${MAX_QUESTIONS}-question limit. Split it by topic or chapter.`);
  const validateStageResult = (result) => validatePlan(result, job, request.userMessage, scope);
  const { parsed: plan } = await callAi({ ...request,
    stageId: "plan.v2", stageLabel: "Planning topics, question counts and sections",
    maxTokens: 16000, responseSchema: PLAN_SCHEMA, validateStageResult,
    userMessage: `${request.userMessage}\n\nREFERENCE-DERIVED SCOPE (use representative chapter coverage for papers unless every subsection is explicitly requested; honour exclusions): ${JSON.stringify(scope)}`,
    systemPrompt: `Plan an educational resource; do not write questions or solutions. Return the supplied JSON schema.
Resolve the tutor's exact scope and exclusions using the supplied references. Topics must each quote exact evidence from the user's message or references. A textbook title alone does not establish its chapter contents. If the topic list or exclusions cannot be established, return a non-empty clarification and empty topics/questions; never invent a contents list.
For "N per topic", allocate exactly N questions to EACH eligible topic. Otherwise obey any requested total. For timed papers, allocate sections, progressively harder questions and marks that reasonably fit the sitting time. Use a reasonable number of main questions with labelled parts to combine related skills. topics may group by chapter; sourceIds track detailed coverage independently of the primary topic label. Aim for the sitting time with representative chapter coverage. If the coverage is ambitious, produce a usable plan and let the review flag the trade-off; do not return a clarification solely for workload or coverage concerns. Do not silently reduce scope to fit a limit: if the resolved total exceeds ${MAX_QUESTIONS}, set clarification to "SIZE_LIMIT" and leave questions empty. Use consecutive global numbers from 1; assign each a topic, section, difficulty and marks. Give every question sourceIds from the eligible reference inventory (multiple IDs allowed when the actual multipart question tests those skills), and a realistic positive estimatedMinutes. For chapter coverageMode, sample across every eligible chapter; do not force every subsection into a timed paper. For section coverageMode, aim to cover every requested ID. Balance chapter marks fairly. Do not merely attach IDs to questions that do not test them. Sum the question minutes to 75–100% of the requested sitting time; preserve the exact requested timeAllowed. Without coded references use an empty sourceIds array. Supply title and timeAllowed (empty for untimed worksheets). clarification must be empty when the scope is resolved.`,
  });
  validateStageResult({ parsed: plan });
  resourceEvent(job, "plan.resolved", { stageId: "plan.v2", questionCount: plan.questions.length, generationVersion: 1 });
  const contentOptions = { year: job.year, subject: job.subject, answerMode: "none", hasStimulus, stimulusImages };
  const answerKey = job.subject === "english" ? "markingGuide" : "answers";
  const fullSchema = buildResponseSchema(job.resourceType, { subject: job.subject, answerMode: job.answerMode, hasStimulus });
  const answerSchema = obj({ [answerKey]: fullSchema.properties[answerKey] });
  const chunks = [];
  const batchSize = job.answerMode === "worked" ? 5 : 10;

  async function batch(specs, path) {
    const prior = chunks.flatMap((p) => questionRows(p, job.resourceType)).map((q) => q.stem);
    let result;
    try {
      result = await callAi({ ...request, stageId: `questions.${path}`, splitAllowed: specs.length > 1,
        stageLabel: `Writing questions ${specs[0].number}–${specs.at(-1).number} of ${plan.questions.length}`,
        maxTokens: 16000, systemPrompt: buildSystemPrompt(job.resourceType, contentOptions),
        responseSchema: buildResponseSchema(job.resourceType, contentOptions),
        validateStageResult: (r) => validateQuestions(r, specs, job.resourceType, prior),
        userMessage: `${request.userMessage}\n\nSAVED PLAN (overrides whole-resource counts for this response): ${JSON.stringify(specs)}\nGenerate ONLY these question numbers, topics, difficulty, sections and exact marks. Preserve global numbering. Do not include solutions or marking guides in this response. Return the normal resource shape for this batch. Avoid these earlier stems: ${JSON.stringify(prior)}`,
      });
    } catch (err) {
      if (err?.code !== "RESOURCE_STAGE_SPLIT") throw err;
      const mid = Math.ceil(specs.length / 2);
      await batch(specs.slice(0, mid), `${path}.a`);
      await batch(specs.slice(mid), `${path}.b`);
      return;
    }
    validateQuestions(result, specs, job.resourceType, prior);
    const part = result.parsed;
    const questions = questionRows(part, job.resourceType);
    if (job.answerMode !== "none") {
      const answers = await solutionBatch(questions, path);
      part[answerKey] = answers;
    }
    chunks.push(part);
  }

  async function solutionBatch(questions, path) {
    try {
      const result = await callAi({ ...request, stageId: `solutions.${path}`, splitAllowed: questions.length > 1,
        stageLabel: `Writing solutions for questions ${questions[0].number}–${questions.at(-1).number}`,
        maxTokens: 16000, responseSchema: answerSchema,
        validateStageResult: (r) => validateAnswers(r, questions, answerKey),
        userMessage: `${request.userMessage}\n\nWrite ONLY the ${answerKey} object for these SAVED questions. Do not rewrite or renumber questions. Include exactly one row per question, or one per labelled part for multipart questions. ${job.answerMode === "worked" ? "Give complete worked solutions/model responses." : "Give final answers/marking criteria only."}\n${JSON.stringify(questions)}`,
      });
      validateAnswers(result, questions, answerKey);
      return result.parsed[answerKey];
    } catch (err) {
      if (err?.code !== "RESOURCE_STAGE_SPLIT") throw err;
      const mid = Math.ceil(questions.length / 2);
      return [...await solutionBatch(questions.slice(0, mid), `${path}.a`), ...await solutionBatch(questions.slice(mid), `${path}.b`)];
    }
  }

  for (let i = 0; i < plan.questions.length; i += batchSize) await batch(plan.questions.slice(i, i + batchSize), String(i / batchSize + 1));
  const assembled = await resourceStage(job, "assembly.validation", async () => {
    const rows = chunks.flatMap((p) => questionRows(p, job.resourceType));
    const normal = (stem) => stem.toLowerCase().replace(/\s+/g, " ").trim();
    if (new Set(rows.map((q) => normal(q.stem))).size !== rows.length) throw controlError("RESOURCE_BATCH_INVALID", "Repeated questions were detected. Review the scope and retry.");
    const parsed = { ...chunks[0], title: plan.title, totalMarks: plan.questions.reduce((n, q) => n + q.marks, 0),
      [answerKey]: chunks.flatMap((p) => p[answerKey] || []) };
    if (job.resourceType === "practice-paper") {
      parsed.timeAllowed = scope.minutes ? `${scope.minutes} minutes` : plan.timeAllowed;
      parsed.topics = plan.topics.map((t) => t.name);
      parsed.sections = [...new Set(plan.questions.map((q) => q.section))].map((title) => ({ title,
        questions: rows.filter((q) => plan.questions[q.number - 1].section === title) }));
    } else { parsed.questions = rows; parsed.topic = plan.topics.map((t) => t.name).join(", "); }
    validateQuestions({ parsed }, plan.questions, job.resourceType);
    if (job.answerMode !== "none") validateAnswers({ parsed }, rows, answerKey);
    return { parsed, raw: JSON.stringify(parsed) };
  });
  const review = await verifyPlannedContent({ job, request, callAi, plan, parsed: assembled.parsed, scope });
  return { ...assembled, reviewStatus: review.status, contentReview: review.summary,
    warnings: [...validatePlannedCoverage(plan, scope), ...review.warnings] };
}

module.exports = { usesPlannedGeneration, generatePlannedResource, perTopicCount, validatePlan, validateQuestions, validateAnswers };
