"use strict";

const {
  Paragraph,
  Table,
  TableLayoutType,
  TextRun,
  WidthType,
} = require("docx");

const { BRAND, PAGE } = require("./branding");
const { shouldIncludeAnswers, shouldIncludeWorking } = require("../answerMode");
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
    validateTutorCopy(resource, "worksheet", {
      requireResponse: shouldIncludeWorking(options),
      requireWorking: shouldIncludeWorking(options),
    });
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

// The writer is told each question's section and sometimes prints it as the
// first line of the stem ("Section C: Points, radii and diameters\n\n..."). A
// new writing batch then repeats the heading of a section it continues, so the
// same heading appeared twice and sat inside the question's own line. The
// heading is lifted out of the stem and printed once, above the section.
const STEM_SECTION_LINE = /^\s*(section\s+[A-Z0-9]{1,2}\b[^\n]{0,100}?)\s*\n+/i;

function splitStemSection(stem) {
  const text = typeof stem === "string" ? stem : "";
  const match = text.match(STEM_SECTION_LINE);
  if (!match) return { section: "", stem };
  const rest = text.slice(match[0].length).trim();
  if (!rest) return { section: "", stem };
  return { section: cleanText(match[1]), stem: rest };
}

function sectionKey(section) {
  return cleanText(section).toLowerCase().replace(/[\s:.\-–—]+/g, " ").trim();
}

// Questions paired with the section heading to print before them, if any.
// Headings print only when the worksheet has two or more sections.
function questionsWithSections(questions = []) {
  const rows = questions.map((question) => {
    const lifted = splitStemSection(question?.stem);
    const section = cleanText(question?.section) || lifted.section;
    return { question: lifted.section ? { ...question, stem: lifted.stem } : question, section };
  });
  const distinct = new Set(rows.map((row) => sectionKey(row.section)).filter(Boolean));
  let previous = "";
  return rows.map(({ question, section }) => {
    const key = sectionKey(section);
    const heading = distinct.size > 1 && key && key !== previous ? section : "";
    if (key) previous = key;
    return { question, heading };
  });
}

function answerLabel(answer) {
  const number = answer?.questionNumber ?? "";
  const partLabel = cleanText(answer?.partLabel).replace(/[()]/g, "");
  return partLabel ? `Q${number}(${partLabel})` : `Q${number}`;
}

function makeAnswerTable(answers = [], { includeWorking = true } = {}) {
  const rows = [
    makeAnswerRow("Q#", "Answer", {
      header: true,
      bold: true,
      color: BRAND.WHITE,
      fill: BRAND.NAVY,
    }),
  ];

  for (const answer of answers) {
    const working = includeWorking && answer?.workingOut ? `\nWorking:\n${answer.workingOut}` : "";
    rows.push(makeAnswerRow(answerLabel(answer), `${answer?.answer ?? ""}${working}`));
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
  for (const { question, heading } of questionsWithSections(resource.questions)) {
    if (heading) children.push(makeContentsHeading(heading, { level: 2 }));
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
      children.push(makeQuestionMarkingGuide(resource.markingGuide || resource.answers || [], {
        includeResponse: shouldIncludeWorking(options),
      }));
    } else {
      children.push(makeContentsHeading("Answers", { section: true }));
      children.push(new Paragraph({ spacing: { after: 120 } }));
      children.push(makeAnswerTable(resource.answers || [], { includeWorking: shouldIncludeWorking(options) }));
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
  questionsWithSections,
  renderQuestion,
  splitStemSection,
  validateWorksheetResource,
};
