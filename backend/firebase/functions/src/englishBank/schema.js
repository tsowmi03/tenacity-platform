"use strict";

// RES-64. The structured output for one page of an English source. The
// extraction prompt and batching are RES-66; this fixes the shape the model
// must return, built from the taxonomy so it can't invent a type or
// technique.
//
// A page can hold any mix of stimuli, questions and marking-guide entries. A
// passage that runs across pages comes back once per page with continuesPrevious
// or continuesNext set, and the record builder joins the pieces.

const { ALL_TECHNIQUES, DIFFICULTIES, QUESTION_TYPES, SKILLS, STIMULUS_TYPE_IDS } = require("./taxonomy");

const PAGE_KINDS = Object.freeze(["stimulus", "questions", "mixed", "marking_guide", "instructions", "other"]);

const nullableString = { type: ["string", "null"] };
const box = {
  type: "object",
  additionalProperties: false,
  required: ["x0", "y0", "x1", "y1"],
  properties: { x0: { type: "integer" }, y0: { type: "integer" }, x1: { type: "integer" }, y1: { type: "integer" } },
};
const nullableBox = { anyOf: [box, { type: "null" }] };

const technique = {
  type: "object",
  additionalProperties: false,
  required: ["technique", "evidence", "box"],
  properties: {
    technique: { type: "string", enum: ALL_TECHNIQUES },
    // Written: the exact words from the stimulus. Visual: the part of the image.
    evidence: { type: "string" },
    // Visual only: where on the page that part of the image is.
    box: nullableBox,
  },
};

const stimulus = {
  type: "object",
  additionalProperties: false,
  required: ["label", "type", "title", "author", "publication", "continuesPrevious", "continuesNext", "text", "visualDescription", "box", "techniques", "themes", "yearLevel", "difficulty"],
  properties: {
    // As printed ("Text 1", "Source B"), or null when unlabelled.
    label: nullableString,
    type: { type: "string", enum: STIMULUS_TYPE_IDS },
    title: nullableString,
    author: nullableString,
    publication: nullableString,
    continuesPrevious: { type: "boolean" },
    continuesNext: { type: "boolean" },
    // Exactly as printed on this page; null for a visual with no body text.
    text: nullableString,
    visualDescription: nullableString,
    box,
    techniques: { type: "array", items: technique },
    themes: { type: "array", items: { type: "string" } },
    yearLevel: nullableString,
    difficulty: { type: "string", enum: DIFFICULTIES },
  },
};

const question = {
  type: "object",
  additionalProperties: false,
  required: ["label", "stimulusLabels", "text", "marks", "questionType", "skill", "techniques", "difficulty"],
  properties: {
    label: { type: "string" },
    // The labels of the stimuli the question is about; empty when it names none.
    stimulusLabels: { type: "array", items: { type: "string" } },
    text: { type: "string" },
    marks: { type: ["integer", "null"] },
    questionType: { type: "string", enum: QUESTION_TYPES },
    skill: { type: "string", enum: SKILLS },
    techniques: { type: "array", items: { type: "string", enum: ALL_TECHNIQUES } },
    difficulty: { type: "string", enum: DIFFICULTIES },
  },
};

const guideEntry = {
  type: "object",
  additionalProperties: false,
  required: ["questionLabel", "marks", "criteria", "sampleAnswer"],
  properties: {
    questionLabel: { type: "string" },
    marks: { type: ["integer", "null"] },
    criteria: nullableString,
    sampleAnswer: nullableString,
  },
};

const PAGE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["pageKind", "stimuli", "questions", "guideEntries"],
  properties: {
    pageKind: { type: "string", enum: PAGE_KINDS },
    stimuli: { type: "array", items: stimulus },
    questions: { type: "array", items: question },
    guideEntries: { type: "array", items: guideEntry },
  },
});

module.exports = { PAGE_KINDS, PAGE_SCHEMA };
