"use strict";

const { AlignmentType } = require("docx");
const { shouldIncludeAnswers } = require("../answerMode");

const {
  asArray,
  isEnglishSubject,
  makeBulletList,
  makeContentsHeading,
  makeDetailLine,
  makeNameDateLine,
  makePageBreak,
  makeParagraphs,
  makeSectionedAnswerTable,
  makeSectionedMarkingGuide,
  makeShadedBox,
  makeSpacer,
  makeSubHeading,
  makeTable,
  makeTableOfContents,
  packDocument,
  renderQuestionList,
  renderStimulusBooklet,
} = require("./common");
const { BRAND } = require("./branding");
const { cleanText, makeDefinitionTable, makeWorkedExampleTable, paragraph } = require("./shared");
const {
  assertArray,
  assertObject,
  assertStringArray,
  assertText,
  optionalArray,
  optionalStimulus,
  optionalText,
  validateAnswerArray,
  validateBaseResource,
  validateMarkingGuideArray,
  validateQuestionArray,
} = require("./validation");

function validateTopicBookletResource(resource, options = {}) {
  validateBaseResource(resource, "topicBooklet");
  const isEnglish = isEnglishSubject(resource.subject);
  optionalStimulus(resource.stimulus, "topicBooklet.stimulus");
  assertText(resource.topic || asArray(resource.topics)[0], "topicBooklet.topic");
  optionalArray(resource.nesaOutcomes || resource.outcomes, "topicBooklet.nesaOutcomes").forEach((value, index) => {
    assertText(value, `topicBooklet.nesaOutcomes[${index}]`);
  });
  assertStringArray(resource.learningObjectives || resource.objectives, "topicBooklet.learningObjectives", { min: 1 });
  assertArray(resource.subTopics, "topicBooklet.subTopics", { min: 1 }).forEach((subTopic, index) => {
    validateSubTopic(subTopic, `topicBooklet.subTopics[${index}]`, { isEnglish });
  });
  const sections = quizSections(resource);
  assertArray(sections, "topicBooklet.endQuiz.sections", { min: 1 }).forEach((section, index) => {
    const path = `topicBooklet.endQuiz.sections[${index}]`;
    assertObject(section, path);
    assertText(section.title || section.name, `${path}.title`);
    validateQuestionArray(section.questions, `${path}.questions`);
  });
  if (shouldIncludeAnswers(options)) {
    validateTopicBookletTutorCopy(resource);
  }
}

function validateSubTopic(subTopic, path, { isEnglish } = {}) {
  assertObject(subTopic, path);
  assertText(subTopic.title || subTopic.name, `${path}.title`);
  assertText(subTopic.explanation || subTopic.summary, `${path}.explanation`);
  optionalArray(subTopic.definitions, `${path}.definitions`).forEach((definition, index) => {
    const definitionPath = `${path}.definitions[${index}]`;
    assertObject(definition, definitionPath);
    assertText(definition.term, `${definitionPath}.term`);
    assertText(definition.definition, `${definitionPath}.definition`);
  });
  if (isEnglish) {
    validateModelAnalysis(subTopic.modelAnalysis, `${path}.modelAnalysis`);
    optionalText(subTopic.exemplarParagraph, `${path}.exemplarParagraph`);
  } else {
    optionalArray(subTopic.workedExamples, `${path}.workedExamples`).forEach((example, index) => {
      const examplePath = `${path}.workedExamples[${index}]`;
      assertObject(example, examplePath);
      assertText(example.title, `${examplePath}.title`);
      assertArray(example.steps, `${examplePath}.steps`, { min: 1 }).forEach((step, stepIndex) => {
        const stepPath = `${examplePath}.steps[${stepIndex}]`;
        assertObject(step, stepPath);
        assertText(step.working, `${stepPath}.working`);
        assertText(step.explanation || step.annotation, `${stepPath}.explanation`);
      });
    });
  }
  optionalText(subTopic.tip, `${path}.tip`);
  optionalText(subTopic.commonMistake, `${path}.commonMistake`);
  validateQuestionArray(subTopic.practiceQuestions || subTopic.questions, `${path}.practiceQuestions`);
}

function validateModelAnalysis(value, path) {
  optionalArray(value, path).forEach((row, index) => {
    const rowPath = `${path}[${index}]`;
    assertObject(row, rowPath);
    assertText(row.quote, `${rowPath}.quote`);
    assertText(row.technique, `${rowPath}.technique`);
    assertText(row.effect, `${rowPath}.effect`);
  });
}

