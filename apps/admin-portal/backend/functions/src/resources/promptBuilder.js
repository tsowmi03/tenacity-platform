"use strict";

const GLOBAL_RULES = `You are generating educational resources for Tenacity Tutoring, a Sydney-based tutoring centre.
All content must follow the NSW curriculum for the specified year level.
Write in Australian English (programme, practise (verb), colour, organise, maths).
Return ONLY valid JSON. No preamble, no explanation, no markdown code fences.
All question stems and explanations must be clear and unambiguous.
Do not include answers inline with questions - place all answers in the designated answers section.`;

const DIAGRAM_INSTRUCTIONS = `For graphing, statistics, probability, and applied questions that need a non-shape visual, include an optional "diagram" object on the question. If only one sub-part needs a visual, put "diagram" on that part instead. Use null when no diagram is needed.

Supported diagram types and examples:
- parallel-lines: { "type": "parallel-lines", "angles": { "top": "x degrees", "bottom": "55 degrees" }, "labels": { "line1": "l", "line2": "m", "transversal": "t" } }
- number-line: { "type": "number-line", "min": -3, "max": 5, "step": 1, "marks": [{ "value": 2, "label": "x", "open": false }] }
- coordinate-plane: { "type": "coordinate-plane", "minX": -5, "maxX": 5, "minY": -5, "maxY": 5, "points": [{ "x": 2, "y": 3, "label": "A(2,3)" }] }
- function-plot: { "type": "function-plot", "minX": -5, "maxX": 5, "minY": -5, "maxY": 5, "functions": [{ "type": "linear", "m": 1, "b": 2, "label": "y = x + 2" }, { "type": "quadratic", "a": 1, "b": 0, "c": -4, "label": "y = x^2 - 4" }], "points": [{ "x": 2, "y": 0, "label": "(2, 0)" }] }
- fraction-bar: { "type": "fraction-bar", "parts": 5, "shaded": 3, "label": "3/5" }
- pie-chart: { "type": "pie-chart", "slices": [{ "value": 30, "label": "A" }, { "value": 70, "label": "B" }] }
- array: { "type": "array", "rows": 3, "cols": 4, "rowsLabel": "3 rows", "colsLabel": "4 columns", "label": "3 x 4" }
- pictograph: { "type": "pictograph", "title": "Books read", "iconValue": 2, "key": "Each symbol = 2 books", "rows": [{ "label": "Mia", "count": 6 }, { "label": "Noah", "count": 4 }] }
- clock: { "type": "clock", "hour": 3, "minute": 30 }
- spinner: { "type": "spinner", "sectors": [{ "label": "Red", "proportion": 1 }, { "label": "Blue", "proportion": 1 }] }
- bar-graph: { "type": "bar-graph", "title": "Favourite sport", "xLabel": "Sport", "yLabel": "Number of students", "data": [{ "label": "Cricket", "value": 12 }, { "label": "AFL", "value": 18 }] }
- histogram: { "type": "histogram", "title": "Test scores", "xLabel": "Score", "yLabel": "Frequency", "classes": [{ "label": "0-19", "frequency": 2 }, { "label": "20-39", "frequency": 5 }] }
- dot-plot: { "type": "dot-plot", "title": "Number of siblings", "data": [0, 0, 1, 1, 2, 3], "xLabel": "Siblings", "min": 0, "max": 5 }
- scatter-plot: { "type": "scatter-plot", "xLabel": "Hours studied", "yLabel": "Score", "points": [{ "x": 1, "y": 55 }, { "x": 3, "y": 70 }], "lineOfBestFit": true }
- box-plot: { "type": "box-plot", "min": 4, "q1": 8, "median": 12, "q3": 15, "max": 20, "xLabel": "Scores" }
- stem-and-leaf: { "type": "stem-and-leaf", "title": "Scores", "stems": [{ "stem": "6", "leaves": [2, 5, 8] }, { "stem": "7", "leaves": [1, 4] }], "key": "6|2 = 62" }
- tree-diagram: { "type": "tree-diagram", "branches": [{ "label": "H", "prob": "1/2", "children": [{ "label": "H", "prob": "1/2", "outcome": "HH" }, { "label": "T", "prob": "1/2", "outcome": "HT" }] }] }
- venn-diagram: { "type": "venn-diagram", "style": "2-set", "sets": [{ "label": "A" }, { "label": "B" }], "counts": { "A": 7, "B": 5, "AB": 3, "none": 2 } }
- angles: { "type": "angles", "subtype": "on-line", "angles": [50, 70, 60], "labels": ["50 degrees", "x", "60 degrees"] }
- two-way-table: { "type": "two-way-table", "colHeader": "Preferred sport", "rowHeader": "Year group", "cols": ["Soccer", "Tennis", "Cricket"], "rows": ["Year 9", "Year 10"], "data": [[12, 8, 5], [10, 15, 7]], "totals": true }

Shape and measurement diagrams are temporarily disabled. Do not use triangle, rectangle, circle, prism, cylinder, cone, pyramid, net, L-shape, T-shape, or other shape diagram types. Do not include diagrams for pure algebra or linear equations questions. For function plots, always plot the function referenced by the question and use coordinate-pair labels only for marked points.`;

