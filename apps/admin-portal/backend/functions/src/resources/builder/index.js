"use strict";

const { buildAnnotationTaskDocx } = require("./annotationTask");
const { buildCustomDocx } = require("./custom");
const { buildDiagnosticTestDocx } = require("./diagnosticTest");
const { buildEssayScaffoldDocx } = require("./essayScaffold");
const { buildMixedReviewDocx } = require("./mixedReview");
const { buildPracticePaperDocx } = require("./practicePaper");
const { buildStudyGuideDocx } = require("./studyGuide");
const { buildTopicBookletDocx } = require("./topicBooklet");
const { buildWorksheetDocx } = require("./worksheet");
const { isEnglishSubject } = require("./common");
const { cleanText, formatSubject, runWithMathRendering, titleCase } = require("./shared");

const RESOURCE_BUILDERS = {
  "annotation-task": buildAnnotationTaskDocx,
  custom: buildCustomDocx,
  "diagnostic-test": buildDiagnosticTestDocx,
  "essay-scaffold": buildEssayScaffoldDocx,
  "mixed-review": buildMixedReviewDocx,
  "practice-paper": buildPracticePaperDocx,
  "study-guide": buildStudyGuideDocx,
  "topic-booklet": buildTopicBookletDocx,
  worksheet: buildWorksheetDocx,
};

function resourceTypeLabel(resourceType) {
  return titleCase(String(resourceType || "").replace(/-/g, " ")) || "Resource";
}

function sanitizeFileSegment(value, fallback) {
  const safe = cleanText(value || fallback)
    .replace(/&/g, "and")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (safe || fallback || "Resource").slice(0, 80).trim();
}

function isoDatePart(date) {
  if (date instanceof Date && !Number.isNaN(date.valueOf())) {
    return date.toISOString().slice(0, 10);
  }
  return sanitizeFileSegment(date, new Date().toISOString().slice(0, 10));
}

async function buildResourceDocx(resourceType, resource, options = {}) {
  const builder = RESOURCE_BUILDERS[resourceType];
  if (!builder) {
    throw new Error(`Unsupported resource type: ${resourceType}`);
  }
  // English resources are prose — disable the math pipeline so slashes and
  // hyphens in ordinary text aren't typeset as fractions or subtractions.
  const subject = resource?.subject || options.subject || "";
  return runWithMathRendering(!isEnglishSubject(subject), () =>
    builder(resource, options)
  );
}

function buildOutputFileName({
  resourceType,
  title,
  studentName,
  year,
  subject,
  date = new Date(),
}) {
  const subjectLabel = formatSubject(subject);
  const parts = [
    sanitizeFileSegment(resourceTypeLabel(resourceType), "Resource"),
    studentName ? sanitizeFileSegment(studentName, "Student") : null,
    year ? sanitizeFileSegment(`Year ${year} ${subjectLabel || ""}`, `Year ${year}`) : subjectLabel,
    title ? sanitizeFileSegment(title, "Resource") : null,
    isoDatePart(date),
  ].filter(Boolean);

  return `${parts.join(" - ")}.docx`;
}

module.exports = {
  RESOURCE_BUILDERS,
  buildOutputFileName,
  buildResourceDocx,
  resourceTypeLabel,
  sanitizeFileSegment,
};
