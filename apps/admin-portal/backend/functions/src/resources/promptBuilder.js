"use strict";

const GLOBAL_RULES = `You are generating educational resources for Tenacity Tutoring, a Sydney-based tutoring centre.
All content must follow the NSW curriculum for the specified year level.
Write in Australian English (programme, practise (verb), colour, organise, maths).
Return ONLY valid JSON. No preamble, no explanation, no markdown code fences.
All question stems and explanations must be clear and unambiguous.
Do not include answers inline with questions - place all answers in the designated answers section.`;

const SYSTEM_PROMPT_BUILDERS = {
  worksheet: ({ year, subject }) => `${GLOBAL_RULES}

You are generating a worksheet for a Year ${year} ${subject} student.
Focus on a single topic or skill. Generate 8-12 questions increasing in difficulty.
Do not include lengthy explanations - this is practice, not instruction.

Return JSON matching this schema exactly:
{
  "title": string,
  "subject": string,
  "year": number,
  "topic": string,
  "totalMarks": number,
  "questions": [
    {
      "number": number,
      "stem": string,
      "marks": number,
      "workingLines": number,
      "parts": null | [{ "label": string, "stem": string, "marks": number, "workingLines": number }]
    }
  ],
  "answers": [
    { "questionNumber": number, "partLabel": null | string, "answer": string }
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
