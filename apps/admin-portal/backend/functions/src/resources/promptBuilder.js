"use strict";

const {
  buildDiagramPromptExamples,
  disabledDiagramTypes,
} = require("./diagramRegistry");
const {
  includesWorking,
  normaliseAnswerMode,
} = require("./answerMode");
const { canonicalTopicList } = require("./topicTaxonomy");
const { HUMAN_WRITING_RULES, AUTHORSHIP_RULES } = require("./humanStyle");

const GLOBAL_RULES = `You are generating educational resources for Tenacity Tutoring, a Sydney-based tutoring centre.
All content must follow the NSW curriculum for the specified year level.
Write in Australian English (programme, practise (verb), colour, organise, maths).
Return ONLY valid JSON. No preamble, no explanation, no markdown code fences.
All question stems and explanations must be clear and unambiguous.

${HUMAN_WRITING_RULES}

${AUTHORSHIP_RULES}`;

const DISABLED_SHAPE_TYPE_LIST = disabledDiagramTypes().join(", ");
const DISABLED_DIAGRAM_SENTENCE = DISABLED_SHAPE_TYPE_LIST
  ? `Some diagram types are temporarily disabled. Do not use these diagram types: ${DISABLED_SHAPE_TYPE_LIST}. `
  : "";

const DIAGRAM_INSTRUCTIONS = `For graphing, statistics, probability, and applied questions that need a visual, include an optional "diagram" object on the question. If only one sub-part needs a visual, put "diagram" on that part instead. Use null when no diagram is needed.

Whenever "diagram" is an object, also set "diagramRequired" on the same question or part:
- true when the question cannot be answered correctly without seeing the diagram.
- false when the diagram is helpful but the written question remains complete without it.
When "diagram" is null, set "diagramRequired" to false.

Supported diagram types and examples:
${buildDiagramPromptExamples()}

${DISABLED_DIAGRAM_SENTENCE}Do not include diagrams for pure algebra or linear equations questions. For function plots, always plot the function referenced by the question and use coordinate-pair labels only for marked points.

Maths formatting rules — STRICT: the document renderer only supports the constructs listed below. Using anything else will produce broken output in the final document.
ALLOWED constructs:
- Fractions: \\frac{a}{b} — e.g. \\frac{3x+1}{2}. NEVER use \\dfrac, \\tfrac, \\cfrac, or (a)/(b) slash notation.
- Square roots: \\sqrt{expr} — e.g. \\sqrt{50}. Nth roots: \\sqrt[n]{expr} — e.g. \\sqrt[3]{8}.
- Exponents: x^{2} for multi-character or x^2 for single character — e.g. x^{2}, 2^{32}, x^{n+1}.
- Greek / special symbols (write exactly as shown): \\pi \\Delta \\delta \\theta \\alpha \\beta \\gamma \\lambda \\mu \\sigma \\pm \\times \\div \\leq \\geq \\neq \\approx \\infty
- Trig and log functions: write as plain text — sin, cos, tan, log, ln (no backslash, no \\operatorname{}).
NOT ALLOWED (will break the renderer):
- Do NOT wrap any math in $ or $$ delimiters. Write all math inline without any delimiters.
- Do NOT use \\dfrac, \\tfrac, \\cfrac — only \\frac is supported.
- Do NOT use \\left or \\right size qualifiers.
- Do NOT use \\displaystyle, \\text{}, \\mathrm{}, \\mathbf{}, \\mathit{}, \\operatorname{} or any other font or environment command.
- Do NOT use \\begin{...}...\\end{...} LaTeX environments of any kind.
- For "complete the table of values" questions, always include BOTH the x row and the y row as a markdown pipe table in the question stem. The x row contains the given values; the y row has a single space in each blank cell for students to complete. Never omit the x row. Example:
| x | -2 | -1 | 0 | 1 | 2 |
|---|----|----|---|---|---|
| y |    |    |   |   |   |`;

function diagramPrompt(subject) {
  return subject === "maths" ? `\n\n${DIAGRAM_INSTRUCTIONS}` : "";
}

/**
 * Guidance for the "topics" array used by the resource suggestion system.
 * Constrains the AI to a canonical vocabulary so the same concept produces the
 * same string every time (see topicTaxonomy.js). `textTitle` allows specific
 * text titles (e.g. "Macbeth") in addition to the canonical skills.
 */