function diagramPrompt(subject) {
  return subject === "maths" ? `\n\n${DIAGRAM_INSTRUCTIONS}` : "";
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
      "parts": null | [{ "label": string, "stem": string, "marks": number, "workingLines": number, "diagram": null | object }]
    }`;

const MATH_ANSWER_RULE = `Include concise answers. Do not include worked-out solutions or "workingOut" unless the tutor specifically asks for working.`;

function answerRule(subject) {
  if (isEnglishSubject(subject)) {
    return `Include a tutor marking guide with suggested responses and marking criteria. Do not use a maths-style answer key.`;
  }
  return MATH_ANSWER_RULE;
}

function practiceAnswerSchema(subject) {
  if (isEnglishSubject(subject)) {
    return `"markingGuide": [
    { "questionNumber": number, "partLabel": null | string, "suggestedResponse": string, "markingCriteria": string[], "marks": number }
  ]`;
  }
  return `"answers": [
    { "questionNumber": number, "partLabel": null | string, "answer": string, "marks": number, "workingOut": null | string }
  ]`;
}

function topicAnswerSchema(subject) {
  if (isEnglishSubject(subject)) {
    return `"markingGuide": [
    { "section": string, "questionNumber": number, "partLabel": null | string, "suggestedResponse": string, "markingCriteria": string[] }
  ]`;
  }
  return `"answers": [
    { "questionNumber": number, "partLabel": null | string, "answer": string, "workingOut": null | string }
  ]`;
}

function diagnosticAnswerSchema(subject) {
  if (isEnglishSubject(subject)) {
    return `"markingGuide": [
    { "questionNumber": number, "subTopic": string, "suggestedResponse": string, "markingCriteria": string[] }
  ]`;
  }
  return `"answers": [
    { "questionNumber": number, "subTopic": string, "answer": string, "note": string, "workingOut": null | string }
  ]`;
}

function standardAnswerSchema(subject) {
  if (isEnglishSubject(subject)) {
    return `"markingGuide": [
    { "questionNumber": number, "partLabel": null | string, "topic": null | string, "suggestedResponse": string, "markingCriteria": string[] }
  ]`;
  }
  return `"answers": [
    { "questionNumber": number, "partLabel": null | string, "answer": string, "workingOut": null | string }
  ]`;
}

const SYSTEM_PROMPT_BUILDERS = {
  "practice-paper": ({ year, subject }) => `${GLOBAL_RULES}

You are generating a practice paper for a Year ${year} ${subject} student.
If a reference document is supplied, mirror its structure, section style, timing, mark distribution, and topic emphasis as closely as possible without copying exact questions. If no reference is supplied, generate a generic Tenacity practice paper.
Include sectioned questions. ${answerRule(subject)}${diagramPrompt(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "focus": null | string,
  "totalMarks": number,
  "timeAllowed": string,
  "sections": [
    {
      "title": string,
      "questions": [${QUESTION_SCHEMA}]
    }
  ],
  ${practiceAnswerSchema(subject)}
}`,

  "topic-booklet": ({ year, subject }) => `${GLOBAL_RULES}

You are generating a topic booklet for a Year ${year} ${subject} student.
Include learning objectives. Include formal NESA outcomes only if supplied in tutor instructions/reference material or clearly inferable from the supplied material.
Include explanations, definitions, worked examples, tips, common mistakes, practice questions, and an end-of-topic quiz. ${answerRule(subject)}${diagramPrompt(subject)}

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topic": string,
  "learningObjectives": string[],
  "nesaOutcomes": null | string[],
  "subTopics": [
    {
      "title": string,
      "explanation": string,
      "definitions": null | [{ "term": string, "definition": string }],
      "workedExamples": null | [{ "title": string, "steps": [{ "working": string, "explanation": string }] }],
      "tip": null | string,
      "commonMistake": null | string,
      "practiceQuestions": [${QUESTION_SCHEMA}]
    }
  ],
  "endQuiz": {
    "sections": [{ "title": string, "questions": [${QUESTION_SCHEMA}] }]
  },
  ${topicAnswerSchema(subject)},
  "quickReference": null | [{ "concept": string, "summary": string }]
}`,

  "study-guide": ({ year, subject }) => `${GLOBAL_RULES}

