"use strict";

// RES-40. A second look at the pages once the document has been converted.
//
// A section such as "Section A" or the end-of-topic quiz starts a new page.
// When the pages before it end a few lines into a page (a reading text that
// runs three lines over), that page is left almost empty. Nothing in the
// resource's content shows this: it depends on where the lines happened to
// fall. So the converted PDF is read page by page, and where a page holds only
// a few lines and the next one opens with a section heading, the resource is
// rebuilt with that section following on the same page (`layout.joinBefore`,
// applied by the builder's finishPageBreaks). The rebuild is kept only when it
// saves a page.
//
// No model is involved. Sections that must start a page (answers, a marking
// guide) are never joined: the builder only drops the breaks it marked
// joinable.

const { lazyRequire } = require("../shared/lazyRequire");

const loadPdfParse = lazyRequire(() => require("pdf-parse"));

// Up to this many printed lines, a page that ends a section is "a few lines":
// about 3 cm of a 24 cm page.
const SHORT_PAGE_LINES = 6;
const MAX_HEADING_CHARS = 70;
const FOOTER_LINE = /Tenacity Tutoring\b.*\bPage\s+\d+\s*$/;

/** The text of each page of a PDF, as an array of strings. */
async function pdfPageTexts(pdfBuffer) {
  const { PDFParse } = loadPdfParse();
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getText();
    return (result.pages || []).map((page) => String(page.text || ""));
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * The lines of each page's body: without the running header (the lines every
 * page starts with) and the footer.
 */
function pageBodies(pages) {
  const lines = pages.map((text) => String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  let headerLines = 0;
  if (lines.length > 1) {
    while (headerLines < 3 && lines.every((page) => page[headerLines] !== undefined && page[headerLines] === lines[0][headerLines])) {
      headerLines += 1;
    }
  }
  return lines.map((page) => page.slice(headerLines).filter((line) => !FOOTER_LINE.test(line)));
}

/**
 * Headings that open the page after a page holding only a few lines. The
 * builder joins a heading only where it follows a joinable break, so naming
 * one that must start its page (Answers) changes nothing.
 */
function findSectionJoins(pages) {
  const bodies = pageBodies(pages);
  const headings = [];
  for (let index = 0; index < bodies.length - 1; index += 1) {
    const body = bodies[index];
    const next = bodies[index + 1];
    if (!body.length || body.length > SHORT_PAGE_LINES || !next.length) continue;
    // A heading is short; a longer first line is a question or a paragraph.
    if (next[0].length > MAX_HEADING_CHARS) continue;
    if (!headings.includes(next[0])) headings.push(next[0]);
  }
  return headings;
}

/**
 * Rebuilds `built` with short pages joined to the section after them.
 * Returns the build and PDF to use, which are the originals unless the
 * rebuild printed on fewer pages.
 *
 * `rebuild(resource)` builds a resource into `{ buffer, resource, ... }`;
 * `convert(buffer)` returns its PDF, or null when conversion fails.
 */
async function joinShortSections({ built, pdf, rebuild, convert, clone, readPages = pdfPageTexts }) {
  const unchanged = { built, pdf, joined: [] };
  const pages = await readPages(pdf);
  const joinBefore = findSectionJoins(pages);
  if (!joinBefore.length) return unchanged;

  const working = clone(built.resource);
  const already = Array.isArray(working.layout?.joinBefore) ? working.layout.joinBefore : [];
  working.layout = { ...(working.layout || {}), joinBefore: [...new Set([...already, ...joinBefore])] };
  const rebuilt = await rebuild(working);
  const rebuiltPdf = await convert(rebuilt.buffer);
  if (!rebuiltPdf) return unchanged;
  const rebuiltPages = await readPages(rebuiltPdf);
  if (rebuiltPages.length >= pages.length) return unchanged;
  return { built: rebuilt, pdf: rebuiltPdf, joined: joinBefore, pagesSaved: pages.length - rebuiltPages.length };
}

module.exports = {
  SHORT_PAGE_LINES,
  findSectionJoins,
  joinShortSections,
  pageBodies,
  pdfPageTexts,
};