function topicsInstruction(subject, { textTitle = false } = {}) {
  const titleSentence = textTitle
    ? ' If the resource is based on a specific text, include the text title (e.g. "Macbeth") as the first topic, then the relevant skills.'
    : "";
  return `Populate the "topics" array with the syllabus topics this resource covers, for search and reuse. Use ONLY these canonical names where they apply: ${canonicalTopicList(subject)}.${titleSentence} Use between 1 and 6 topics. Do not invent names outside this list except for specific text titles.`;
}

function isEnglishSubject(subject) {
  return String(subject || "").toLowerCase() === "english";
}

const QUESTION_SCHEMA = `{
      "number": number,
      "stem": string,
      "marks": number,
      "workingLines": number,
      "diagram": null | object,
      "diagramRequired": boolean,
      "parts": null | [{ "label": string (single letter only, no parentheses — use "a" not "(a)"), "stem": string, "marks": number, "workingLines": number, "diagram": null | object, "diagramRequired": boolean }]
    }`;

const MATH_ANSWER_RULE = `Do not include answers inline with questions. Put them only in the designated "answers" array. The "answer" field must contain ONLY the final answer (e.g. "x = 3", "y = 2x + 1"). Never include working steps, derivations, or explanations in the "answer" field. Set "workingOut" to null.`;

function answerRule(subject, answerMode) {
  if (answerMode === "none") {
    return isEnglishSubject(subject)
      ? `Do not include answers, suggested responses, marking criteria, or a marking guide. Return an empty "markingGuide" array.`
      : `Do not include answers or worked solutions. Return an empty "answers" array.`;
  }
  if (isEnglishSubject(subject)) {
    if (includesWorking(answerMode)) {
      return `Do not include answers inline with questions. Include a tutor marking guide with full suggested model responses and marking criteria.`;
    }
    return `Do not include answers inline with questions. Include a tutor marking guide with marking criteria and rubric points only. Do NOT write full sample answer responses — keep "suggestedResponse" to a brief summary of key points expected.`;
  }
  if (includesWorking(answerMode)) {
    return `Do not include answers inline with questions. Put them only in the designated "answers" array. The "answer" field must contain ONLY the final answer (e.g. "x = 3", "169.65 m²") — no steps, explanations, or caveats. The "workingOut" field must contain clean, professional, step-by-step working for every question — do not leave it null.

WORKING OUT RULES (strictly enforced):
1. Write exactly the logical steps a teacher would write on a whiteboard. Each step follows directly from the previous one.
2. NEVER write out loud. The following are BANNED from workingOut: "Wait", "Actually", "Let me re-check", "Hmm", "Note:", "Re-checking", "I made an error", or ANY self-correction or meta-commentary. If your reasoning produces an error, silently discard it and write only the correct solution.
3. The final numerical value or expression in "workingOut" MUST match "answer" exactly. Compute the answer via the working first, then copy that exact final value into "answer".`;
  }
  return MATH_ANSWER_RULE;
}

function practiceAnswerSchema(subject, answerMode) {
  if (isEnglishSubject(subject)) {
    if (answerMode === "none") return `"markingGuide": []`;
    return `"markingGuide": [
    { "questionNumber": number, "partLabel": null | string (single letter only, no parentheses), "suggestedResponse": string, "markingCriteria": string[], "marks": number }
  ]`;
  }
  if (answerMode === "none") return `"answers": []`;
  const workingField = includesWorking(answerMode)
    ? `"workingOut": string (step-by-step working)`
    : `"workingOut": null`;
  return `"answers": [
    { "questionNumber": number, "partLabel": null | string (single letter only, no parentheses — use "a" not "(a)"), "answer": string (final answer only, no working steps), "marks": number, ${workingField} }
  ]`;
}

function topicAnswerSchema(subject, answerMode) {
  if (isEnglishSubject(subject)) {
    if (answerMode === "none") return `"markingGuide": []`;
    return `"markingGuide": [
    { "section": string, "questionNumber": number, "partLabel": null | string, "suggestedResponse": string, "markingCriteria": string[] }
  ]`;
  }
  if (answerMode === "none") return `"answers": []`;
  const workingField = includesWorking(answerMode)
    ? `"workingOut": string (step-by-step working)`
    : `"workingOut": null`;
  return `"answers": [
    { "questionNumber": number, "partLabel": null | string, "answer": string, ${workingField} }
  ]`;
}

