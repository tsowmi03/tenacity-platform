"use strict";

// RES-102. What each resource type contains, in words the resource assistant
// can pass on to a tutor. Every section names the response-schema properties
// it covers (responseSchema.js, which is the shape each builder renders), and
// test/unit/resourceTypeDescriptors.test.js fails if a type gains, loses or
// renames a property without this file following. That keeps the assistant
// from promising a section the builder can't print, or missing one it can.
//
// `tutorCopy: true` covers the answers (maths) or marking guide (English)
// property, whose name depends on the subject.

const RESOURCE_TYPE_DESCRIPTORS = Object.freeze({
  "practice-paper": {
    label: "Practice Paper",
    subjects: ["maths", "english"],
    hasQuestions: true,
    purpose: "Exam-style paper that mirrors a school or past paper, with a total mark and time allowed.",
    length: "A full paper: usually 3 to 5 sections, 45 to 120 minutes. A reference past paper is recommended.",
    sections: [
      { keys: ["sections"], label: "Exam sections", description: "Titled sections of exam-style questions, with marks and multi-part questions." },
      { keys: ["stimulus"], label: "Stimulus texts", description: "Reading texts the questions refer to.", subjects: ["english"] },
    ],
    tutorCopy: true,
  },
  "topic-booklet": {
    label: "Topic Booklet",
    subjects: ["maths", "english"],
    hasQuestions: true,
    purpose: "Teaches one topic from scratch: explanations and examples, practice after each sub-topic, then a quiz.",
    length: "The longest type: usually 3 to 6 sub-topics, each with practice questions, plus an end-of-topic quiz.",
    sections: [
      { keys: ["learningObjectives", "nesaOutcomes"], label: "Learning objectives", description: "What the student will be able to do, with NESA outcomes where they apply." },
      { keys: ["frontStimulusSourceNumbers"], label: "Stimulus booklet", description: "Reading texts printed at the front and referred to through the booklet.", subjects: ["english"] },
      { keys: ["subTopics"], label: "Sub-topics", description: "For each sub-topic: an explanation, definitions, worked examples (maths) or model analysis and an exemplar paragraph (English), a tip, a common mistake and practice questions." },
      { keys: ["quickReference"], label: "Quick reference", description: "A one-page summary of the key ideas." },
      { keys: ["endQuiz"], label: "End-of-topic quiz", description: "Sections of questions covering what the booklet taught." },
    ],
    tutorCopy: true,
  },
  "study-guide": {
    label: "Study Guide",
    subjects: ["maths", "english"],
    hasQuestions: false,
    purpose: "Dense revision notes for before a test. No questions to answer.",
    length: "Usually 4 to 8 sections.",
    sections: [
      { keys: ["sections"], label: "Revision sections", description: "For each section: a summary, key points, definitions, and formulas (maths) or quotations and context notes (English)." },
      { keys: ["quickReference"], label: "Quick reference", description: "A one-page summary of the key ideas." },
      { keys: ["stimulus"], label: "Stimulus texts", description: "Texts the notes discuss.", subjects: ["english"] },
    ],
    tutorCopy: false,
  },
  worksheet: {
    label: "Worksheet",
    subjects: ["maths", "english"],
    hasQuestions: true,
    purpose: "Practice on one topic, getting harder as it goes.",
    length: "Usually 8 to 12 questions.",
    sections: [
      { keys: ["questions"], label: "Questions", description: "One run of questions on a single topic, increasing in difficulty." },
      { keys: ["stimulus"], label: "Stimulus texts", description: "A reading text the questions refer to.", subjects: ["english"] },
    ],
    tutorCopy: true,
  },
  "diagnostic-test": {
    label: "Diagnostic Test",
    subjects: ["maths", "english"],
    hasQuestions: true,
    purpose: "Finds gaps: short questions spread across the sub-topics of a unit, each tagged with its sub-topic.",
    length: "Usually 10 to 20 short questions, about one per sub-topic.",
    sections: [
      { keys: ["questions"], label: "Questions", description: "Short questions, each tagged with the sub-topic it tests." },
      { keys: ["stimulus"], label: "Stimulus texts", description: "A reading text the questions refer to.", subjects: ["english"] },
    ],
    tutorCopy: true,
  },
  "mixed-review": {
    label: "Mixed Review",
    subjects: ["maths", "english"],
    hasQuestions: true,
    purpose: "Cumulative revision across several topics, grouped by topic.",
    length: "Usually 3 to 6 topics with 3 to 6 questions each.",
    sections: [
      { keys: ["sections"], label: "Topic sections", description: "One section of questions per topic." },
      { keys: ["stimulus"], label: "Stimulus texts", description: "A reading text the questions refer to.", subjects: ["english"] },
    ],
    tutorCopy: true,
  },
  "annotation-task": {
    label: "Annotation Task",
    subjects: ["english"],
    hasQuestions: true,
    purpose: "Close reading of one passage: identify, explain and analyse techniques.",
    length: "One passage with about 5 to 8 tasks.",
    sections: [
      { keys: ["passageTitle", "passageAuthor", "passageSource", "passageText", "contextNote"], label: "Passage", description: "The passage to annotate, with its source and a short context note." },
      { keys: ["tasks"], label: "Tasks", description: "Numbered tasks (identify, explain, analyse, compare, evaluate), each with marks and an optional focus quote." },
    ],
    tutorCopy: true,
  },
  "essay-scaffold": {
    label: "Essay Scaffold",
    subjects: ["english"],
    hasQuestions: false,
    purpose: "Plans an essay step by step with prompts and sentence starters. The student writes the essay.",
    length: "One essay question with 4 to 6 planner sections.",
    sections: [
      { keys: ["essayType", "essayQuestion", "targetWordCount"], label: "Essay question", description: "The question, essay type and target length." },
      { keys: ["sections"], label: "Planner sections", description: "For each part of the essay: its purpose, suggested length, prompts, sentence starters and planning lines." },
      { keys: ["vocabularyBank"], label: "Vocabulary bank", description: "Useful words and phrases." },
      { keys: ["generalGuidance"], label: "General guidance", description: "Tips for writing the essay." },
      { keys: ["stimulus"], label: "Stimulus texts", description: "A text the essay responds to." },
    ],
    tutorCopy: false,
  },
  custom: {
    label: "Custom",
    subjects: ["maths", "english"],
    hasQuestions: false,
    purpose: "Any other format the tutor describes. Built from headings, paragraphs, lists, tables, note boxes and question sets.",
    length: "Whatever the brief asks for.",
    sections: [
      { keys: ["blocks"], label: "Content blocks", description: "Headings, paragraphs, bullet lists, tables, note boxes, question sets, and an answer or marking section." },
    ],
    tutorCopy: false,
  },
});

// Schema properties that are settings or labels rather than content.
const METADATA_KEYS = Object.freeze(new Set([
  "title", "subject", "year", "topics", "topic", "focus", "totalMarks", "timeAllowed", "resourceType",
]));

function descriptorFor(resourceType) {
  return RESOURCE_TYPE_DESCRIPTORS[resourceType] || null;
}

function resourceTypesForSubject(subject) {
  return Object.entries(RESOURCE_TYPE_DESCRIPTORS)
    .filter(([, descriptor]) => descriptor.subjects.includes(subject))
    .map(([key]) => key);
}

function sectionsFor(resourceType, subject) {
  const descriptor = descriptorFor(resourceType);
  if (!descriptor) return [];
  return descriptor.sections.filter((section) => !section.subjects || section.subjects.includes(subject));
}

module.exports = {
  METADATA_KEYS,
  RESOURCE_TYPE_DESCRIPTORS,
  descriptorFor,
  resourceTypesForSubject,
  sectionsFor,
};
