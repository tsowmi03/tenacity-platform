"use strict";

const {
  Paragraph,
  Table,
  TableLayoutType,
  TextRun,
  WidthType,
} = require("docx");

const { BRAND, PAGE } = require("./branding");
const { shouldIncludeAnswers } = require("../answerMode");
const {
  isEnglishSubject,
  makeContentsHeading,
  makeQuestionMarkingGuide,
  makeTableOfContents,
  packDocument,
  renderQuestion,
  renderStimulusBooklet,
} = require("./common");
const {
  cleanText,
  makeAnswerRow,
  makePageBreak,
  paragraph,
  textRun,
} = require("./shared");
const {
  assertNumber,
  assertText,
  optionalStimulus,
  validateBaseResource,
  validateQuestionArray,
  validateTutorCopy,
} = require("./validation");

function validateWorksheetResource(resource, options = {}) {
  validateBaseResource(resource, "worksheet");
  optionalStimulus(resource.stimulus, "worksheet.stimulus");
  assertText(resource.topic, "worksheet.topic");
  assertNumber(resource.totalMarks, "worksheet.totalMarks", { min: 0 });
  validateQuestionArray(resource.questions, "worksheet.questions");
  if (shouldIncludeAnswers(options)) {
    validateTutorCopy(resource, "worksheet");
  }
}

function makeInfoLine(resource, studentName) {
  const displayName = studentName || "________________________";
  const topic = cleanText(resource.topic);
  // The topic line stays uncluttered; the tutor-controlled option renders marks
  // beside individual questions instead of adding a total here.
  const details = [
    topic ? `Topic: ${topic}` : null,
  ].filter(Boolean);

  return [
    new Paragraph({
      spacing: { after: 140 },
      children: [
        textRun(`Name: ${displayName}`),
        new TextRun({ text: "        ", font: BRAND.FONT, size: BRAND.FONT_SIZE_BODY }),
        textRun("Date: ____________________"),
      ],
    }),
    details.length
      ? paragraph(details.join(" | "), {
          color: "555555",
          size: BRAND.FONT_SIZE_SMALL,
          spacing: { after: 260 },
        })
      : new Paragraph({ spacing: { after: 220 } }),
  ];
}

function answerLabel(answer) {
  const number = answer?.questionNumber ?? "";
  const partLabel = cleanText(answer?.partLabel).replace(/[()]/g, "");
  return partLabel ? `Q${number}(${partLabel})` : `Q${number}`;
}

function makeAnswerTable(answers = []) {
  const rows = [
    makeAnswerRow("Q#", "Answer", {
      bold: true,
      color: BRAND.WHITE,
      fill: BRAND.NAVY,
    }),
  ];

  for (const answer of answers) {
    rows.push(makeAnswerRow(answerLabel(answer), answer?.answer ?? ""));
  }

  if (rows.length === 1) {
    rows.push(makeAnswerRow("-", "No answers supplied."));
  }

  return new Table({
    width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [1400, PAGE.CONTENT_WIDTH - 1400],
    layout: TableLayoutType.FIXED,
    rows,
  });
}

async function buildWorksheetDocx(resource, options = {}) {
  validateWorksheetResource(resource, options);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Worksheet";
  const isEnglish = isEnglishSubject(subject);
  const answerHeading = isEnglish ? "Marking Guide" : "Answers";
  const contentsEntries = [
    ...(isEnglish && Array.isArray(resource.stimulus) && resource.stimulus.length
      ? [{ title: "Stimulus booklet", level: 1 }]
      : []),
    { title: "Questions", level: 1 },
    ...(shouldIncludeAnswers(options) ? [{ title: answerHeading, level: 1 }] : []),
  ];
  const children = [];

  children.push(...makeInfoLine(resource, studentName));
  children.push(...makeTableOfContents(contentsEntries));
  children.push(...renderStimulusBooklet(resource, subject, { includeInTableOfContents: true }));
  children.push(makeContentsHeading("Questions", { section: true }));
  for (const question of resource.questions) {
    children.push(...(await renderQuestion(question, {
      responseLines: isEnglish,
      showMarks: options.showMarks === true,
    })));
  }

  if (shouldIncludeAnswers(options)) {
    children.push(makePageBreak());
    if (isEnglish) {
      children.push(makeContentsHeading("Marking Guide", { section: true }));
      children.push(new Paragraph({ spacing: { after: 120 } }));
      children.push(makeQuestionMarkingGuide(resource.markingGuide || resource.answers || []));
    } else {
      children.push(makeContentsHeading("Answers", { section: true }));
      children.push(new Paragraph({ spacing: { after: 120 } }));
      children.push(makeAnswerTable(resource.answers || []));
    }
  }

  return packDocument({
    title,
    subject,
    year,
    topic: resource.topic,
    studentName,
    children,
    updateFields: true,
  });
}

module.exports = {
  buildWorksheetDocx,
  makeAnswerTable,
  renderQuestion,
  validateWorksheetResource,
};