function diagnosticAnswerSchema(subject, answerMode) {
  if (isEnglishSubject(subject)) {
    if (answerMode === "none") return `"markingGuide": []`;
    return `"markingGuide": [
    { "questionNumber": number, "subTopic": string, "suggestedResponse": string, "markingCriteria": string[] }
  ]`;
  }
  if (answerMode === "none") return `"answers": []`;
  const workingField = includesWorking(answerMode)
    ? `"workingOut": string (step-by-step working)`
    : `"workingOut": null`;
  return `"answers": [
    { "questionNumber": number, "subTopic": string, "answer": string, "note": string, ${workingField} }
  ]`;
}

function standardAnswerSchema(subject, answerMode) {
  if (isEnglishSubject(subject)) {
    if (answerMode === "none") return `"markingGuide": []`;
    return `"markingGuide": [
    { "questionNumber": number, "partLabel": null | string, "topic": null | string, "suggestedResponse": string, "markingCriteria": string[] }
  ]`;
  }
  if (answerMode === "none") return `"answers": []`;
  const workingField = includesWorking(answerMode)
    ? `"workingOut": string (step-by-step working)`
    : `"workingOut": null`;
  return `"answers": [
    { "questionNumber": number, "partLabel": null | string, "answer": string, ${workingField} }
  ]`;
}

// The topic booklet's per-sub-topic content model differs by subject. Maths
// teaches through worked examples (a "working / explanation" step table); English
// teaches through model analysis (quote -> technique -> effect) and a short
// exemplar paragraph. A maths-style "worked example" makes no sense for prose, so
// the schema and the on-page rendering branch rather than forcing one shape.
function bookletContentLine(subject) {
  if (isEnglishSubject(subject)) {
    return `Include explanations, key terms and techniques, model analysis (a quote, the technique it uses, and its effect on the reader), an optional short model paragraph, tips, common mistakes, practice questions, and an end-of-topic quiz. Do NOT include maths-style worked examples or step-by-step "working".`;
  }
  return `Include explanations, definitions, worked examples, tips, common mistakes, practice questions, and an end-of-topic quiz.`;
}

function bookletSubTopicSchema(subject) {
  if (isEnglishSubject(subject)) {
    return `{
      "title": string,
      "explanation": string,
      "definitions": null | [{ "term": string, "definition": string }],
      "modelAnalysis": null | [{ "quote": string, "technique": string, "effect": string }],
      "exemplarParagraph": null | string,
      "tip": null | string,
      "commonMistake": null | string,
      "practiceQuestions": [${QUESTION_SCHEMA}]
    }`;
  }
  return `{
      "title": string,
      "explanation": string,
      "definitions": null | [{ "term": string, "definition": string }],
      "workedExamples": null | [{ "title": string, "steps": [{ "working": string, "explanation": string }] }],
      "tip": null | string,
      "commonMistake": null | string,
      "practiceQuestions": [${QUESTION_SCHEMA}]
    }`;
}

// Study guides diverge the same way: maths sections key off formulas, English
// sections off key quotations and context. Definitions/key-points are shared.
function studyGuideContentLine(subject) {
  if (isEnglishSubject(subject)) {
    return `Use concise summaries, key points, key terms and techniques, key quotations paired with their significance, brief context notes where relevant, and a quick reference section.`;
  }
  return `Use concise summaries, key points, formulas when relevant, definitions, and a quick reference section.`;
}

function studyGuideSectionSchema(subject) {
  if (isEnglishSubject(subject)) {
    return `{
      "title": string,
      "summary": string,
      "keyPoints": string[],
      "definitions": null | [{ "term": string, "definition": string }],
      "quotations": null | [{ "quote": string, "significance": string }],
      "contextNotes": null | string[]
    }`;
  }
  return `{
      "title": string,
      "summary": string,
      "keyPoints": string[],
      "formulas": null | [{ "name": string, "formula": string, "note": string }],
      "definitions": null | [{ "term": string, "definition": string }]
    }`;
}

// "calculation" is a maths-only response type; English diagnostics use written
// responses and multiple choice.
function diagnosticTypeEnum(subject) {
  return isEnglishSubject(subject)
    ? `"short-answer" | "multiple-choice"`
    : `"short-answer" | "multiple-choice" | "calculation"`;
}

