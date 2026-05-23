"use strict";

const { buildWorksheetDocx } = require("./worksheet");
const { cleanText, formatSubject, titleCase } = require("./shared");

const RESOURCE_BUILDERS = {
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
  return builder(resource, options);
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
