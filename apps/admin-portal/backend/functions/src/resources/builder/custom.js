"use strict";

const {
  asArray,
  makeAnswerTable,
  makeBulletList,
  makeDetailLine,
  makeKeyValueTable,
  makePageBreak,
  makeParagraphs,
  makeQuestionMarkingGuide,
  makeSectionHeading,
  makeShadedBox,
  makeSpacer,
  makeSubHeading,
  makeTable,
  packDocument,
  renderQuestionList,
} = require("./common");
const { BRAND, PAGE } = require("./branding");
const { cleanText, paragraph, titleCase } = require("./shared");

function validateCustomResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw new TypeError("Custom resource must be an object");
  }
}

function objectTable(rows) {
  const objects = asArray(rows).filter((row) => row && typeof row === "object" && !Array.isArray(row));
  const headers = [...new Set(objects.flatMap((row) => Object.keys(row)))].slice(0, 6);
  if (!headers.length) return [];
  const widths = headers.map(() => Math.floor(PAGE.CONTENT_WIDTH / headers.length));
  return [makeTable(
    headers.map((header) => titleCase(header)),
    objects.map((row) => headers.map((header) => row[header] ?? "")),
    { widths }
  )];
}

async function renderBlock(block, depth = 0) {
  if (block === null || block === undefined) return [];
  if (typeof block === "string" || typeof block === "number") {
    return makeParagraphs(String(block));
  }
  if (Array.isArray(block)) {
    if (block.every((item) => typeof item === "string")) return makeBulletList(block);
    if (block.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return objectTable(block);
    }
    const children = [];
    for (const item of block) children.push(...(await renderBlock(item, depth + 1)));
    return children;
  }

  const type = cleanText(block.type).toLowerCase();
  if (type === "heading") return [depth ? makeSubHeading(block.text || block.title) : makeSectionHeading(block.text || block.title)];
  if (type === "paragraph") return makeParagraphs(block.text || block.content || "");
  if (type === "bulletlist") return makeBulletList(block.items || []);
  if (type === "table") {
    const headers = asArray(block.headers);
    const rows = asArray(block.rows);
    if (headers.length && rows.length) return [makeTable(headers, rows)];
    return objectTable(block.rows || []);
  }
  if (type === "notebox") {
    return [makeShadedBox(`${block.title ? `${block.title}: ` : ""}${block.text || block.content || ""}`, BRAND.LIGHT_BLUE_BG)];
  }
  if (type === "questionset") {
    return renderQuestionList(block.questions || []);
  }
  if (type === "answersection") {
    if (asArray(block.answers).some((answer) => answer?.markingCriteria || answer?.criteria || answer?.suggestedResponse)) {
      return [makeSectionHeading(block.title || "Marking Guide"), makeSpacer(), makeQuestionMarkingGuide(block.answers || [])];
    }
    return [makeSectionHeading(block.title || "Answers"), makeSpacer(), makeAnswerTable(block.answers || [])];
  }
  if (type === "markingguidesection") {
    return [makeSectionHeading(block.title || "Marking Guide"), makeSpacer(), makeQuestionMarkingGuide(block.guidance || block.answers || [])];
  }

  const children = [];
  for (const [key, value] of Object.entries(block)) {
    if (key === "type") continue;
    if (typeof value === "string" || typeof value === "number") {
      children.push(makeSubHeading(titleCase(key)));
      children.push(...makeParagraphs(String(value)));
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      children.push(makeSubHeading(titleCase(key)));
      children.push(...makeBulletList(value));
    } else if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      children.push(makeSubHeading(titleCase(key)));
      children.push(...objectTable(value));
    } else if (value && typeof value === "object") {
      children.push(makeSubHeading(titleCase(key)));
      children.push(...(await renderBlock(value, depth + 1)));
    }
  }
  return children.length ? children : [paragraph("No custom content supplied.")];
}

async function buildCustomDocx(resource, options = {}) {
  validateCustomResource(resource);

  const studentName = cleanText(options.studentName || resource.studentName);
  const subject = resource.subject || options.subject || "";
  const year = resource.year || options.year || "";
  const title = resource.title || "Custom Resource";
  const children = [];

  children.push(makeDetailLine([
    resource.description || "Custom Tenacity resource",
    resource.topic ? `Topic: ${resource.topic}` : null,
  ]));
  children.push(...(await renderBlock(resource.blocks || resource.content || resource.sections || {})));

  return packDocument({
    title,
    subject,
    year,
    topic: resource.topic || "Custom",
    studentName,
    children,
  });
}

module.exports = {
  buildCustomDocx,
  renderBlock,
  validateCustomResource,
};
