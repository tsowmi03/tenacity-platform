"use strict";

// RES-57. The two calls made for each page, as Messages API params so the same
// request can go to the Batches API or be sent directly:
//
//   1. sort: which of the 23 diagram types the page has (cheap, low effort);
//   2. extract: for a page with a match, the questions and worked examples that
//      use those diagrams, with their tags and a pixel box for each diagram.
//
// Measured on Haiku 5.5 in RES-54 phase 1: sorting matched a check by eye on
// every sample page, and 30 of 31 crops were complete.

const { buildAnthropicSystemParam, assertCompleteResponse, assertNotRefused, normaliseAnthropicUsage, parseAiJsonResponse, responseText } = require("../resources/apiClient");
const { DIAGRAM_TYPES, TYPE_IDS, skillIds } = require("./taxonomy");

const QUESTION_BANK_MODEL = "claude-haiku-5-5";
const SORT_EFFORT = "low";
const EXTRACT_EFFORT = "high";
const SORT_MAX_TOKENS = 4000;
const EXTRACT_MAX_TOKENS = 32000;

const SYSTEM_PROMPT = "You index pages of NSW school maths textbooks, workbooks, exam papers and worksheets so their questions and diagrams can be reused in new booklets. You return exact transcriptions and precise pixel coordinates.";

const box = {
  type: "object",
  additionalProperties: false,
  required: ["x0", "y0", "x1", "y1"],
  properties: { x0: { type: "integer" }, y0: { type: "integer" }, x1: { type: "integer" }, y1: { type: "integer" } },
};

const SORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["types"],
  properties: { types: { type: "array", items: { type: "string", enum: TYPE_IDS } } },
};

function extractSchema(targetTypes) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["units"],
    properties: {
      units: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "label", "skill", "description", "context", "steps", "topic", "yearLevel", "stem", "text", "box", "figures"],
          properties: {
            kind: { type: "string", enum: ["question", "worked_example"] },
            label: { type: "string" },
            skill: { type: "string", enum: skillIds(targetTypes) },
            description: { type: "string" },
            context: { type: "string", enum: ["abstract", "real_world"] },
            steps: { type: "string", enum: ["single", "multi"] },
            topic: { type: "string" },
            yearLevel: { type: ["string", "null"] },
            stem: { type: ["string", "null"] },
            text: { type: "string" },
            box,
            figures: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "box", "description"],
                properties: { type: { type: "string", enum: targetTypes }, box, description: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };
}

function typeList(types) {
  return types.map((type) => `- ${type}: ${DIAGRAM_TYPES[type].covers}`).join("\n");
}

function sortPrompt() {
  return `Which of these kinds of diagram appear on this page as part of a question or worked example?

${typeList(TYPE_IDS)}

A data table counts only when a question uses it, under the type of that question (for example a frequency table for a histogram question is data_display). Ignore decoration (cartoons, mascots, icons, photos that only illustrate), blank answer grids, and diagrams of any other kind such as fraction models, number lines, spinners or measuring instruments. Return each type that appears at least once. An empty list is the right answer for a page with none.`;
}

function extractPrompt({ sourcePath, pageNumber, width, height, targetTypes, textLayer, previousPageText }) {
  const textNote = textLayer
    ? `\n\nThe PDF's own text for this page follows. Use it to get wording and numbers exactly right; it may be out of reading order and has no maths formatting:\n<text_layer>\n${textLayer}\n</text_layer>`
    : "";
  const previousNote = previousPageText
    ? `\n\nThe previous page's text follows. Use it only to complete the stem of a question or worked example that starts there and continues on this page:\n<previous_page>\n${previousPageText}\n</previous_page>`
    : "";
  return `The image is page ${pageNumber} of "${sourcePath}". It is ${width}x${height} pixels; give every coordinate in these pixels, origin top-left.

Only these kinds of diagram matter:
${typeList(targetTypes)}

List each question and worked example on the page that uses at least one of them. Leave out every other unit, and leave out explanations, answers and decoration.
- question: the smallest separately answerable part (2b, not 2). Put instructions shared by the parts in "stem" and the part's own content in "text". Label with the printed numbering, prefixed by the exercise heading when one is visible, e.g. "Exercise 7A Q2b".
- worked_example: a printed example whose full solution is shown, usually headed "Example".
- skill: what the unit asks the student to do, from the list for its diagram's type ("type/other" when none fits).
- description: one line saying what the student must find or show and from what, e.g. "Find the shorter side of a right-angled triangle given the hypotenuse and one side".
- context: real_world when it is set in a situation (a ladder, a field, a journey), otherwise abstract.
- steps: multi when it needs more than one distinct calculation or result.
- topic: the syllabus topic in a few words. yearLevel: the year or stage the page is written for, e.g. "Year 9" or "Stage 5.2", using the file path and the page; null if neither says.
Write all maths in LaTeX between $...$.

"box" covers the whole unit. "figures" lists each diagram of the types above that the unit needs, with its type. Each figure box must contain the entire diagram with all of its labels, measurements and arrows, and nothing from neighbouring questions or answer lines. A diagram shared by several parts belongs to the first of them. A table the question uses counts as a figure of the question's type.${textNote}${previousNote}`;
}

function imageBlock(jpeg) {
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } };
}

function baseParams({ model, maxTokens, effort, schema, content }) {
  return {
    model,
    max_tokens: maxTokens,
    system: buildAnthropicSystemParam({ systemPrompt: SYSTEM_PROMPT }),
    messages: [{ role: "user", content }],
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema } },
  };
}

function buildSortParams({ image, model = QUESTION_BANK_MODEL }) {
  return baseParams({ model, maxTokens: SORT_MAX_TOKENS, effort: SORT_EFFORT, schema: SORT_SCHEMA, content: [imageBlock(image), { type: "text", text: sortPrompt() }] });
}

function buildExtractParams({ image, model = QUESTION_BANK_MODEL, ...page }) {
  return baseParams({
    model,
    maxTokens: EXTRACT_MAX_TOKENS,
    effort: EXTRACT_EFFORT,
    schema: extractSchema(page.targetTypes),
    content: [imageBlock(image), { type: "text", text: extractPrompt(page) }],
  });
}

// Reads a finished message (from a batch result or a direct call) the same way
// the resource generator does, so refusals and truncation fail loudly.
function readMessage(message, maxTokens) {
  const usage = normaliseAnthropicUsage(message.usage);
  assertNotRefused(message);
  const raw = responseText(message);
  assertCompleteResponse(message, raw, maxTokens);
  return { parsed: parseAiJsonResponse(raw, { mathBearing: false }), usage };
}

module.exports = {
  EXTRACT_MAX_TOKENS,
  QUESTION_BANK_MODEL,
  SORT_MAX_TOKENS,
  SORT_SCHEMA,
  buildExtractParams,
  buildSortParams,
  extractPrompt,
  extractSchema,
  readMessage,
  sortPrompt,
};
