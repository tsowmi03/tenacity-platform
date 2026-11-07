"use strict";

const { controlError, requestedQuestionCount, MAX_QUESTIONS } = require("./durableStages");
const { buildResponseSchema } = require("./responseSchema");
const { buildSystemPrompt } = require("./promptBuilder");
const { sourceScope, validatePlannedCoverage, verifyPlannedContent } = require("./contentVerification");
const { resourceEvent, resourceStage } = require("./resourceLog");
const { noteProgress } = require("./progressModel");
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };
const int = { type: "integer" };
const list = (items) => ({ type: "array", items });
const PLAN_SCHEMA = obj({
  title: str, timeAllowed: str, clarification: str,
  topics: list(obj({ name: str, evidence: str })),
  questions: list(obj({ number: int, topic: str, section: str, difficulty: str, marks: int, sourceIds: list(str), estimatedMinutes: { type: "number" } })),
});

// RES-90. A plan's `section` becomes a printed heading. The planner sometimes
// wrote a description of each question there ("A, Three multiple-choice parts,
// labelled (a), (c)"), so every question became its own section and the paper
// printed planning notes as headings. A name that reads like a description is
// cut back to its section letter, and questions sharing a letter share one
// heading. A real name ("Section B: Writing", "Reading") is kept.
const PLANNING_WORDS = /\blabell?ed\b|\bparts?\b|multiple[- ]choice|\bquestions?\b|\bmarks?\b|\(\s*[a-z]\s*\)|\bextended\b|\bshort[- ]answer\b/i;
function sectionTitle(raw) {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  const lettered = text.match(/^(?:section\s+)?([A-Z])(?=$|[\s,:.\-–—])[\s,:.\-–—]*(.*)$/i);
  if (lettered) {
    const letter = lettered[1].toUpperCase();
    const rest = lettered[2].trim();
    if (!rest || PLANNING_WORDS.test(rest) || rest.length > 40) return `Section ${letter}`;
    return `Section ${letter}: ${rest}`;
  }
  return text;
}

function perTopicCount(prompt = "") {
  const match = String(prompt).match(/\b(\d+)\s+(?:[a-z]+[ -]){0,3}(?:questions?|problems?)\s+(?:per|for each|in each|for every)\s+(?:remaining\s+)?(?:topics?|chapters?|sections?)\b/i);
  return match ? Number(match[1]) : null;
}

const CLARIFICATION_FALLBACK = "Clarify the requested topics or attach the relevant contents pages, then submit again.";

// The planner's own reason for stopping, shown to the tutor so they know what to
// change (for example, a prompt that belongs to a different subject).
function clarificationMessage(text) {
  const reason = String(text || "").replace(/\s+/g, " ").trim();
  if (reason.length < 12) return CLARIFICATION_FALLBACK;
  const clamped = reason.length > 300 ? `${reason.slice(0, 300).trim()}…` : reason;
  return `${clamped}${/[.!?…]$/.test(clamped) ? "" : "."} Update the request, then submit again.`;
}

