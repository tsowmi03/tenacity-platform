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
} = require("./common");
const { BRAND } = require("./branding");
const { cleanText, paragraph } = require("./shared");

function validateEssayScaffoldResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw new TypeError("Essay scaffold resource must be an object");
  }
  if (!Array.isArray(resource.sections)) {
    throw new TypeError("Essay scaffold resource must include a sections array");
  }
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
