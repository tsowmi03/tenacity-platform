"use strict";

const {
  Document,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableLayoutType,
  TextRun,
  WidthType,
} = require("docx");

const { BRAND, PAGE } = require("./branding");
const { shouldIncludeAnswers } = require("../answerMode");
const {
  isEnglishSubject,
  makeQuestionMarkingGuide,
  renderQuestion,
  renderStimulusBooklet,
} = require("./common");
const {
  cleanText,
  formatSubject,
  makeAnswerRow,
  makeFooter,
  makeHeader,
  makePageBreak,
  makeSectionHeading,
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
  const children = [];

  children.push(...makeInfoLine(resource, studentName));
  children.push(...renderStimulusBooklet(resource, subject));
  for (const question of resource.questions) {
    children.push(...(await renderQuestion(question, {
      responseLines: isEnglishSubject(subject),
      showMarks: options.showMarks === true,
    })));
  }

  if (shouldIncludeAnswers(options)) {
    children.push(makePageBreak());
    if (isEnglishSubject(subject)) {
      children.push(makeSectionHeading("Marking Guide"));
      children.push(new Paragraph({ spacing: { after: 120 } }));
      children.push(makeQuestionMarkingGuide(resource.markingGuide || resource.answers || []));
    } else {
      children.push(makeSectionHeading("Answers"));
      children.push(new Paragraph({ spacing: { after: 120 } }));
      children.push(makeAnswerTable(resource.answers || []));
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: BRAND.FONT, size: BRAND.FONT_SIZE_BODY },
        },
      },
    },
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            size: { width: PAGE.WIDTH, height: PAGE.HEIGHT },
            margin: {
              top: PAGE.MARGIN_TOP,
              bottom: PAGE.MARGIN_BOTTOM,
              left: PAGE.MARGIN_LEFT,
              right: PAGE.MARGIN_RIGHT,
            },
          },
        },
        headers: {
          default: makeHeader(title, formatSubject(subject), year, resource.topic),
        },
        footers: {
          default: makeFooter(studentName),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = {
  buildWorksheetDocx,
  makeAnswerTable,
  renderQuestion,
  validateWorksheetResource,
};
