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
  makeSectionHeading,
  makeSectionedAnswerTable,
  makeSectionedMarkingGuide,
  makeShadedBox,
  makeSpacer,
  makeSubHeading,
  makeTable,
  packDocument,
  renderQuestionList,
} = require("./common");
const { BRAND } = require("./branding");
const { cleanText, makeDefinitionTable, makeWorkedExampleTable, paragraph } = require("./shared");

function validateTopicBookletResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw new TypeError("Topic booklet resource must be an object");
  }
  if (!Array.isArray(resource.subTopics)) {
    throw new TypeError("Topic booklet resource must include a subTopics array");
  }
}

function makeOutcomesOrObjectives(resource) {
  const outcomes = asArray(resource.nesaOutcomes || resource.outcomes);
  const objectives = asArray(resource.learningObjectives || resource.objectives);
  if (outcomes.length) {
    return [makeSubHeading("NESA Outcomes"), ...makeBulletList(outcomes)];
  }
  if (objectives.length) {
    return [makeSubHeading("Learning Objectives"), ...makeBulletList(objectives)];
  }
  return [];
}

async function renderSubTopic(subTopic) {
  const children = [makeSubHeading(subTopic.title || subTopic.name || "Sub-topic")];
  children.push(...makeParagraphs(subTopic.explanation || subTopic.summary || ""));

  if (asArray(subTopic.definitions).length) {
    children.push(makeSubHeading("Definitions"));
    children.push(makeDefinitionTable(subTopic.definitions));
    children.push(makeSpacer());
  }

  if (asArray(subTopic.workedExamples).length) {
    children.push(makeSubHeading("Worked Examples"));
    for (const example of asArray(subTopic.workedExamples)) {
      children.push(paragraph(example.title || "Worked example", { bold: true, color: BRAND.NAVY }));
      children.push(makeWorkedExampleTable(asArray(example.steps).map((step) => ({
        working: step.working,
        explanation: step.explanation || step.annotation,
      }))));
      children.push(makeSpacer());
    }
  }

  if (subTopic.tip) {
    children.push(makeShadedBox(`Tip: ${subTopic.tip}`, BRAND.GREEN_BG));
  }
  if (subTopic.commonMistake) {
    children.push(makeShadedBox(`Common Mistake: ${subTopic.commonMistake}`, BRAND.AMBER_BG));
  }

  if (asArray(subTopic.practiceQuestions).length || asArray(subTopic.questions).length) {
    children.push(makeSubHeading("Practice Questions"));
    children.push(...(await renderQuestionList(subTopic.practiceQuestions || subTopic.questions)));
  }
  return children;
}

function quizSections(resource) {
  if (Array.isArray(resource.endQuiz?.sections)) return resource.endQuiz.sections;
  if (resource.endQuiz && typeof resource.endQuiz === "object") {
    const sections = ["sectionA", "sectionB", "sectionC"]
      .map((key) => resource.endQuiz[key])
      .filter(Boolean);
    if (sections.length) return sections;
  }
  if (Array.isArray(resource.quizSections)) return resource.quizSections;
  if (Array.isArray(resource.endQuizQuestions)) {
    return [{ title: "End of Topic Quiz", questions: resource.endQuizQuestions }];
  }
  return [];
}

function topicForAnswer(resource, answer) {
  if (answer.section || answer.subTopicTitle || answer.topic) {
    return answer.section || answer.subTopicTitle || answer.topic;
  }
  for (const subTopic of asArray(resource.subTopics)) {
    const questions = asArray(subTopic.practiceQuestions || subTopic.questions);
    if (questions.some((question) => Number(question.number) === Number(answer.questionNumber))) {
      return subTopic.title || subTopic.name || "Practice";
    }
  }
  for (const section of quizSections(resource)) {
    if (asArray(section.questions).some((question) => Number(question.number) === Number(answer.questionNumber))) {
      return section.title || section.name || "Quiz";
    }
  }
  return "Answers";
}

function topicAnswers(resource) {
  const answers = resource.answers;
  if (Array.isArray(answers)) return answers;

  const rows = [];
  if (answers && typeof answers === "object") {
    rows.push(...asArray(answers.subTopicAnswers).map((answer) => ({
      ...answer,
      section: answer.subTopicTitle || answer.section,
    })));
    rows.push(...asArray(answers.endQuizAnswers).map((answer) => ({
      ...answer,
      section: answer.section || "End of Topic Quiz",
    })));
  }
  rows.push(...asArray(resource.endQuizAnswers));
  return rows;
}

async function buildTopicBookletDocx(resource, options = {}) {
  validateTopicBookletResource(resource);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Topic Booklet";
  const children = [];

  children.push(paragraph("Tenacity Tutoring", {
    bold: true,
    color: BRAND.NAVY,
    size: BRAND.FONT_SIZE_H1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 500, after: 220 },
  }));
  children.push(paragraph(title, {
    bold: true,
    color: BRAND.NAVY,
    size: BRAND.FONT_SIZE_H1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 180 },
  }));
  children.push(paragraph(`Year ${year || "-"} ${subject || ""}`, {
    alignment: AlignmentType.CENTER,
    color: BRAND.LIGHT_BLUE,
    size: BRAND.FONT_SIZE_H2,
  }));
  children.push(makeNameDateLine(studentName));
  children.push(...makeOutcomesOrObjectives(resource));
  children.push(makePageBreak());

  for (const subTopic of asArray(resource.subTopics)) {
    children.push(...(await renderSubTopic(subTopic)));
  }

  const sections = quizSections(resource);
  if (sections.length) {
    children.push(makePageBreak());
    children.push(makeSectionHeading("End of Topic Quiz"));
    for (const section of sections) {
      children.push(makeSubHeading(section.title || section.name || "Quiz Section"));
      if (section.instructions) children.push(...makeParagraphs(section.instructions));
      children.push(...(await renderQuestionList(section.questions)));
    }
  }

  children.push(makePageBreak());
  children.push(makeSectionHeading(isEnglishSubject(subject) ? "Marking Guide" : "Answers"));
  children.push(makeSpacer());
  if (isEnglishSubject(subject)) {
    children.push(...makeSectionedMarkingGuide(resource.markingGuide || topicAnswers(resource), (row) =>
      topicForAnswer(resource, row)
    ));
  } else {
    children.push(...makeSectionedAnswerTable(topicAnswers(resource), (answer) =>
      topicForAnswer(resource, answer)
    ));
  }

  if (asArray(resource.quickReference).length) {
    children.push(makeSectionHeading("Quick Reference"));
    children.push(makeTable(
      ["Concept", "Summary"],
      resource.quickReference.map((row) => [row.concept || "", row.summary || ""]),
      { widths: [2800, 6226] }
    ));
  }

  return packDocument({
    title,
    subject,
    year,
    topic: resource.topic || "",
    studentName,
    children,
  });
}

module.exports = {
  buildTopicBookletDocx,
  validateTopicBookletResource,
};
