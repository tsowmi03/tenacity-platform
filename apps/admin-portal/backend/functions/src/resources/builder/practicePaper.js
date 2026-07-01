"use strict";

const { AlignmentType } = require("docx");
const { shouldIncludeAnswers } = require("../answerMode");

const {
  asArray,
  isEnglishSubject,
  makeDetailLine,
  makeNameDateLine,
  makePageBreak,
  makeQuestionMarkingGuide,
  makeSectionHeading,
  makeShadedBox,
  makeSpacer,
  makeTable,
  packDocument,
  renderQuestionList,
} = require("./common");
const { BRAND } = require("./branding");
const { cleanText, paragraph } = require("./shared");
const { makePassageContent } = require("./passage");
const {
  assertArray,
  assertNumber,
  assertObject,
  assertText,
  optionalTopics,
  validateBaseResource,
  validateQuestionArray,
  validateTutorCopy,
} = require("./validation");

// The stimulus booklet is optional (maths papers have none) and best-effort:
// each text needs a title and body; everything else is presentational and
// tolerated when absent so a sourcing/generation edge case never fails the job.
function validateStimulus(stimulus, path) {
  if (stimulus === undefined || stimulus === null) return;
  assertArray(stimulus, path).forEach((text, index) => {
    assertObject(text, `${path}[${index}]`);
    assertText(text.title, `${path}[${index}].title`);
    assertText(text.body, `${path}[${index}].body`);
  });
}

function validatePracticePaperResource(resource, options = {}) {
  validateBaseResource(resource, "practicePaper");
  optionalTopics(resource.topics);
  validateStimulus(resource.stimulus, "practicePaper.stimulus");
  assertNumber(resource.totalMarks, "practicePaper.totalMarks", { min: 0 });
  assertText(resource.timeAllowed, "practicePaper.timeAllowed");
  assertArray(resource.sections, "practicePaper.sections", { min: 1 }).forEach((section, index) => {
    const path = `practicePaper.sections[${index}]`;
    assertText(section.title || section.name, `${path}.title`);
    validateQuestionArray(section.questions, `${path}.questions`);
  });
  if (shouldIncludeAnswers(options)) {
    validateTutorCopy(resource, "practicePaper", { requireMarks: true });
  }
}

function makeMarkScheme(answers = []) {
  const rows = asArray(answers);
  const hasWorking = rows.some((a) => a.workingOut);
  const headers = hasWorking ? ["Q#", "Answer", "Working", "Marks"] : ["Q#", "Answer", "Marks"];
  const widths = hasWorking ? [900, 3000, 3800, 1326] : [900, 6800, 1326];
  return makeTable(
    headers,
    rows.map((answer) => {
      const partLabel = answer.partLabel ? `(${String(answer.partLabel).replace(/[()]/g, "")})` : "";
      const qLabel = answer.questionNumber ? `Q${answer.questionNumber}${partLabel}` : "-";
      const base = [qLabel, answer.answer || "", answer.marks ?? ""];
      return hasWorking ? [base[0], base[1], answer.workingOut || "", base[2]] : base;
    }),
    { widths }
  );
}

async function buildPracticePaperDocx(resource, options = {}) {
  validatePracticePaperResource(resource, options);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Practice Paper";
  const children = [];

  children.push(paragraph("Tenacity Tutoring", {
    bold: true,
    color: BRAND.NAVY,
    size: BRAND.FONT_SIZE_H1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 620, after: 220 },
  }));
  children.push(paragraph(title, {
    bold: true,
    color: BRAND.NAVY,
    size: BRAND.FONT_SIZE_H1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 220 },
  }));
  children.push(paragraph(`Year ${year || "-"} ${subject || ""}`, {
    alignment: AlignmentType.CENTER,
    color: BRAND.LIGHT_BLUE,
    size: BRAND.FONT_SIZE_H2,
    spacing: { after: 180 },
  }));
  children.push(paragraph([
    resource.totalMarks ? `Total Marks: ${resource.totalMarks}` : null,
    resource.timeAllowed ? `Time Allowed: ${resource.timeAllowed}` : null,
  ].filter(Boolean).join(" | "), {
    alignment: AlignmentType.CENTER,
    spacing: { after: 420 },
  }));
  children.push(makeNameDateLine(studentName));
  children.push(makePageBreak());

  // English papers carry a stimulus booklet: each reading text is rendered
  // block-aware (prose paragraphs and poem stanza/line breaks preserved) in its
  // own shaded box, rather than crammed into a question stem as one run-on block.
  const stimulus = asArray(resource.stimulus);
  if (isEnglishSubject(subject) && stimulus.length) {
    children.push(makeSectionHeading("Stimulus booklet"));
    children.push(paragraph(
      "Read the following text(s) carefully. You may annotate this stimulus booklet during reading time.",
      { italics: true, color: "555555", spacing: { after: 160 } }
    ));
    stimulus.forEach((text, index) => {
      children.push(makeShadedBox(makePassageContent({
        label: text.label || `Text ${index + 1}`,
        title: text.title,
        author: text.author,
        source: text.source,
        body: text.body,
      }), BRAND.LIGHT_GREY));
      if (index < stimulus.length - 1) children.push(makeSpacer(200));
    });
    children.push(makePageBreak());
  }

  for (const section of asArray(resource.sections)) {
    children.push(makeSectionHeading(section.title || section.name || "Section"));
    children.push(...(await renderQuestionList(section.questions, { showMarks: true })));
  }

  if (shouldIncludeAnswers(options)) {
    children.push(makePageBreak());
    if (isEnglishSubject(subject)) {
      children.push(makeSectionHeading("Marking Guide"));
      children.push(makeQuestionMarkingGuide(resource.markingGuide || resource.markScheme || resource.answers || []));
    } else {
      const markScheme = asArray(resource.answers).length ? resource.answers : resource.markScheme;
      children.push(makeSectionHeading("Mark Scheme"));
      children.push(makeMarkScheme(markScheme || []));
    }
  }

  return packDocument({
    title,
    subject,
    year,
    topic: resource.focus || "",
    studentName,
    children,
  });
}

module.exports = {
  buildPracticePaperDocx,
  validatePracticePaperResource,
};
