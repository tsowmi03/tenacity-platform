"use strict";

const { AlignmentType } = require("docx");

const {
  asArray,
  isEnglishSubject,
  makeDetailLine,
  makeNameDateLine,
  makePageBreak,
  makeQuestionMarkingGuide,
  makeSectionHeading,
  makeTable,
  packDocument,
  renderQuestionList,
} = require("./common");
const { BRAND } = require("./branding");
const { cleanText, paragraph } = require("./shared");
const {
  assertArray,
  assertNumber,
  assertText,
  optionalTopics,
  validateBaseResource,
  validateQuestionArray,
  validateTutorCopy,
} = require("./validation");

function validatePracticePaperResource(resource) {
  validateBaseResource(resource, "practicePaper");
  optionalTopics(resource.topics);
  assertNumber(resource.totalMarks, "practicePaper.totalMarks", { min: 0 });
  assertText(resource.timeAllowed, "practicePaper.timeAllowed");
  assertArray(resource.sections, "practicePaper.sections", { min: 1 }).forEach((section, index) => {
    const path = `practicePaper.sections[${index}]`;
    assertText(section.title || section.name, `${path}.title`);
    validateQuestionArray(section.questions, `${path}.questions`);
  });
  validateTutorCopy(resource, "practicePaper", { requireMarks: true });
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
  validatePracticePaperResource(resource);

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

  for (const section of asArray(resource.sections)) {
    children.push(makeSectionHeading(section.title || section.name || "Section"));
    children.push(...(await renderQuestionList(section.questions)));
  }

  children.push(makePageBreak());
  if (isEnglishSubject(subject)) {
    children.push(makeSectionHeading("Marking Guide"));
    children.push(makeQuestionMarkingGuide(resource.markingGuide || resource.markScheme || resource.answers || []));
  } else {
    const markScheme = asArray(resource.answers).length ? resource.answers : resource.markScheme;
    children.push(makeSectionHeading("Mark Scheme"));
    children.push(makeMarkScheme(markScheme || []));
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