const SYSTEM_PROMPT_BUILDERS = {
  "practice-paper": ({ year, subject, answerMode }) => `${GLOBAL_RULES}

You are generating a practice paper for a Year ${year} ${subject} student.
If a reference document is supplied, mirror its structure, section style, timing, mark distribution, and topic emphasis as closely as possible without copying exact questions. If no reference is supplied, generate a generic Tenacity practice paper.
Include sectioned questions. ${answerRule(subject, answerMode)}
${topicsInstruction(subject, { textTitle: isEnglishSubject(subject) })}${diagramPrompt(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topics": string[],
  "focus": null | string,
  "totalMarks": number,
  "timeAllowed": string,
  "sections": [
    {
      "title": string,
      "questions": [${QUESTION_SCHEMA}]
    }
  ],
  ${practiceAnswerSchema(subject, answerMode)}
}`,

  "topic-booklet": ({ year, subject, answerMode }) => `${GLOBAL_RULES}

You are generating a topic booklet for a Year ${year} ${subject} student.
Include learning objectives. Include formal NESA outcomes only if supplied in tutor instructions/reference material or clearly inferable from the supplied material.
${bookletContentLine(subject)} ${answerRule(subject, answerMode)}${diagramPrompt(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topic": string,
  "learningObjectives": string[],
  "nesaOutcomes": null | string[],
  "subTopics": [
    ${bookletSubTopicSchema(subject)}
  ],
  "endQuiz": {
    "sections": [{ "title": string, "questions": [${QUESTION_SCHEMA}] }]
  },
  ${topicAnswerSchema(subject, answerMode)},
  "quickReference": null | [{ "concept": string, "summary": string }]
}`,

  "study-guide": ({ year, subject }) => `${GLOBAL_RULES}

You are generating a dense study guide for a Year ${year} ${subject} student.
This is a revision reference, not a worksheet. ${studyGuideContentLine(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topics": string[],
  "sections": [
    ${studyGuideSectionSchema(subject)}
  ],
  "quickReference": null | [{ "concept": string, "summary": string }]
}`,

  worksheet: ({ year, subject, answerMode }) => `${GLOBAL_RULES}

You are generating a worksheet for a Year ${year} ${subject} student.
Focus on a single topic or skill. Generate 8-12 questions increasing in difficulty.
Do not include lengthy explanations - this is practice, not instruction.
${answerRule(subject, answerMode)}

${diagramPrompt(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topic": string,
  "totalMarks": number,
  "questions": [
    ${QUESTION_SCHEMA}
  ],
  ${standardAnswerSchema(subject, answerMode)}
}`,

  "diagnostic-test": ({ year, subject, answerMode }) => `${GLOBAL_RULES}

You are generating a diagnostic test for a Year ${year} ${subject} student.
The purpose is to identify knowledge gaps across a range of sub-topics, not to simulate an exam.
Generate 12-18 questions, one or two per sub-topic, covering breadth not depth. ${answerRule(subject, answerMode)}${diagramPrompt(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topics": string[],
  "totalMarks": number,
  "questions": [
    {
      "number": number,
      "subTopic": string,
      "stem": string,
      "type": ${diagnosticTypeEnum(subject)},
      "options": null | string[],
      "marks": number,
      "workingLines": number,
      "diagram": null | object,
      "diagramRequired": boolean
    }
  ],
  ${diagnosticAnswerSchema(subject, answerMode)}
}`,

  "mixed-review": ({ year, subject, answerMode }) => `${GLOBAL_RULES}

You are generating a mixed review sheet for a Year ${year} ${subject} student.
Generate 3-5 topic groups with 4-6 questions each. Questions within each group should increase in difficulty. ${answerRule(subject, answerMode)}${diagramPrompt(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topics": string[],
  "totalMarks": number,
  "sections": [
    { "topic": string, "questions": [${QUESTION_SCHEMA}] }
  ],
  ${standardAnswerSchema(subject, answerMode)}
}`,

  "annotation-task": ({ year, answerMode }) => `${GLOBAL_RULES}

You are generating an annotation and close reading task for a Year ${year} English student.
If the tutor has provided a passage, use it. Otherwise either write an original passage suitable for the year level, or use a genuine public-domain text. Follow the SOURCES AND AUTHORSHIP rules above: set "passageAuthor" to "Tenacity Resources" for any passage you write yourself, or to the real author (with "passageSource" naming the work) for a public-domain text. Always set "passageAuthor". Do not use copyright text unless the tutor supplies it.
The tutor-facing section should be a marking guide, not a maths-style answer table.
${answerRule("english", answerMode)}
${topicsInstruction("english", { textTitle: true })}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": "english",
  "year": number,
  "topics": string[],
  "passageTitle": string,
  "passageAuthor": null | string,
  "passageSource": null | string,
  "passageText": string,
  "contextNote": null | string,
  "tasks": [
    { "number": number, "instruction": string, "type": "identify" | "explain" | "analyse" | "compare" | "evaluate", "marks": number, "focusQuote": null | string, "responseLines": number }
  ],
  ${answerMode === "none"
    ? `"markingGuide": []`
    : `"markingGuide": [
    { "taskNumber": number, "suggestedResponse": string, "markingCriteria": string[] }
  ]`}
}`,

  "essay-scaffold": ({ year }) => `${GLOBAL_RULES}

You are generating an essay planning scaffold for a Year ${year} English student.
This is a structured planning template for one specific essay question or text type. It is not the essay itself.
Include sentence starters and vocabulary suggestions appropriate for the year level.
${topicsInstruction("english", { textTitle: true })}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": "english",
  "year": number,
  "topics": string[],
  "essayType": string,
  "essayQuestion": string,
  "targetWordCount": number,
  "sections": [
    { "name": string, "purpose": string, "suggestedWordCount": number, "prompts": string[], "sentenceStarters": string[], "planningLines": number }
  ],
  "vocabularyBank": null | string[],
  "generalGuidance": string[]
}`,

  custom: ({ year, subject, answerMode }) => `${GLOBAL_RULES}

You are generating a polished custom educational resource for a Year ${year} ${subject} student at Tenacity Tutoring.
Infer the best structure from the tutor's instructions, but return content in branded block shapes that can render cleanly to DOCX.
Use Tenacity-friendly block types: heading, paragraph, bulletList, table, noteBox, questionSet, answerSection, and markingGuideSection.
${answerMode === "none"
    ? "Do not include answerSection or markingGuideSection blocks unless the tutor explicitly requests them."
    : "For English resources, use markingGuideSection where appropriate. For maths resources, use answerSection blocks."}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "resourceType": "custom",
  "topic": null | string,
  "blocks": [
    { "type": "heading", "text": string } |
    { "type": "paragraph", "text": string } |
    { "type": "bulletList", "items": string[] } |
    { "type": "table", "headers": string[], "rows": string[][] } |
    { "type": "noteBox", "title": string, "text": string } |
    { "type": "questionSet", "questions": [${QUESTION_SCHEMA}] } |
    { "type": "answerSection", "title": string, "answers": [{ "questionNumber": number, "partLabel": null | string, "answer": string }] } |
    { "type": "markingGuideSection", "title": string, "guidance": [{ "questionNumber": number, "partLabel": null | string, "suggestedResponse": string, "markingCriteria": string[] }] }
  ]
}`,
};