function validatePlan(result, job, _userMessage, scope = { eligible: [], excluded: [], minutes: null }) {
  const plan = result?.parsed;
  if (plan?.clarification === "SIZE_LIMIT") throw controlError("RESOURCE_SIZE_LIMIT", `The resolved request exceeds ${MAX_QUESTIONS} questions. Split it into smaller resources.`);
  if (plan?.clarification) throw controlError("RESOURCE_SCOPE_CLARIFICATION", clarificationMessage(plan.clarification));
  // Each check has its own reason (RES-70). The reason is logged and also sent
  // back to the model as correction guidance, so a catch-all code left every
  // retry guessing at what to fix.
  const invalid = (reason) => { throw Object.assign(controlError("RESOURCE_PLAN_INVALID", "The generation plan did not match the requested scope. Check the topics and requested size, then retry."), { reason }); };
  if (!plan || typeof plan.title !== "string") invalid("plan_title_missing");
  if (!Array.isArray(plan.topics) || !plan.topics.length) invalid("plan_topics_empty");
  if (!Array.isArray(plan.questions) || !plan.questions.length) invalid("plan_questions_empty");
  if (plan.questions.length > MAX_QUESTIONS) throw controlError("RESOURCE_SIZE_LIMIT", `The resolved request exceeds ${MAX_QUESTIONS} questions. Split it into smaller resources.`);
  if (plan.topics.some((t) => !t || typeof t.name !== "string" || !t.name.trim())) invalid("topic_name_missing");
  if (new Set(plan.topics.map((t) => t.name)).size !== plan.topics.length) invalid("topic_names_duplicated");
  if (plan.questions.some((q, i) => !q || q.number !== i + 1)) invalid("questions_not_numbered_1_to_n");
  // Topic evidence and question-topic labels are not checked here: an
  // unmatched quote becomes a review warning and a stray label is reassigned
  // (reconcilePlanTopics), so neither can fail the resource.
  const reconciled = reconcilePlanTopics(plan).plan;
  const names = reconciled.topics.map((t) => t.name);
  if (plan.questions.some((q) => !q.section)) invalid("question_section_missing");
  if (plan.questions.some((q) => !Number.isInteger(q.marks) || q.marks < 1 || q.marks > 30)) invalid("question_marks_outside_1_to_30");
  const each = perTopicCount(job.customPrompt);
  if (each && scope.eligible.length) {
    if (plan.questions.some((q) => q.sourceIds?.length !== 1) || scope.eligible.some((topic) => plan.questions.filter((q) => q.sourceIds?.includes(topic.id)).length !== each)) invalid("per_topic_count_mismatch");
  } else if (each && names.some((topic) => reconciled.questions.filter((q) => q.topic === topic).length !== each)) invalid("per_topic_count_mismatch");
  const total = requestedQuestionCount(job.customPrompt);
  if (!each && total && plan.questions.length !== total) invalid("question_count_not_requested_total");
  // Coded scope is checked through sourceIds; a multipart question may test several topics.
  // Coverage shortfalls are reported as review notes, never a late fatal error.
  const sections = plan.questions.map((q) => sectionTitle(q.section)).filter((name, i, all) => i === 0 || all[i - 1] !== name);
  if (new Set(sections).size !== sections.length) invalid("section_questions_not_consecutive");
  // A paper needs a sitting time, but a tutor often gives none ("short answer
  // questions on a poem"). Rejecting an empty one failed every attempt of such
  // a request; plannedTimeAllowed derives one from the question estimates.
  if (job.resourceType === "practice-paper" && !plannedTimeAllowed(plan)) invalid("time_allowed_missing");
  validatePlannedCoverage(plan, scope);
}

// Each planned topic quotes the words in the request or uploads that put it in
// scope. A quote that cannot be found used to fail the plan, and three failures
// failed the resource: the model routinely retypes a PDF's curly apostrophes and
// dashes as plain ones, so a correct quote of "Pythagoras’ theorem" never
// matched. The other safeguards (clarification for an unknown contents list,
// sourceIds against coded references, the content review) already stop an
// invented syllabus, so an unmatched quote is now a review note for the tutor.
function normaliseQuote(text) {
  return String(text || "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\u02B9\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, "\"")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function unmatchedEvidenceTopics(plan, sourceText) {
  const haystack = normaliseQuote(sourceText);
  return (plan?.topics || [])
    .filter((t) => { const quote = normaliseQuote(t?.evidence); return !quote || !haystack.includes(quote); })
    .map((t) => t.name);
}

function evidenceWarnings(plan, sourceText) {
  const unmatched = unmatchedEvidenceTopics(plan, sourceText);
  if (!unmatched.length) return [];
  const list = unmatched.map((name) => `"${name}"`).join(", ");
  const subject = unmatched.length === 1 ? `Topic ${list} couldn't be matched to the request or uploaded files. Check it is` : `Topics ${list} couldn't be matched to the request or uploaded files. Check they are`;
  return [{ code: "RESOURCE_PLAN_EVIDENCE_WARNING", message: `${subject} in scope.` }];
}

const topicWords = (text) => new Set(normaliseQuote(text).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["and", "the", "for", "with", "chapter", "unit", "topic"].includes(w)));

