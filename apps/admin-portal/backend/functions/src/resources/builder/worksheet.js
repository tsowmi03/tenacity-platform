"use strict";

const {
  Document,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TextRun,
  WidthType,
} = require("docx");

const { BRAND, PAGE } = require("./branding");
const { isEnglishSubject, makeQuestionMarkingGuide } = require("./common");
const { renderDiagramBlock } = require("./diagrams");
const {
  cleanText,
  formatSubject,
  makeAnswerRow,
  makeFooter,
  makeHeader,
  makePageBreak,
  makePartParagraph,
  makeQuestionParagraph,
  makeSectionHeading,
  makeWorkingLines,
  paragraph,
  textRun,
} = require("./shared");
const {
  assertNumber,
  assertText,
  validateBaseResource,
  validateQuestionArray,
  validateTutorCopy,
} = require("./validation");

function hasParts(question) {
  return Array.isArray(question?.parts) && question.parts.length > 0;
}

function validateWorksheetResource(resource) {
  validateBaseResource(resource, "worksheet");
  assertText(resource.topic, "worksheet.topic");
  assertNumber(resource.totalMarks, "worksheet.totalMarks", { min: 0 });
  validateQuestionArray(resource.questions, "worksheet.questions");
  validateTutorCopy(resource, "worksheet");
}

function makeInfoLine(resource, studentName) {
  const displayName = studentName || "________________________";
  const topic = cleanText(resource.topic);
  const totalMarks =
    resource.totalMarks === null || resource.totalMarks === undefined
      ? null
      : `${resource.totalMarks} marks`;
  const details = [
    topic ? `Topic: ${topic}` : null,
    totalMarks ? `Total marks: ${totalMarks}` : null,
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

async function renderQuestion(question) {
  const elements = [];
  const parts = hasParts(question) ? question.parts : [];
  elements.push(
    makeQuestionParagraph(
      question.number,
      question.stem,
      parts.length ? null : question.marks
    )
  );
  elements.push(
    ...(await renderDiagramBlock(question.diagram, {
      label: `Q${question.number}`,
    }))
  );

  if (parts.length) {
    for (const part of parts) {
      elements.push(makePartParagraph(part.label, part.stem, part.marks));
      elements.push(
        ...(await renderDiagramBlock(part.diagram, {
          label: `Q${question.number}${part.label ? `(${part.label})` : ""}`,
        }))
      );
      elements.push(...makeWorkingLines(part.workingLines ?? 3));
    }
    return elements;
  }

  elements.push(...makeWorkingLines(question.workingLines ?? 4));
  return elements;
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
    rows,
  });
}

async function buildWorksheetDocx(resource, options = {}) {
  validateWorksheetResource(resource);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Worksheet";
  const children = [];

  children.push(...makeInfoLine(resource, studentName));
  for (const question of resource.questions) {
    children.push(...(await renderQuestion(question)));
  }

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
