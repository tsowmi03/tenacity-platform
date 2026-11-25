"use strict";

// RES-40. Finds the pages of a PDF that are left nearly empty: a page holding
// only a header and footer, or one or two answer lines pushed over from the
// page before. Each page is drawn small and measured by how far down its body
// the ink reaches, so a page filled by a diagram is not mistaken for a blank
// one (its text alone would look empty).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DPI = 36;
// The running header and footer sit in these bands of the page height.
const HEADER_BAND = 0.105;
const FOOTER_BAND = 0.085;
// A page whose ink stops within the top 15% of the body is near-blank.
const SPARSE_FILL = 0.15;
const INK_THRESHOLD = 200;

/** How far down the body the ink reaches, 0–1, from 8-bit greyscale rows. */
function bodyFill({ data, width, height }) {
  const top = Math.round(height * HEADER_BAND);
  const bottom = Math.round(height * (1 - FOOTER_BAND));
  let lastInkRow = -1;
  let inkRows = 0;
  for (let y = top; y < bottom; y++) {
    let ink = false;
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < INK_THRESHOLD) { ink = true; break; }
    }
    if (ink) { lastInkRow = y; inkRows += 1; }
  }
  const body = Math.max(1, bottom - top);
  return {
    fill: lastInkRow < 0 ? 0 : (lastInkRow - top + 1) / body,
    lines: inkRows,
  };
}

/** Parses a binary PGM (P5) image, the format `pdftoppm -gray` writes. */
function readPgm(buffer) {
  let offset = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (/\s/.test(String.fromCharCode(buffer[offset]))) offset += 1;
    if (buffer[offset] === 0x23) { // a comment line
      while (buffer[offset] !== 0x0a) offset += 1;
      continue;
    }
    let end = offset;
    while (!/\s/.test(String.fromCharCode(buffer[end]))) end += 1;
    tokens.push(buffer.toString("ascii", offset, end));
    offset = end;
  }
  if (tokens[0] !== "P5") throw new Error("Not a binary PGM");
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  return { width, height, data: buffer.subarray(offset + 1, offset + 1 + width * height) };
}

/**
 * Pages of `pdfPath` and the near-blank ones among them.
 * `sparse` rows: { page, fill, lines, last } with `fill` the share of the body
 * the ink reaches.
 */
function findSparsePages(pdfPath, { sparseFill = SPARSE_FILL } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tenacity-pages-"));
  execFileSync("pdftoppm", ["-r", String(DPI), "-gray", pdfPath, path.join(dir, "p")], { stdio: "ignore" });
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".pgm")).sort((a, b) =>
    Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  const fills = files.map((name) => bodyFill(readPgm(fs.readFileSync(path.join(dir, name)))));
  for (const name of files) fs.unlinkSync(path.join(dir, name));
  fs.rmdirSync(dir);
  const sparse = fills
    .map((entry, index) => ({ page: index + 1, fill: Number(entry.fill.toFixed(3)), lines: entry.lines, last: index === fills.length - 1 }))
    .filter((entry) => entry.fill < sparseFill);
  return { pages: fills.length, fills: fills.map((entry) => Number(entry.fill.toFixed(3))), sparse };
}

module.exports = { bodyFill, findSparsePages, readPgm, HEADER_BAND, FOOTER_BAND, SPARSE_FILL };