// The planned topic a question label most likely means, or null when it shares
// nothing with any of them.
function closestTopic(label, names) {
  if (names.includes(label)) return label;
  const wanted = normaliseQuote(label);
  if (!wanted) return names[0] || null;
  const same = names.find((name) => normaliseQuote(name) === wanted);
  if (same) return same;
  // The most specific overlap wins: "Non-linear equations and graphs" is
  // "Non-linear equations", not the "Linear equations" it also contains.
  const within = names.filter((name) => wanted.includes(normaliseQuote(name)))
    .sort((a, b) => normaliseQuote(b).length - normaliseQuote(a).length);
  if (within.length) return within[0];
  const around = names.filter((name) => normaliseQuote(name).includes(wanted))
    .sort((a, b) => normaliseQuote(a).length - normaliseQuote(b).length);
  if (around.length) return around[0];
  const words = topicWords(label);
  let best = null;
  let bestScore = 0;
  for (const name of names) {
    const score = [...topicWords(name)].filter((w) => words.has(w)).length;
    if (score > bestScore) { best = name; bestScore = score; }
  }
  return best;
}

// A question labelled with a topic the plan never listed used to fail the plan.
// It is reassigned to the closest planned topic, or, sharing no words with any,
// added as a topic of its own (which then carries an evidence warning).
function reconcilePlanTopics(plan) {
  const topics = [...plan.topics];
  const reassigned = [];
  const added = [];
  const questions = plan.questions.map((q) => {
    const names = topics.map((t) => t.name);
    if (names.includes(q?.topic)) return q;
    const match = closestTopic(q?.topic, names);
    if (match) { reassigned.push({ number: q?.number, from: q?.topic ?? null, to: match }); return { ...q, topic: match }; }
    const name = String(q.topic).trim();
    topics.push({ name, evidence: "" });
    added.push(name);
    return { ...q, topic: name };
  });
  return { plan: { ...plan, topics, questions }, reassigned, added };
}

