"use strict";

const path = require("path");
const zlib = require("zlib");
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

function decodeXmlText(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractZipEntry(buffer, name) {
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSig) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");

    if (fileName === name) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null;
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(
        dataOffset,
        dataOffset + compressedSize
      );
      if (method === 0) return compressed;
      if (method === 8) return zlib.inflateRawSync(compressed);
      return null;
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function extractDocxMainXmlText(buffer) {
  const documentXml = extractZipEntry(buffer, "word/document.xml");
  if (!documentXml) return { hasMath: false, text: "" };

  const xml = documentXml.toString("utf8");
  const text = [];
  const textNodeRegex = /<(?:w|m):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:w|m):t>/g;
  let match;
  while ((match = textNodeRegex.exec(xml)) !== null) {
    text.push(decodeXmlText(match[1]));
  }

  return { hasMath: /<m:/.test(xml), text: text.join("") };
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const mammothText = result?.value || "";
  const xmlText = extractDocxMainXmlText(buffer);
  return xmlText.hasMath && xmlText.text ? xmlText.text : mammothText;
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
