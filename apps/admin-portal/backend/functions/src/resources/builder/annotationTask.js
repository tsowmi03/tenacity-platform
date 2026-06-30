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

// Split passage text into blocks (paragraphs / stanzas) separated by blank
// lines, each block being its cleaned, non-empty lines. A blank line is a
// paragraph or stanza boundary; a single newline within a block is an
// intentional line break (poetry). cleanText collapses newlines to spaces, so we
// must split before cleaning and render line breaks as distinct paragraphs.
// Hard-wrapped prose is unwrapped upstream (see sourcedText normalisation) so it
// does not arrive here as spurious mid-sentence breaks.
function splitPassageBlocks(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((block) => block.split("\n").map((line) => cleanText(line)).filter(Boolean))
    .filter((lines) => lines.length);
}

// Builds the passage as distinct, structured paragraphs: a bold title, an
// italic attribution caption, then the body with its paragraph and stanza breaks
// intact. Lines within a block sit tight together (poetry stays as verse);
// blocks are separated by a larger gap (prose paragraphs / stanza breaks).
// Previously the body was pushed through a single paragraph, whose newlines
// collapse to spaces — so the whole passage rendered as one run-on block.
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
  const blocks = splitPassageBlocks(resource.passageText);
  const hasBody = blocks.length > 0;

  if (title) {
    children.push(paragraph(title, {
      bold: true,
      color: BRAND.NAVY,
      size: BRAND.FONT_SIZE_H3,
      spacing: { after: attribution || hasBody ? 60 : 0 },
    }));
  }
  if (attribution) {
    children.push(paragraph(attribution, {
      italics: true,
      color: "555555",
      size: BRAND.FONT_SIZE_SMALL,
      spacing: { after: hasBody ? 160 : 0 },
    }));
  }
  blocks.forEach((lines, blockIndex) => {
    const lastBlock = blockIndex === blocks.length - 1;
    lines.forEach((line, lineIndex) => {
      const lastLineOfBlock = lineIndex === lines.length - 1;
      // Tight spacing between lines of the same block (verse lines / wrapped
      // prose); a paragraph-sized gap between blocks; none after the last line.
      const after = !lastLineOfBlock ? 30 : lastBlock ? 0 : 160;
      children.push(paragraph(line, { spacing: { after } }));
    });
  });

  return children.length ? children : [paragraph("", { spacing: { after: 0 } })];
}

function renderTask(task) {
  return [
    // Mark allocations are practice-paper only, so the annotation task hides the
    // per-task marks (passing null) even though the data still carries them.
    makeQuestionParagraph(task.number, task.instruction, null),
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
  splitPassageBlocks,
  validateAnnotationTaskResource,
};
