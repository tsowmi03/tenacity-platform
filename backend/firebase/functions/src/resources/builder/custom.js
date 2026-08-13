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
const {
  assertArray,
  assertObject,
  assertText,
  fail,
  validateBaseResource,
  validateMarkingGuideArray,
  validateQuestionArray,
} = require("./validation");

function validateCustomResource(resource) {
  validateBaseResource(resource, "custom");
  assertText(resource.resourceType, "custom.resourceType");
  validateCustomContent(resource.blocks || resource.content || resource.sections, "custom.content");
}

function validateCustomContent(content, path) {
  if (typeof content === "string" || typeof content === "number") return;
  if (Array.isArray(content)) {
    assertArray(content, path, { min: 1 });
    content.forEach((item, index) => validateCustomContent(item, `${path}[${index}]`));
    return;
  }

  assertObject(content, path);
  if (!content.type) {
    if (!Object.keys(content).length) fail("custom.content must not be empty");
    for (const [key, value] of Object.entries(content)) {
      validateCustomContent(value, `${path}.${key}`);
    }
    return;
  }

  const type = cleanText(content.type).toLowerCase();
  if (type === "heading") assertText(content.text || content.title, `${path}.text`);
  else if (type === "paragraph") assertText(content.text || content.content, `${path}.text`);
  else if (type === "bulletlist") assertArray(content.items, `${path}.items`, { min: 1 });
  else if (type === "table") {
    assertArray(content.headers, `${path}.headers`, { min: 1 });
    assertArray(content.rows, `${path}.rows`, { min: 1 });
  } else if (type === "notebox") {
    assertText(content.text || content.content, `${path}.text`);
  } else if (type === "questionset") {
    validateQuestionArray(content.questions, `${path}.questions`);
  } else if (type === "answersection") {
    assertArray(content.answers, `${path}.answers`, { min: 1 });
  } else if (type === "markingguidesection") {
    validateMarkingGuideArray(content.guidance || content.answers, `${path}.guidance`);
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

async function renderBlock(block, depth = 0, opts = {}) {
  if (block === null || block === undefined) return [];
  if (typeof block === "string" || typeof block === "number") {
    return makeParagraphs(String(block));
  }
  if (Array.isArray(block)) {
    if (!block.length) return [];
    if (block.every((item) => typeof item === "string")) return makeBulletList(block);
    // An item carrying a `type` is a branded block (heading, paragraph, table, noteBox, ...),
    // not a data record. A list of such blocks must be dispatched one by one so each renders
    // in its proper shape. Only an array of plain records (no `type`) should collapse into a
    // single data table — otherwise the whole document flattens into one giant table.
    const isBlockList = block.some(
      (item) => item && typeof item === "object" && !Array.isArray(item) && item.type
    );
    if (!isBlockList && block.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return objectTable(block);
    }
    const children = [];
    for (const item of block) children.push(...(await renderBlock(item, depth, opts)));
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
    return renderQuestionList(block.questions || [], opts);
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
    } else if (value && typeof value === "object") {
      // Route arrays and nested objects back through renderBlock so a list of branded blocks is
      // dispatched per-block rather than flattened into a table. renderBlock still collapses true
      // record arrays (string[] -> bullets, record[] -> data table) on its own.
      children.push(makeSubHeading(titleCase(key)));
      children.push(...(await renderBlock(value, depth + 1, opts)));
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
  children.push(...(await renderBlock(
    resource.blocks || resource.content || resource.sections || {},
    0,
    {
      responseLines: cleanText(subject).toLowerCase() === "english",
      showMarks: options.showMarks === true,
    }
  )));

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