function buildSystemPrompt(resourceType, {
  year,
  subject,
  answerMode,
  includeWorking = false,
} = {}) {
  const builder = SYSTEM_PROMPT_BUILDERS[resourceType];
  if (!builder) {
    throw new Error(`Unsupported system prompt resource type: ${resourceType}`);
  }
  if (!year) throw new TypeError("buildSystemPrompt requires year");
  if (!subject) throw new TypeError("buildSystemPrompt requires subject");
  return builder({
    year,
    subject,
    answerMode: normaliseAnswerMode({ answerMode, includeWorking }),
  });
}

function buildUserMessage(job, uploadedContent) {
  const parts = [];

  if (Array.isArray(uploadedContent) && uploadedContent.length) {
    parts.push(uploadedContent.map((reference, index) =>
      `REFERENCE DOCUMENT ${index + 1} (${reference.fileName || "uploaded file"}):\n\n${reference.content || ""}`
    ).join("\n\n---\n\n"));
  } else if (uploadedContent) {
    parts.push(`REFERENCE DOCUMENT (${job.uploadedFileName || "uploaded file"}):\n\n${uploadedContent}`);
  }

  if (job.customPrompt) {
    parts.push(`TUTOR INSTRUCTIONS:\n\n${job.customPrompt}`);
  }

  parts.push(
    `Generate a ${String(job.resourceType || "resource").replace(/-/g, " ")} for a Year ${job.year} ${job.subject} student.`
  );

  return parts.join("\n\n---\n\n");
}

module.exports = {
  GLOBAL_RULES,
  SYSTEM_PROMPT_BUILDERS,
  buildSystemPrompt,
  buildUserMessage,
  isEnglishSubject,
};