You are generating a dense study guide for a Year ${year} ${subject} student.
This is a revision reference, not a worksheet. Use concise summaries, key points, formulas when relevant, definitions, and a quick reference section.

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topics": string[],
  "sections": [
    {
      "title": string,
      "summary": string,
      "keyPoints": string[],
      "formulas": null | [{ "name": string, "formula": string, "note": string }],
      "definitions": null | [{ "term": string, "definition": string }]
    }
  ],
  "quickReference": null | [{ "concept": string, "summary": string }]
}`,

  worksheet: ({ year, subject }) => `${GLOBAL_RULES}

You are generating a worksheet for a Year ${year} ${subject} student.
Focus on a single topic or skill. Generate 8-12 questions increasing in difficulty.
Do not include lengthy explanations - this is practice, not instruction.
${answerRule(subject)}

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
  ${standardAnswerSchema(subject)}
}`,

  "diagnostic-test": ({ year, subject }) => `${GLOBAL_RULES}

You are generating a diagnostic test for a Year ${year} ${subject} student.
The purpose is to identify knowledge gaps across a range of sub-topics, not to simulate an exam.
Generate 12-18 questions, one or two per sub-topic, covering breadth not depth. ${answerRule(subject)}${diagramPrompt(subject)}

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
      "type": "short-answer" | "multiple-choice" | "calculation",
      "options": null | string[],
      "marks": number,
      "workingLines": number,
      "diagram": null | object
    }
  ],
  ${diagnosticAnswerSchema(subject)}
}`,

  "mixed-review": ({ year, subject }) => `${GLOBAL_RULES}

You are generating a mixed review sheet for a Year ${year} ${subject} student.
Generate 3-5 topic groups with 4-6 questions each. Questions within each group should increase in difficulty. ${answerRule(subject)}${diagramPrompt(subject)}

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
  ${standardAnswerSchema(subject)}
}`,

  "annotation-task": ({ year }) => `${GLOBAL_RULES}

You are generating an annotation and close reading task for a Year ${year} English student.
If the tutor has provided a passage, use it. Otherwise generate an original suitable passage for the year level. Do not use real published text unless supplied by the tutor.
The tutor-facing section should be a marking guide, not a maths-style answer table.

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": "english",
  "year": number,
  "passageTitle": string,
  "passageAuthor": null | string,
  "passageSource": null | string,
  "passageText": string,
  "contextNote": null | string,
  "tasks": [
    { "number": number, "instruction": string, "type": "identify" | "explain" | "analyse" | "compare" | "evaluate", "marks": number, "focusQuote": null | string, "responseLines": number }
  ],
  "markingGuide": [
    { "taskNumber": number, "suggestedResponse": string, "markingCriteria": string[] }
  ]
}`,

  "essay-scaffold": ({ year }) => `${GLOBAL_RULES}

You are generating an essay planning scaffold for a Year ${year} English student.
This is a structured planning template for one specific essay question or text type. It is not the essay itself.
Include sentence starters and vocabulary suggestions appropriate for the year level.

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": "english",
  "year": number,
  "essayType": string,
  "essayQuestion": string,
  "targetWordCount": number,
  "sections": [
    { "name": string, "purpose": string, "suggestedWordCount": number, "prompts": string[], "sentenceStarters": string[], "planningLines": number }
  ],
  "vocabularyBank": null | string[],
  "generalGuidance": string[]
}`,

  custom: ({ year, subject }) => `${GLOBAL_RULES}

You are generating a polished custom educational resource for a Year ${year} ${subject} student at Tenacity Tutoring.
Infer the best structure from the tutor's instructions, but return content in branded block shapes that can render cleanly to DOCX.
Use Tenacity-friendly block types: heading, paragraph, bulletList, table, noteBox, questionSet, answerSection, and markingGuideSection.
For English resources, use markingGuideSection where appropriate. For maths resources, include concise answers but no worked solutions unless specifically requested.

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

function buildSystemPrompt(resourceType, { year, subject } = {}) {
  const builder = SYSTEM_PROMPT_BUILDERS[resourceType];
  if (!builder) {
    throw new Error(`Unsupported system prompt resource type: ${resourceType}`);
  }
  if (!year) throw new TypeError("buildSystemPrompt requires year");
  if (!subject) throw new TypeError("buildSystemPrompt requires subject");
  return builder({ year, subject });
}

function buildUserMessage(job, uploadedContent) {
  const parts = [];

  if (uploadedContent) {
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
};