function validateTopicBookletTutorCopy(resource) {
  if (isEnglishSubject(resource.subject)) {
    validateMarkingGuideArray(resource.markingGuide, "topicBooklet.markingGuide");
    return;
  }

  const answers = resource.answers;
  if (Array.isArray(answers)) {
    validateAnswerArray(answers, "topicBooklet.answers");
    return;
  }
  assertObject(answers, "topicBooklet.answers");
  validateAnswerArray(answers.subTopicAnswers, "topicBooklet.answers.subTopicAnswers");
  validateAnswerArray(answers.endQuizAnswers, "topicBooklet.answers.endQuizAnswers");
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

async function renderSubTopic(subTopic, { isEnglish, showMarks = false } = {}) {
  const children = [makeContentsHeading(subTopic.title || subTopic.name || "Sub-topic")];
  children.push(...makeParagraphs(subTopic.explanation || subTopic.summary || "", {
    inlineMarkdown: true,
  }));

  if (asArray(subTopic.definitions).length) {
    children.push(makeSubHeading(isEnglish ? "Key Terms & Techniques" : "Definitions"));
    children.push(makeDefinitionTable(subTopic.definitions));
    children.push(makeSpacer());
  }

  if (isEnglish) {
    if (asArray(subTopic.modelAnalysis).length) {
      children.push(makeSubHeading("Model Analysis"));
      children.push(makeTable(
        ["Quote", "Technique", "Effect"],
        asArray(subTopic.modelAnalysis).map((row) => [row.quote || "", row.technique || "", row.effect || ""]),
        { widths: [3400, 2826, 2800] }
      ));
      children.push(makeSpacer());
    }
    if (cleanText(subTopic.exemplarParagraph)) {
      children.push(makeSubHeading("Model Paragraph"));
      children.push(makeShadedBox(
        makeParagraphs(subTopic.exemplarParagraph, { inlineMarkdown: true }),
        BRAND.LIGHT_GREY
      ));
      children.push(makeSpacer());
    }
  } else if (asArray(subTopic.workedExamples).length) {
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
    children.push(makeShadedBox(`Tip: ${subTopic.tip}`, BRAND.GREEN_BG, {
      inlineMarkdown: true,
    }));
  }
  if (subTopic.commonMistake) {
    children.push(makeShadedBox(`Common Mistake: ${subTopic.commonMistake}`, BRAND.AMBER_BG, {
      inlineMarkdown: true,
    }));
  }

  if (asArray(subTopic.practiceQuestions).length || asArray(subTopic.questions).length) {
    children.push(makeSubHeading("Practice Questions"));
    children.push(...(await renderQuestionList(
      subTopic.practiceQuestions || subTopic.questions,
      { responseLines: isEnglish, showMarks }
    )));
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
  validateTopicBookletResource(resource, options);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Topic Booklet";
  const isEnglish = isEnglishSubject(subject);
  const sections = quizSections(resource);
  const contentsEntries = [
    ...(isEnglish && asArray(resource.stimulus).length
      ? [{ title: "Stimulus booklet", level: 1 }]
      : []),
    ...asArray(resource.subTopics).map((subTopic) => ({
      title: subTopic.title || subTopic.name || "Sub-topic",
      level: 1,
    })),
    ...(sections.length
      ? [
          { title: "End of Topic Quiz", level: 1 },
          ...sections.map((section) => ({
            title: section.title || section.name || "Quiz Section",
            level: 2,
          })),
        ]
      : []),
    ...(shouldIncludeAnswers(options)
      ? [{ title: isEnglish ? "Marking Guide" : "Answers", level: 1 }]
      : []),
    ...(asArray(resource.quickReference).length
      ? [{ title: "Quick Reference", level: 1 }]
      : []),
  ];
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
  children.push(...makeTableOfContents(contentsEntries));
  children.push(...renderStimulusBooklet(resource, subject, { includeInTableOfContents: true }));

  for (const subTopic of asArray(resource.subTopics)) {
    children.push(...(await renderSubTopic(subTopic, {
      isEnglish,
      showMarks: options.showMarks === true,
    })));
  }

  if (sections.length) {
    children.push(makePageBreak());
    children.push(makeContentsHeading("End of Topic Quiz", { section: true }));
    for (const section of sections) {
      children.push(makeContentsHeading(section.title || section.name || "Quiz Section", { level: 2 }));
      children.push(...(await renderQuestionList(section.questions, {
        responseLines: isEnglish,
        showMarks: options.showMarks === true,
      })));
    }
  }

  if (shouldIncludeAnswers(options)) {
    children.push(makePageBreak());
    children.push(makeContentsHeading(isEnglish ? "Marking Guide" : "Answers", { section: true }));
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
  }

  if (asArray(resource.quickReference).length) {
    children.push(makePageBreak());
    children.push(makeContentsHeading("Quick Reference", { section: true }));
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
    updateFields: true,
  });
}

module.exports = {
  buildTopicBookletDocx,
  validateTopicBookletResource,
};
