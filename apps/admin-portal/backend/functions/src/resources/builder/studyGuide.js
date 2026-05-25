"use strict";

const {
  asArray,
  makeBulletList,
  makeDetailLine,
  makeKeyValueTable,
  makeParagraphs,
  makeSectionHeading,
  makeSpacer,
  makeSubHeading,
  makeTable,
  packDocument,
} = require("./common");
const { cleanText, makeDefinitionTable } = require("./shared");
const {
  assertArray,
  assertObject,
  assertStringArray,
  assertText,
  optionalArray,
  optionalStringArray,
  validateBaseResource,
} = require("./validation");

function validateStudyGuideResource(resource) {
  validateBaseResource(resource, "studyGuide");
  assertStringArray(resource.topics, "studyGuide.topics", { min: 1 });
  assertArray(resource.sections, "studyGuide.sections", { min: 1 }).forEach((section, index) => {
    const path = `studyGuide.sections[${index}]`;
    assertObject(section, path);
    assertText(section.title || section.heading || section.topic, `${path}.title`);
    assertText(section.summary || section.explanation, `${path}.summary`);
    assertStringArray(section.keyPoints, `${path}.keyPoints`, { min: 1 });
    optionalArray(section.formulas, `${path}.formulas`).forEach((formula, formulaIndex) => {
      const formulaPath = `${path}.formulas[${formulaIndex}]`;
      assertObject(formula, formulaPath);
      assertText(formula.name, `${formulaPath}.name`);
      assertText(formula.formula, `${formulaPath}.formula`);
      assertText(formula.note || formula.description, `${formulaPath}.note`, { required: false });
    });
    optionalArray(section.definitions, `${path}.definitions`).forEach((definition, definitionIndex) => {
      const definitionPath = `${path}.definitions[${definitionIndex}]`;
      assertObject(definition, definitionPath);
      assertText(definition.term, `${definitionPath}.term`);
      assertText(definition.definition, `${definitionPath}.definition`);
    });
  });
  optionalArray(resource.quickReference, "studyGuide.quickReference").forEach((row, index) => {
    const path = `studyGuide.quickReference[${index}]`;
    assertObject(row, path);
    assertText(row.concept, `${path}.concept`);
    assertText(row.summary, `${path}.summary`);
  });
  optionalStringArray(resource.examTips || resource.revisionTips, "studyGuide.revisionTips");
}

function makeFormulaTable(formulas = []) {
  return makeTable(
    ["Name", "Formula", "Note"],
    asArray(formulas).map((formula) => [
      formula.name || "",
      formula.formula || "",
      formula.note || formula.description || "",
    ]),
    { widths: [2200, 2800, 4026] }
  );
}

function makeQuickReferenceTable(rows = []) {
  return makeTable(
    ["Concept", "Summary"],
    asArray(rows).map((row) => [row.concept || "", row.summary || ""]),
    { widths: [2800, 6226] }
  );
}

async function buildStudyGuideDocx(resource, options = {}) {
  validateStudyGuideResource(resource);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Study Guide";
  const topics = asArray(resource.topics);
  const children = [];

  children.push(makeDetailLine([
    topics.length ? `Topics covered: ${topics.join(", ")}` : null,
    resource.focus ? `Focus: ${resource.focus}` : null,
  ]));

  for (const section of asArray(resource.sections)) {
    children.push(makeSubHeading(section.title || section.topic || "Section"));
    children.push(...makeParagraphs(section.summary || section.explanation || ""));
    if (asArray(section.keyPoints).length) {
      children.push(...makeBulletList(section.keyPoints));
    }
    if (asArray(section.formulas).length) {
      children.push(makeSubHeading("Formulas"));
      children.push(makeFormulaTable(section.formulas));
      children.push(makeSpacer());
    }
    if (asArray(section.definitions).length) {
      children.push(makeSubHeading("Definitions"));
      children.push(makeDefinitionTable(section.definitions));
      children.push(makeSpacer());
    }
  }

  if (asArray(resource.quickReference).length) {
    children.push(makeSectionHeading("Quick Reference"));
    children.push(makeSpacer());
    children.push(makeQuickReferenceTable(resource.quickReference));
  } else if (resource.examTips || resource.revisionTips) {
    children.push(makeSectionHeading("Revision Tips"));
    children.push(makeKeyValueTable([
      ["Tips", asArray(resource.examTips || resource.revisionTips)],
    ]));
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
  buildStudyGuideDocx,
  validateStudyGuideResource,
};
