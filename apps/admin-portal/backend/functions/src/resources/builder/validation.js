"use strict";

const { cleanText } = require("./shared");
const { isShapeDiagramDisabled } = require("../diagramPolicy");

class ResourceValidationError extends TypeError {
  constructor(message) {
    super(`Invalid resource JSON: ${message}`);
    this.name = "ResourceValidationError";
  }
}

function fail(message) {
  throw new ResourceValidationError(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isPlainObject(value)) fail(`${path} must be an object`);
  return value;
}

function assertArray(value, path, opts = {}) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  if (opts.min !== undefined && value.length < opts.min) {
    fail(`${path} must contain at least ${opts.min} item${opts.min === 1 ? "" : "s"}`);
  }
  return value;
}

function optionalArray(value, path) {
  if (value === null || value === undefined) return [];
  return assertArray(value, path);
}

function assertText(value, path, opts = {}) {
  if (typeof value !== "string") fail(`${path} must be a string`);
  const text = cleanText(value);
  if (opts.required !== false && !text) fail(`${path} must not be empty`);
  return text;
}

function optionalText(value, path) {
  if (value === null || value === undefined) return "";
  return assertText(value, path, { required: false });
}

function assertNumber(value, path, opts = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path} must be a finite number`);
  if (opts.integer && !Number.isInteger(value)) fail(`${path} must be an integer`);
  if (opts.min !== undefined && value < opts.min) fail(`${path} must be at least ${opts.min}`);
  return value;
}

function optionalNumber(value, path, opts = {}) {
  if (value === null || value === undefined) return null;
  return assertNumber(value, path, opts);
}

function assertStringArray(value, path, opts = {}) {
  const rows = assertArray(value, path, opts);
  rows.forEach((item, index) => assertText(item, `${path}[${index}]`));
  return rows;
}

function optionalStringArray(value, path) {
  if (value === null || value === undefined) return [];
  return assertStringArray(value, path);
}

function validateBaseResource(resource, label) {
  assertObject(resource, label);
  assertText(resource.title, `${label}.title`);
  assertText(resource.subject, `${label}.subject`);
  assertNumber(resource.year, `${label}.year`, { integer: true, min: 1 });
}

function validateDiagram(value, path) {
  if (value === null || value === undefined) return;
  assertObject(value, path);
  const type = assertText(value.type, `${path}.type`);
  if (isShapeDiagramDisabled(type)) {
    fail(`${path}.type ${type} is temporarily disabled; use null or a non-shape diagram type`);
  }
}

function validateQuestionPart(part, path) {
  assertObject(part, path);
  assertText(part.label, `${path}.label`);
  assertText(part.stem, `${path}.stem`);
  assertNumber(part.marks, `${path}.marks`, { min: 0 });
  assertNumber(part.workingLines, `${path}.workingLines`, { integer: true, min: 0 });
  validateDiagram(part.diagram, `${path}.diagram`);
}

function validateQuestion(question, path, opts = {}) {
  assertObject(question, path);
  assertNumber(question.number, `${path}.number`, { integer: true, min: 1 });
  assertText(question.stem || question.text || question.instruction, `${path}.stem`);
  assertNumber(question.marks, `${path}.marks`, { min: 0 });
  if (opts.requireSubTopic) assertText(question.subTopic, `${path}.subTopic`);
  if (opts.requireType) assertText(question.type, `${path}.type`);
  if (question.options !== null && question.options !== undefined) {
    assertStringArray(question.options, `${path}.options`, { min: 2 });
  }
  validateDiagram(question.diagram, `${path}.diagram`);

  if (question.parts === null || question.parts === undefined) {
    assertNumber(question.workingLines, `${path}.workingLines`, { integer: true, min: 0 });
    return;
  }

  const parts = assertArray(question.parts, `${path}.parts`, { min: 1 });
  parts.forEach((part, index) => validateQuestionPart(part, `${path}.parts[${index}]`));
}

function validateQuestionArray(questions, path, opts = {}) {
  assertArray(questions, path, { min: 1 }).forEach((question, index) => {
    validateQuestion(question, `${path}[${index}]`, opts);
  });
}

function validateAnswerRow(answer, path, opts = {}) {
  assertObject(answer, path);
  assertNumber(answer.questionNumber, `${path}.questionNumber`, { integer: true, min: 1 });
  optionalText(answer.partLabel, `${path}.partLabel`);
  assertText(answer.answer, `${path}.answer`);
  if (opts.requireSubTopic) assertText(answer.subTopic, `${path}.subTopic`);
  if (opts.requireMarks) assertNumber(answer.marks, `${path}.marks`, { min: 0 });
  if (answer.workingOut !== null && answer.workingOut !== undefined) {
    assertText(answer.workingOut, `${path}.workingOut`, { required: false });
  }
  if (answer.note !== null && answer.note !== undefined) {
    assertText(answer.note, `${path}.note`, { required: false });
  }
}

function validateAnswerArray(answers, path, opts = {}) {
  assertArray(answers, path, { min: 1 }).forEach((answer, index) => {
    validateAnswerRow(answer, `${path}[${index}]`, opts);
  });
}

function validateMarkingGuideRow(row, path, opts = {}) {
  assertObject(row, path);
  if (opts.taskNumber) assertNumber(row.taskNumber, `${path}.taskNumber`, { integer: true, min: 1 });
  else assertNumber(row.questionNumber, `${path}.questionNumber`, { integer: true, min: 1 });
  optionalText(row.partLabel, `${path}.partLabel`);
  optionalText(row.subTopic, `${path}.subTopic`);
  optionalText(row.topic, `${path}.topic`);
  optionalText(row.section, `${path}.section`);
  assertText(row.suggestedResponse || row.sampleResponse || row.response || row.answer, `${path}.suggestedResponse`);
  assertStringArray(row.markingCriteria || row.criteria || row.successCriteria, `${path}.markingCriteria`, { min: 1 });
}

function validateMarkingGuideArray(rows, path, opts = {}) {
  assertArray(rows, path, { min: 1 }).forEach((row, index) => {
    validateMarkingGuideRow(row, `${path}[${index}]`, opts);
  });
}

function isEnglishSubject(subject) {
  return cleanText(subject).toLowerCase() === "english";
}

function validateTutorCopy(resource, path, opts = {}) {
  if (isEnglishSubject(resource.subject)) {
    validateMarkingGuideArray(resource.markingGuide || resource.answers, `${path}.markingGuide`, opts);
    return;
  }
  validateAnswerArray(resource.answers || resource.markScheme, `${path}.answers`, opts);
}

module.exports = {
  ResourceValidationError,
  assertArray,
  assertNumber,
  assertObject,
  assertStringArray,
  assertText,
  fail,
  isEnglishSubject,
  optionalArray,
  optionalNumber,
  optionalStringArray,
  optionalText,
  validateAnswerArray,
  validateBaseResource,
  validateDiagram,
  validateMarkingGuideArray,
  validateQuestion,
  validateQuestionArray,
  validateTutorCopy,
};
