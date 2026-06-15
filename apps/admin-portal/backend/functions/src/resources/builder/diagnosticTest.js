"use strict";

const { Paragraph } = require("docx");
const { shouldIncludeAnswers } = require("../answerMode");

const { PAGE } = require("./branding");
const {
  asArray,
  isEnglishSubject,
  makeDetailLine,
  makeNameDateLine,
  makePageBreak,
  makeQuestionMarkingGuide,
  makeSectionHeading,
  makeSpacer,
  makeTable,
  packDocument,
  renderQuestionList,
} = require("./common");
const { cleanText } = require("./shared");
const {
  assertNumber,
  optionalStringArray,
  validateBaseResource,
  validateQuestionArray,
  validateTutorCopy,
} = require("./validation");

function validateDiagnosticTestResource(resource, options = {}) {
  validateBaseResource(resource, "diagnosticTest");
  optionalStringArray(resource.topics, "diagnosticTest.topics");
  assertNumber(resource.totalMarks, "diagnosticTest.totalMarks", { min: 0 });
  validateQuestionArray(resource.questions, "diagnosticTest.questions", {
    requireSubTopic: true,
    requireType: true,
  });
  if (shouldIncludeAnswers(options)) {
    validateTutorCopy(resource, "diagnosticTest", { requireSubTopic: true });
  }
}

function uniqueSubTopics(resource) {
  const topics = new Set();
  for (const topic of asArray(resource.topics)) topics.add(cleanText(topic));
  for (const question of asArray(resource.questions)) {
    if (question?.subTopic) topics.add(cleanText(question.subTopic));
  }
  return [...topics].filter(Boolean);
}

function makeDiagnosticAnswerKey(answers = []) {
  return makeTable(
    ["Q#", "Sub-topic", "Answer", "Note"],
    asArray(answers).map((answer) => [
      answer.questionNumber ? `Q${answer.questionNumber}` : "-",
      answer.subTopic || "",
      answer.answer || "",
      answer.note || "",
    ]),
    { widths: [900, 2200, 2600, 3326] }
  );
}

function makeGapAnalysisGrid(topics) {
  return makeTable(
    ["Sub-topic", "Gap?", "Notes"],
    topics.map((topic) => [topic, "", ""]),
    { widths: [3200, 1200, PAGE.CONTENT_WIDTH - 4400] }
  );
}

async function buildDiagnosticTestDocx(resource, options = {}) {
  validateDiagnosticTestResource(resource, options);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Diagnostic Test";
  const topics = uniqueSubTopics(resource);
  const children = [];

  children.push(makeNameDateLine(studentName));
  children.push(makeDetailLine([
    "Diagnostic Test - for tutor use",
    topics.length ? `Topics: ${topics.join(", ")}` : null,
    resource.totalMarks ? `Total marks: ${resource.totalMarks}` : null,
  ]));
  children.push(...(await renderQuestionList(resource.questions, {
    preLabel: (question) => question.subTopic ? `Sub-topic: ${question.subTopic}` : "",
  })));

  children.push(makePageBreak());
  if (shouldIncludeAnswers(options)) {
    if (isEnglishSubject(subject)) {
      children.push(makeSectionHeading("Marking Guide"));
      children.push(makeSpacer());
      children.push(makeQuestionMarkingGuide(resource.markingGuide || resource.answers || [], {
        contextHeader: "Sub-topic",
      }));
    } else {
      children.push(makeSectionHeading("Answer Key"));
      children.push(makeSpacer());
      children.push(makeDiagnosticAnswerKey(resource.answers || []));
    }
    children.push(new Paragraph({ spacing: { after: 220 } }));
  }
  children.push(makeSectionHeading("Gap Analysis - circle gaps identified"));
  children.push(makeSpacer());
  children.push(makeGapAnalysisGrid(topics));

  return packDocument({
    title,
    subject,
    year,
    topic: topics.slice(0, 3).join(", "),
    studentName,
    children,
  });
}

module.exports = {
  buildDiagnosticTestDocx,
  makeDiagnosticAnswerKey,
  validateDiagnosticTestResource,
};
