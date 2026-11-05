"use strict";

// RES-66. The one call made for each page of an English source, as Messages
// API params so it can go to the Batches API or be sent directly. Unlike the
// maths bank there is no separate sort call: nearly every page of an English
// paper or comprehension book holds a stimulus, questions or a marking guide,
// and the call reports the page's kind itself.

const { buildAnthropicSystemParam } = require("../resources/apiClient");
const { readMessage } = require("../questionBank/prompts");
const { PAGE_SCHEMA } = require("./schema");
const { QUESTION_TYPES, SKILLS, STIMULUS_TYPES, TECHNIQUES } = require("./taxonomy");

const ENGLISH_BANK_MODEL = "claude-haiku-5-5";
const PAGE_EFFORT = "medium";
const PAGE_MAX_TOKENS = 16000;

const SYSTEM_PROMPT = "You index pages of NSW school English exam papers, marking guidelines and comprehension books so their texts, questions and marking criteria can be reused. You transcribe printed text exactly, and give precise pixel coordinates.";

function typeList() {
  return Object.entries(STIMULUS_TYPES).map(([id, type]) => `- ${id}: ${type.covers}`).join("\n");
}

const ROLE_NOTES = {
  paper: "The file is a paper, worksheet or book of texts and questions.",
  guide: "The file is a marking guideline, set of sample answers or sample writing booklet for a paper: expect guideEntries rather than stimuli.",
  image: "The file is a single picture used as a visual stimulus: return it as one visual stimulus whose box covers the picture.",
};

function pagePrompt({ sourcePath, role = "paper", pageNumber, width, height, textLayer = null, previousPageText = null }) {
  const textNote = textLayer
    ? `\n\nThe page's own text layer is below. Use it for exact wording, spelling and punctuation, and the image for layout and line breaks:\n<text_layer>\n${textLayer.slice(0, 12000)}\n</text_layer>`
    : "";
  const previousNote = previousPageText
    ? `\n\nThe end of the previous page, to tell whether a text continues from it:\n<previous_page_end>\n${previousPageText.slice(-1500)}\n</previous_page_end>`
    : "";
  return `File: ${sourcePath}
Page ${pageNumber}, ${width}x${height} pixels. ${ROLE_NOTES[role] || ROLE_NOTES.paper}

pageKind: what the page mostly holds (stimulus, questions, mixed, marking_guide, instructions such as a cover or exam rules, or other).

stimuli: each text or image students respond to that appears on this page, in reading order. Not the questions, instructions, headers, footers, page numbers or copyright acknowledgements. Published papers often leave a blank box where an image was removed for copyright: that is not a stimulus, so leave it out.
- text: the stimulus's printed words on this page, exactly as printed, never summarised or corrected. Keep a poem's line breaks and stanza breaks; join a prose paragraph's lines into one line, with a blank line between paragraphs. null for a picture with no body text.
- visualDescription: for a picture, poster, cartoon or other visual, what it shows (layout, people, objects, colours, any words in it). null for a plain written text.
- label: as printed ("Text 1", "Source B", "Extract 2"), or null.
- type, one of:
${typeList()}
- title, author, publication: as printed in the text or its acknowledgement, or null.
- continuesPrevious: the page starts part-way through a text begun on an earlier page. continuesNext: the text runs on past this page.
- box: the whole stimulus on this page, including its title and any image.
- techniques: up to 6 that the stimulus clearly uses. Written techniques: ${TECHNIQUES.written.join(", ")}. Visual techniques: ${TECHNIQUES.visual.join(", ")}. evidence is the exact words copied from the text that show it; for a visual, the part of the image, with its box. A technique whose evidence isn't on this page is left out.
- themes: 1 to 4 short themes or ideas the text explores, e.g. "belonging", "loss of innocence".
- yearLevel: the year the paper or page is written for, e.g. "Year 12", from the file path or the page; null if neither says.
- difficulty: easy, medium or hard to read for a student in that year.

questions: each separately answerable part on this page (3b, not 3), with its printed label prefixed only by "Question" when printed that way.
- text: the question's printed wording, exactly. stimulusLabels: the labels of the texts it is about, as printed; empty if it names none.
- marks: as printed, or null. questionType: ${QUESTION_TYPES.join(", ")}. skill: ${SKILLS.join(", ")}. techniques: any techniques the question names.

guideEntries: on a marking guideline or sample answer page, one entry per question: questionLabel as the paper prints it, marks, criteria (the marking criteria or band descriptors, as printed), sampleAnswer (a sample answer, as printed), null where absent. A question continued from an earlier page gets its own entry with the same label.

Leave a list empty when the page has none. Coordinates are pixels in this image.${textNote}${previousNote}`;
}

function imageBlock(jpeg) {
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } };
}

function buildPageParams({ image, model = ENGLISH_BANK_MODEL, ...page }) {
  return {
    model,
    max_tokens: PAGE_MAX_TOKENS,
    system: buildAnthropicSystemParam({ systemPrompt: SYSTEM_PROMPT }),
    messages: [{ role: "user", content: [imageBlock(image), { type: "text", text: pagePrompt(page) }] }],
    thinking: { type: "adaptive" },
    output_config: { effort: PAGE_EFFORT, format: { type: "json_schema", schema: PAGE_SCHEMA } },
  };
}

module.exports = { ENGLISH_BANK_MODEL, PAGE_MAX_TOKENS, buildPageParams, pagePrompt, readMessage };
