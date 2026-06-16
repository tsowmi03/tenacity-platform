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
  splitParagraphs,
} = require("./common");
const { BRAND } = require("./branding");
const { DEFAULT_RESOURCE_AUTHOR } = require("../humanStyle");
const { cleanText, makeQuestionParagraph, makeWorkingLines, paragraph } = require("./shared");
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
    assertNumber(task.marks, `${path}.marks`, { min: 0 });
    assertNumber(task.responseLines, `${path}.responseLines`, { integer: true, min: 0 });
    optionalText(task.focusQuote, `${path}.focusQuote`);
  });
  if (shouldIncludeAnswers(options)) {
    validateMarkingGuideArray(resource.markingGuide || resource.answers, "annotationTask.markingGuide", {
      taskNumber: true,
    });
  }
}

// Builds the passage as distinct, structured paragraphs: a bold title, an
// italic attribution caption, then the body with its paragraph breaks intact.
// Previously the title, attribution and body were joined with "\n\n" and pushed
// through a single paragraph, whose newlines collapse to spaces — so the whole
// passage rendered as one undifferentiated run-on block.
function makePassageBox(resource) {
  const children = [];
  const title = cleanText(resource.passageTitle);
  // Generated stimuli are always credited to Tenacity Resources. A real
  // public-domain text keeps its true author (the prompt requires accurate
  // attribution); only an unattributed passage falls back to the default.
  const authorName = cleanText(resource.passageAuthor) || DEFAULT_RESOURCE_AUTHOR;
  const attribution = [
    `Author: ${authorName}`,
    resource.passageSource ? `Source: ${cleanText(resource.passageSource)}` : null,
  ].filter(Boolean).join("   |   ");
  const bodyLines = splitParagraphs(resource.passageText);

  if (title) {
    children.push(paragraph(title, {
      bold: true,
      color: BRAND.NAVY,
      size: BRAND.FONT_SIZE_H3,
      spacing: { after: attribution || bodyLines.length ? 60 : 0 },
    }));
  }
  if (attribution) {
    children.push(paragraph(attribution, {
      italics: true,
      color: "555555",
      size: BRAND.FONT_SIZE_SMALL,
      spacing: { after: bodyLines.length ? 160 : 0 },
    }));
  }
  bodyLines.forEach((line, index) => {
    children.push(paragraph(line, {
      spacing: { after: index === bodyLines.length - 1 ? 0 : 120 },
    }));
  });

  return children.length ? children : [paragraph("", { spacing: { after: 0 } })];
}

function renderTask(task) {
  return [
    makeQuestionParagraph(task.number, task.instruction, task.marks),
    task.focusQuote
      ? paragraph(`Focus quote: "${cleanText(task.focusQuote)}"`, {
          italics: true,
          color: "555555",
          indent: { left: 280 },
        })
      : null,
    ...makeWorkingLines(task.responseLines ?? 4),
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
    children.push(...renderTask(task));
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
  validateAnnotationTaskResource,
};
