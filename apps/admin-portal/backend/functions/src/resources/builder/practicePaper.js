"use strict";

const { AlignmentType } = require("docx");

const {
  asArray,
  isEnglishSubject,
  makeBulletList,
  makeDetailLine,
  makeNameDateLine,
  makePageBreak,
  makeParagraphs,
  makeQuestionMarkingGuide,
  makeSectionHeading,
  makeShadedBox,
  makeTable,
  packDocument,
  renderQuestionList,
} = require("./common");
const { BRAND } = require("./branding");
const { cleanText, paragraph } = require("./shared");

function validatePracticePaperResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw new TypeError("Practice paper resource must be an object");
  }
  if (!Array.isArray(resource.sections)) {
    throw new TypeError("Practice paper resource must include a sections array");
  }
}

function makeMarkScheme(answers = []) {
  return makeTable(
    ["Q#", "Answer", "Working", "Marks"],
    asArray(answers).map((answer) => [
      answer.questionNumber ? `Q${answer.questionNumber}${answer.partLabel ? `(${answer.partLabel})` : ""}` : "-",
      answer.answer || "",
      answer.workingOut || "",
      answer.marks ?? "",
    ]),
    { widths: [900, 3000, 3800, 1326] }
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

  if (asArray(resource.instructions).length || resource.instructions) {
    children.push(makeShadedBox("Instructions", BRAND.LIGHT_BLUE_BG));
    children.push(...makeBulletList(asArray(resource.instructions).length ? resource.instructions : splitInstructions(resource.instructions)));
  }

  for (const section of asArray(resource.sections)) {
    children.push(makeSectionHeading(section.title || section.name || "Section"));
    if (section.instructions) {
      children.push(...makeParagraphs(section.instructions, { italics: true, color: "555555" }));
    }
    children.push(...(await renderQuestionList(section.questions)));
  }

  children.push(makePageBreak());
  if (isEnglishSubject(subject)) {
    children.push(makeSectionHeading("Marking Guide"));
    children.push(makeDetailLine(["For tutor use only"]));
    children.push(makeQuestionMarkingGuide(resource.markingGuide || resource.markScheme || resource.answers || []));
  } else {
    const markScheme = asArray(resource.answers).length ? resource.answers : resource.markScheme;
    children.push(makeSectionHeading("Mark Scheme"));
    children.push(makeDetailLine(["For tutor use only"]));
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

function splitInstructions(value) {
  return String(value || "")
    .split(/[.;]\s+/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

module.exports = {
  buildPracticePaperDocx,
  validatePracticePaperResource,
};
