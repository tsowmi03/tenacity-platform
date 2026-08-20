"use strict";

const { shouldIncludeAnswers } = require("../answerMode");
const {
  asArray,
  makeDetailLine,
  makeMarkingGuide,
  makePageBreak,
  makeParagraphs,
  makeSectionHeading,
  makeShadedBox,
  makeSpacer,
  makeSubHeading,
  packDocument,
  renderLeadParagraph,
} = require("./common");
const { BRAND } = require("./branding");
const {
  cleanText,
  makeQuestionParagraph,
  makeResponseLines,
  paragraph,
  responseLineCount,
} = require("./shared");
const { makePassageContent, splitPassageBlocks } = require("./passage");
const {
  assertArray,
  assertNumber,
  assertObject,
  assertText,
  optionalText,
  optionalTopics,
  validateBaseResource,
  validateMarkingGuideArray,
} = require("./validation");

function validateAnnotationTaskResource(resource, options = {}) {
  validateBaseResource(resource, "annotationTask");
  optionalTopics(resource.topics);
  assertText(resource.passageTitle, "annotationTask.passageTitle");
  assertText(resource.passageText, "annotationTask.passageText");
  assertArray(resource.tasks, "annotationTask.tasks", { min: 1 }).forEach((task, index) => {
    const path = `annotationTask.tasks[${index}]`;
    assertObject(task, path);
    assertNumber(task.number, `${path}.number`, { integer: true, min: 1 });
    assertText(task.instruction, `${path}.instruction`);
    assertText(task.type, `${path}.type`);
    assertNumber(task.marks, `${path}.marks`, { integer: true, min: 1 });
    optionalText(task.focusQuote, `${path}.focusQuote`);
  });
  if (shouldIncludeAnswers(options)) {
    validateMarkingGuideArray(resource.markingGuide || resource.answers, "annotationTask.markingGuide", {
      taskNumber: true,
    });
  }
}

// The annotation task's single passage is rendered by the shared block-aware
// passage renderer (see builder/passage.js), which keeps prose paragraph breaks
// and poem stanza/line breaks intact instead of collapsing them to one block.
function makePassageBox(resource) {
  return makePassageContent({
    title: resource.passageTitle,
    author: resource.passageAuthor,
    source: resource.passageSource,
    body: resource.passageText,
    verbatim: resource.passageVerbatim === true,
  });
}

function renderTask(task, { showMarks = false } = {}) {
  return [
    ...renderLeadParagraph(task.instruction, (line) =>
      makeQuestionParagraph(task.number, line, showMarks ? task.marks : null)),
    task.focusQuote
      ? paragraph(`Focus quote: "${cleanText(task.focusQuote)}"`, {
          italics: true,
          color: "555555",
          indent: { left: 280 },
        })
      : null,
    ...makeResponseLines(responseLineCount(task)),
  ].filter(Boolean);
}

async function buildAnnotationTaskDocx(resource, options = {}) {
  validateAnnotationTaskResource(resource, options);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "english";
  const year = resource.year || options.year || "";
  const title = resource.title || "Annotation Task";
  const children = [];

  children.push(makeDetailLine([
    "Close reading and annotation",
    resource.passageTitle ? `Passage: ${resource.passageTitle}` : null,
  ]));
  children.push(makeShadedBox(makePassageBox(resource), BRAND.LIGHT_GREY));
  if (resource.contextNote) {
    children.push(...makeParagraphs(resource.contextNote, { italics: true, color: "555555" }));
  }
  children.push(makeSubHeading("Tasks"));
  for (const task of asArray(resource.tasks)) {
    children.push(...renderTask(task, { showMarks: options.showMarks === true }));
  }

  if (shouldIncludeAnswers(options)) {
    children.push(makePageBreak());
    children.push(makeSectionHeading("Answer Guide - Tutor Copy"));
    children.push(makeSpacer());
    children.push(makeMarkingGuide(resource.tasks, resource.markingGuide || resource.answers || []));
  }

  return packDocument({
    title,
    subject,
    year,
    topic: "Annotation task",
    studentName,
    children,
  });
}

module.exports = {
  buildAnnotationTaskDocx,
  splitPassageBlocks,
  validateAnnotationTaskResource,
};
