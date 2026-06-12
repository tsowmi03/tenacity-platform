"use strict";

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
} = require("./common");
const { BRAND } = require("./branding");
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

function validateAnnotationTaskResource(resource) {
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
  validateMarkingGuideArray(resource.markingGuide || resource.answers, "annotationTask.markingGuide", {
    taskNumber: true,
  });
}

function makePassageText(resource) {
  const attribution = [
    resource.passageAuthor ? `Author: ${resource.passageAuthor}` : null,
    resource.passageSource ? `Source: ${resource.passageSource}` : null,
  ].filter(Boolean).join(" | ");
  return [
    resource.passageTitle || "Passage",
    attribution,
    resource.passageText || "",
  ].filter(Boolean).join("\n\n");
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
  validateAnnotationTaskResource(resource);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "english";
  const year = resource.year || options.year || "";
  const title = resource.title || "Annotation Task";
  const children = [];

  children.push(makeDetailLine([
    "Close reading and annotation",
    resource.passageTitle ? `Passage: ${resource.passageTitle}` : null,
  ]));
  children.push(makeShadedBox(makePassageText(resource), BRAND.LIGHT_GREY));
  if (resource.contextNote) {
    children.push(...makeParagraphs(resource.contextNote, { italics: true, color: "555555" }));
  }
  children.push(makeSubHeading("Tasks"));
  for (const task of asArray(resource.tasks)) {
    children.push(...renderTask(task));
  }

  children.push(makePageBreak());
  children.push(makeSectionHeading("Answer Guide - Tutor Copy"));
  children.push(makeSpacer());
  children.push(makeMarkingGuide(resource.tasks, resource.markingGuide || resource.answers || []));

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