// The plan's sitting time, or one derived from its per-question estimates
// (rounded up to five minutes) when the tutor named none.
function plannedTimeAllowed(plan) {
  if (typeof plan?.timeAllowed === "string" && plan.timeAllowed.trim()) return plan.timeAllowed.trim();
  const minutes = (plan?.questions || []).reduce((sum, q) => sum + (Number(q?.estimatedMinutes) > 0 ? Number(q.estimatedMinutes) : 0), 0);
  return minutes > 0 ? `${Math.max(5, Math.ceil(minutes / 5) * 5)} minutes` : "";
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

// RES-91. An answer that says the text it needs is missing ("Cannot determine
// from the supplied material: Text 2 is missing") was delivered as the answer.
// The text was in the paper; the answer stage had not been shown it. Reject
// such a row so the stage retries with the reason, instead of shipping it.
// Only a claim that a text ITSELF is absent counts. "The narrator's age cannot
// be determined from the text" is a correct answer about a detail the passage
// leaves out, and must pass.
const MISSING_CONTEXT = /\b(?:text|passage|extract|stimulus|source|image)\s*\d*\s+(?:is|was|has been)\s+(?:missing|not (?:provided|supplied|included|given))(?=\s*(?:[.;:,)"]|$|from\b|in the (?:supplied|provided)))/i;
function answerClaimsMissingContext(row) {
  return MISSING_CONTEXT.test(JSON.stringify(row ?? ""));
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
  const blind = rows.filter(answerClaimsMissingContext);
  if (blind.length) {
    throw Object.assign(controlError("RESOURCE_BATCH_INVALID", "A solution said a text was missing. Retry this stage."), {
      reason: `answer_claims_text_missing: Q${blind.map((a) => `${a.questionNumber}${a.partLabel ? `(${String(a.partLabel).replace(/[()]/g, "")})` : ""}`).join(", Q")} said a text was missing, but every text is in FINAL STIMULUS; answer from it`,
    });
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
  const planMessage = `${request.userMessage}\n\nSELECTED SETTINGS: subject ${job.subject || "unspecified"}, Year ${job.year ?? "unspecified"}, ${job.resourceType}.\n\nREFERENCE-DERIVED SCOPE (use representative chapter coverage for papers unless every subsection is explicitly requested; honour exclusions): ${JSON.stringify(scope)}`;
  const validateStageResult = (result) => validatePlan(result, job, planMessage, scope);
  const { parsed: modelPlan } = await callAi({ ...request,
    stageId: "plan.v2", stageLabel: "Planning topics, question counts and sections",
    maxTokens: 16000, responseSchema: PLAN_SCHEMA, validateStageResult,
    userMessage: planMessage,
    systemPrompt: `Plan an educational resource; do not write questions or solutions. Return the supplied JSON schema.
Resolve the tutor's exact scope and exclusions using the supplied references. Topics must each quote exact evidence from the user's message or references. A textbook title alone does not establish its chapter contents. If the topic list or exclusions cannot be established, return a non-empty clarification and empty topics/questions; never invent a contents list. If the request clearly belongs to a different subject than the selected subject (for example, an English reading or writing paper with maths selected), return a clarification and empty topics/questions. Write any clarification other than "SIZE_LIMIT" as one or two plain sentences addressed to the tutor that name exactly what is unclear or mismatched and what to change, e.g. "The prompt describes an English paper, but the subject is set to Maths. Change the subject to English or rewrite the prompt for maths."
For "N per topic", allocate exactly N questions to EACH eligible topic. Otherwise obey any requested total. For timed papers, allocate sections, progressively harder questions and marks that reasonably fit the sitting time. Use a reasonable number of main questions with labelled parts to combine related skills. topics may group by chapter; sourceIds track detailed coverage independently of the primary topic label. Aim for the sitting time with representative chapter coverage. If the coverage is ambitious, produce a usable plan and let the review flag the trade-off; do not return a clarification solely for workload or coverage concerns. Do not silently reduce scope to fit a limit: if the resolved total exceeds ${MAX_QUESTIONS}, set clarification to "SIZE_LIMIT" and leave questions empty. Use consecutive global numbers from 1; assign each a topic, section, difficulty and marks. section is the student-facing heading a question is printed under, shared by every question in that section, e.g. "Section A: Reading" or "Section B: Writing"; never describe the parts, type or labels of its questions there. Give every question sourceIds from the eligible reference inventory (multiple IDs allowed when the actual multipart question tests those skills), and a realistic positive estimatedMinutes. For chapter coverageMode, sample across every eligible chapter; do not force every subsection into a timed paper. For section coverageMode, aim to cover every requested ID. Balance chapter marks fairly. Do not merely attach IDs to questions that do not test them. Sum the question minutes to 75–100% of the requested sitting time; preserve the exact requested timeAllowed. Without coded references use an empty sourceIds array. Supply title and timeAllowed (empty for untimed worksheets). For a paper whose request names no sitting time, choose a realistic one for the year level and question count. clarification must be empty when the scope is resolved.`,
  });
  validateStageResult({ parsed: modelPlan });
  const { plan, reassigned, added } = reconcilePlanTopics(modelPlan);
  const planWarnings = evidenceWarnings(plan, planMessage);
  if (job.resourceType === "practice-paper") plan.timeAllowed = plannedTimeAllowed(plan);
  noteProgress(job, { questionCount: plan.questions.length });
  resourceEvent(job, "plan.resolved", { stageId: "plan.v2", questionCount: plan.questions.length, generationVersion: 1,
    topicsReassigned: reassigned.length, topicsAdded: added.length, unmatchedEvidence: unmatchedEvidenceTopics(plan, planMessage).length });
  const contentOptions = { year: job.year, subject: job.subject, answerMode: "none", hasStimulus, stimulusImages };
  const answerKey = job.subject === "english" ? "markingGuide" : "answers";
  const fullSchema = buildResponseSchema(job.resourceType, { subject: job.subject, answerMode: job.answerMode, hasStimulus });
  const answerSchema = obj({ [answerKey]: fullSchema.properties[answerKey] });
  const chunks = [];
  const batchSize = job.answerMode === "worked" ? 5 : 10;

  // RES-91. The first question batch writes the stimulus booklet: the sourced
  // texts plus any the model wrote itself (a contemporary extract alongside a
  // sourced poem). Only the sourced ones are in the request, so the answer
  // stages and later question batches never saw the model's own texts: answers
  // to questions on Text 2 and Text 3 said the texts were missing. Every later
  // stage is now given the booklet exactly as the student will see it.
  let fixedStimulus = null;
  const stimulusNote = (forAnswers) => {
    if (!fixedStimulus) return "";
    const numbered = fixedStimulus.map((entry, i) => ({ text: i + 1, ...entry }));
    return forAnswers
      ? `\n\nFINAL STIMULUS — every text in the student's stimulus booklet, numbered as the questions refer to them ("Text 1" is text 1). All of them are present: answer from these texts and quote them as evidence. Never say a text is missing.\n${JSON.stringify(numbered)}`
      : `\n\nFINAL STIMULUS — the stimulus booklet is already written. Write these questions against these texts, referring to them by these numbers. Set "stimulus" to null in this response; do not write new texts.\n${JSON.stringify(numbered)}`;
  };

  async function batch(specs, path) {
    const prior = chunks.flatMap((p) => questionRows(p, job.resourceType)).map((q) => q.stem);
    let result;
    try {
      result = await callAi({ ...request, stageId: `questions.${path}`, splitAllowed: specs.length > 1,
        stageLabel: `Writing questions ${specs[0].number}–${specs.at(-1).number} of ${plan.questions.length}`,
        maxTokens: 16000, systemPrompt: buildSystemPrompt(job.resourceType, contentOptions),
        responseSchema: buildResponseSchema(job.resourceType, contentOptions),
        validateStageResult: (r) => validateQuestions(r, specs, job.resourceType, prior),
        userMessage: `${request.userMessage}\n\nSAVED PLAN (overrides whole-resource counts for this response): ${JSON.stringify(specs)}\nGenerate ONLY these question numbers, topics, difficulty, sections and exact marks. Preserve global numbering. Do not include solutions or marking guides in this response. Return the normal resource shape for this batch. Avoid these earlier stems: ${JSON.stringify(prior)}${stimulusNote(false)}`,
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
    // The first batch's stimulus is the paper's (assembly spreads chunks[0]).
    if (!fixedStimulus && hasStimulus && Array.isArray(part.stimulus) && part.stimulus.length) fixedStimulus = part.stimulus;
    const questions = questionRows(part, job.resourceType);
    if (job.answerMode !== "none") {
      const answers = await solutionBatch(questions, path);
      part[answerKey] = answers;
    }
    chunks.push(part);
    noteProgress(job, { questionsWritten: specs.length });
  }

  async function solutionBatch(questions, path) {
    try {
      const result = await callAi({ ...request, stageId: `solutions.${path}`, splitAllowed: questions.length > 1,
        stageLabel: `Writing solutions for questions ${questions[0].number}–${questions.at(-1).number}`,
        maxTokens: 16000, responseSchema: answerSchema,
        validateStageResult: (r) => validateAnswers(r, questions, answerKey),
        userMessage: `${request.userMessage}\n\nWrite ONLY the ${answerKey} object for these SAVED questions. Do not rewrite or renumber questions. Include exactly one row per question, or one per labelled part for multipart questions. ${job.answerMode === "worked" ? "Give complete worked solutions/model responses." : "Give final answers/marking criteria only."}\n${JSON.stringify(questions)}${stimulusNote(true)}`,
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
      parsed.sections = [...new Set(plan.questions.map((q) => sectionTitle(q.section)))].map((title) => ({ title,
        questions: rows.filter((q) => sectionTitle(plan.questions[q.number - 1].section) === title) }));
    } else { parsed.questions = rows; parsed.topic = plan.topics.map((t) => t.name).join(", "); }
    validateQuestions({ parsed }, plan.questions, job.resourceType);
    if (job.answerMode !== "none") validateAnswers({ parsed }, rows, answerKey);
    return { parsed, raw: JSON.stringify(parsed) };
  });
  const review = await verifyPlannedContent({ job, request, callAi, plan, parsed: assembled.parsed, scope });
  return { ...assembled, reviewStatus: review.status, contentReview: review.summary,
    warnings: [...planWarnings, ...validatePlannedCoverage(plan, scope), ...review.warnings] };
}

module.exports = { clarificationMessage, questionRows, sectionTitle, answerClaimsMissingContext, usesPlannedGeneration, generatePlannedResource, perTopicCount, plannedTimeAllowed, validatePlan, reconcilePlanTopics, unmatchedEvidenceTopics, evidenceWarnings, validateQuestions, validateAnswers };
