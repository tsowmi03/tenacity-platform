"use strict";

const {
  asArray,
  makeBulletList,
  makeDetailLine,
  makeParagraphs,
  makeShadedBox,
  makeSubHeading,
  makeWorkingLines,
  packDocument,
  renderStimulusBooklet,
} = require("./common");
const { BRAND } = require("./branding");
const { cleanText, paragraph } = require("./shared");
const {
  assertArray,
  assertNumber,
  assertObject,
  assertStringArray,
  assertText,
  optionalStimulus,
  optionalStringArray,
  optionalTopics,
  validateBaseResource,
} = require("./validation");

function validateEssayScaffoldResource(resource) {
  validateBaseResource(resource, "essayScaffold");
  optionalStimulus(resource.stimulus, "essayScaffold.stimulus");
  optionalTopics(resource.topics);
  assertText(resource.essayType, "essayScaffold.essayType");
  assertText(resource.essayQuestion, "essayScaffold.essayQuestion");
  assertNumber(resource.targetWordCount, "essayScaffold.targetWordCount", { integer: true, min: 1 });
  assertArray(resource.sections, "essayScaffold.sections", { min: 1 }).forEach((section, index) => {
    const path = `essayScaffold.sections[${index}]`;
    assertObject(section, path);
    assertText(section.name, `${path}.name`);
    assertText(section.purpose, `${path}.purpose`);
    assertNumber(section.suggestedWordCount, `${path}.suggestedWordCount`, { integer: true, min: 0 });
    assertStringArray(section.prompts, `${path}.prompts`, { min: 1 });
    assertStringArray(section.sentenceStarters, `${path}.sentenceStarters`, { min: 1 });
    assertNumber(section.planningLines, `${path}.planningLines`, { integer: true, min: 0 });
  });
  optionalStringArray(resource.vocabularyBank, "essayScaffold.vocabularyBank");
  assertStringArray(resource.generalGuidance, "essayScaffold.generalGuidance", { min: 1 });
}

async function buildEssayScaffoldDocx(resource, options = {}) {
  validateEssayScaffoldResource(resource);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "english";
  const year = resource.year || options.year || "";
  const title = resource.title || resource.essayType || "Essay Scaffold";
  const children = [];

  children.push(makeDetailLine([
    resource.essayType || "Essay planning scaffold",
    resource.targetWordCount ? `Target word count: ${resource.targetWordCount}` : null,
  ]));
  children.push(makeShadedBox(`Essay question: ${resource.essayQuestion || ""}`, BRAND.LIGHT_BLUE_BG));
  children.push(...renderStimulusBooklet(resource, subject));

  if (asArray(resource.generalGuidance).length) {
    children.push(makeSubHeading("General Guidance"));
    children.push(...makeBulletList(resource.generalGuidance));
  }

  for (const section of asArray(resource.sections)) {
    children.push(makeSubHeading(section.name || "Planning Section"));
    if (section.purpose) {
      children.push(paragraph(section.purpose, { italics: true, color: "555555" }));
    }
    if (asArray(section.prompts).length) {
      children.push(...makeBulletList(section.prompts));
    }
    if (asArray(section.sentenceStarters).length) {
      children.push(makeShadedBox(`Sentence starters: ${section.sentenceStarters.join("; ")}`, BRAND.LIGHT_GREY));
    }
    children.push(...makeWorkingLines(section.planningLines ?? 5));
  }

  if (asArray(resource.vocabularyBank).length) {
    children.push(makeSubHeading("Vocabulary Bank"));
    children.push(makeShadedBox(resource.vocabularyBank.join(", "), BRAND.LIGHT_GREY));
  }
  if (resource.generalGuidanceText) {
    children.push(...makeParagraphs(resource.generalGuidanceText));
  }

  return packDocument({
    title,
    subject,
    year,
    topic: resource.essayType || "Essay scaffold",
    studentName,
    children,
  });
}

module.exports = {
  buildEssayScaffoldDocx,
  validateEssayScaffoldResource,
};
