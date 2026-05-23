"use strict";

const path = require("path");
const mammoth = require("mammoth");
const { PDFParse } = require("pdf-parse");

const PDF_MIME_TYPES = new Set(["application/pdf"]);
const DOCX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function inferFileType({ mimeType, fileName } = {}) {
  const lowerMime = String(mimeType || "").toLowerCase();
  if (PDF_MIME_TYPES.has(lowerMime)) return "pdf";
  if (DOCX_MIME_TYPES.has(lowerMime)) return "docx";
  if (TEXT_MIME_TYPES.has(lowerMime)) return "text";

  const extension = path.extname(String(fileName || "")).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  if ([".txt", ".md", ".csv", ".json"].includes(extension)) return "text";
  return "text";
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result?.value || "";
}

async function extractTextFromBuffer(buffer, metadata = {}, deps = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("extractTextFromBuffer requires a Buffer");
  }

  const fileType = inferFileType(metadata);
  const extractors = {
    pdf: deps.extractPdfText || extractPdfText,
    docx: deps.extractDocxText || extractDocxText,
    text: deps.extractPlainText || ((data) => data.toString("utf8")),
  };

  const rawText = await extractors[fileType](buffer, metadata);
  return normalizeExtractedText(rawText);
}

module.exports = {
  extractDocxText,
  extractPdfText,
  extractTextFromBuffer,
  inferFileType,
  normalizeExtractedText,
};
