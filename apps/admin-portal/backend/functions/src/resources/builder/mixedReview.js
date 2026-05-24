"use strict";

const { Paragraph } = require("docx");

const {
  asArray,
  isEnglishSubject,
  makeDetailLine,
  makeNameDateLine,
  makePageBreak,
  makeSectionHeading,
  makeSectionedAnswerTable,
  makeSectionedMarkingGuide,
  makeSpacer,
  packDocument,
  renderQuestionList,
} = require("./common");
const { cleanText } = require("./shared");

function validateMixedReviewResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw new TypeError("Mixed review resource must be an object");
  }
  if (!Array.isArray(resource.sections)) {
    throw new TypeError("Mixed review resource must include a sections array");
  }
}

function topicForQuestion(resource, questionNumber) {
  for (const section of asArray(resource.sections)) {
    if (asArray(section.questions).some((question) => Number(question.number) === Number(questionNumber))) {
      return section.topic || "Review";
    }
  }
  return "Answers";
}

async function buildMixedReviewDocx(resource, options = {}) {
  validateMixedReviewResource(resource);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Mixed Review";
  const topics = asArray(resource.topics).length
    ? asArray(resource.topics)
    : asArray(resource.sections).map((section) => section.topic).filter(Boolean);
  const children = [];

  children.push(makeNameDateLine(studentName));
  children.push(makeDetailLine([
    topics.length ? `Topics: ${topics.join(", ")}` : null,
    resource.totalMarks ? `Total marks: ${resource.totalMarks}` : null,
  ]));

  for (const section of asArray(resource.sections)) {
    children.push(makeSectionHeading(section.topic || "Review"));
    children.push(...(await renderQuestionList(section.questions)));
    children.push(new Paragraph({ spacing: { after: 160 } }));
  }

  children.push(makePageBreak());
  children.push(makeSectionHeading(isEnglishSubject(subject) ? "Marking Guide" : "Answers"));
  children.push(makeSpacer());
  if (isEnglishSubject(subject)) {
    children.push(...makeSectionedMarkingGuide(resource.markingGuide || resource.answers || [], (row) =>
      row.topic || topicForQuestion(resource, row.questionNumber)
    ));
  } else {
    children.push(...makeSectionedAnswerTable(resource.answers || [], (answer) =>
      topicForQuestion(resource, answer.questionNumber)
    ));
  }

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
  buildMixedReviewDocx,
  validateMixedReviewResource,
};
