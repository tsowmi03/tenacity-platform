"use strict";

// Reads the plain (non-equation) text back out of a built DOCX so the build
// can check its own output for maths notation that was never typeset.

const zlib = require("node:zlib");

const { hasRawMath, rawMathExcerpt } = require("../mathNotation");

const TEXT_PARTS = /^word\/(?:document|header\d*|footer\d*)\.xml$/;

function zipEntries(buffer) {
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSig) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return [];

  const entries = [];
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");
    entries.push({ name, method, compressedSize, localHeaderOffset });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries.map((entry) => ({
    name: entry.name,
    read() {
      const fileNameLen = buffer.readUInt16LE(entry.localHeaderOffset + 26);
      const extraLen = buffer.readUInt16LE(entry.localHeaderOffset + 28);
      const dataOffset = entry.localHeaderOffset + 30 + fileNameLen + extraLen;
      const data = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
      if (entry.method === 0) return data.toString("utf8");
      if (entry.method === 8) return zlib.inflateRawSync(data).toString("utf8");
      throw new Error(`Unsupported ZIP compression method: ${entry.method}`);
    },
  }));
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Plain text of each paragraph, from <w:t> runs only: equation text lives in
// <m:t> and is typeset by definition.
function paragraphTexts(xml) {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  return paragraphs
    .map((p) => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [])
      .map((t) => decodeXml(t.replace(/<[^>]+>/g, "")))
      .join(""))
    .filter(Boolean);
}

/**
 * Returns an issue for every paragraph of the built document that still
 * holds raw maths notation and was not already reported during the build.
 * Text already shown as a reported fallback is ignored.
 */
function findRawMathInDocx(buffer, knownIssues = []) {
  const known = knownIssues.map((issue) => issue.shownAs).filter(Boolean);
  const found = [];
  for (const entry of zipEntries(buffer)) {
    if (!TEXT_PARTS.test(entry.name)) continue;
    for (let text of paragraphTexts(entry.read())) {
      for (const shownAs of known) text = text.split(shownAs).join(" ");
      if (!hasRawMath(text)) continue;
      const snippet = rawMathExcerpt(text).slice(0, 80);
      if (!found.some((issue) => issue.source === snippet)) {
        found.push({ location: null, source: snippet, shownAs: snippet });
      }
    }
  }
  return found;
}

module.exports = { findRawMathInDocx, paragraphTexts, zipEntries };
