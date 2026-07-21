"use strict";

const { BRAND } = require("./branding");
const { DEFAULT_RESOURCE_AUTHOR } = require("../humanStyle");
const { cleanText, paragraph } = require("./shared");

// Split passage/stimulus text into blocks (paragraphs / stanzas) separated by
// blank lines, each block being its cleaned, non-empty lines. A blank line is a
// paragraph or stanza boundary; a single newline within a block is an
// intentional line break (poetry). cleanText collapses newlines to spaces, so we
// must split before cleaning and render line breaks as distinct paragraphs.
// Hard-wrapped prose is unwrapped upstream (see sourcedText normalisation) so it
// does not arrive here as spurious mid-sentence breaks.
function splitPassageBlocks(value, opts = {}) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((block) => block.split("\n").map((line) => cleanText(line, opts)).filter(Boolean))
    .filter((lines) => lines.length);
}

// Render one passage/stimulus text as distinct, structured paragraphs: an
// optional label ("Text 1"), a bold title, an italic attribution caption, then
// the body with its paragraph and stanza breaks intact. Lines within a block sit
// tight together (poetry stays as verse); blocks are separated by a larger gap
// (prose paragraphs / stanza breaks). Pushing the body through a single
// paragraph would collapse its newlines to spaces, so the whole passage would
// render as one run-on block — this is what makes both the annotation task and
// the practice-paper stimulus booklet render correctly.
// When `verbatim` is true the body is a verified source text: it keeps its
// original punctuation (no deAiPunctuation) and is never scanned for math
// spans. Headings and attribution are our own composed text and stay cleaned.
function makePassageContent({ label, title, author, source, body, verbatim } = {}) {
  const children = [];
  // Generated stimuli are always credited to Tenacity Resources. A real
  // public-domain text keeps its true author (the prompt requires accurate
  // attribution); only an unattributed passage falls back to the default.
  const authorName = cleanText(author) || DEFAULT_RESOURCE_AUTHOR;
  const heading = [cleanText(label), cleanText(title)].filter(Boolean).join(": ");
  const attribution = [
    `Author: ${authorName}`,
    source ? `Source: ${cleanText(source)}` : null,
  ].filter(Boolean).join("   |   ");
  const blocks = splitPassageBlocks(body, verbatim ? { verbatim: true } : {});
  const hasBody = blocks.length > 0;

  if (heading) {
    children.push(paragraph(heading, {
      bold: true,
      color: BRAND.NAVY,
      size: BRAND.FONT_SIZE_H3,
      spacing: { after: attribution || hasBody ? 60 : 0 },
    }));
  }
  if (attribution) {
    children.push(paragraph(attribution, {
      italics: true,
      color: "555555",
      size: BRAND.FONT_SIZE_SMALL,
      spacing: { after: hasBody ? 160 : 0 },
    }));
  }
  blocks.forEach((lines, blockIndex) => {
    const lastBlock = blockIndex === blocks.length - 1;
    lines.forEach((line, lineIndex) => {
      const lastLineOfBlock = lineIndex === lines.length - 1;
      // Tight spacing between lines of the same block (verse lines / wrapped
      // prose); a paragraph-sized gap between blocks; none after the last line.
      const after = !lastLineOfBlock ? 30 : lastBlock ? 0 : 160;
      children.push(paragraph(line, {
        spacing: { after },
        ...(verbatim ? { math: false, verbatim: true } : {}),
      }));
    });
  });

  return children.length ? children : [paragraph("", { spacing: { after: 0 } })];
}

module.exports = {
  splitPassageBlocks,
  makePassageContent,
};
