"use strict";

const { AlignmentType, ImageRun, Paragraph } = require("docx");

const { BRAND } = require("./branding");
const { DEFAULT_RESOURCE_AUTHOR } = require("../humanStyle");
const { cleanText, paragraph } = require("./shared");

// Roughly two-thirds of the A4 content width. A visual stimulus has to be big
// enough to analyse — students are asked about salience, small print and
// composition — while still leaving the question space on the page.
const STIMULUS_IMAGE_TARGET_WIDTH = 400;

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
      // A citation is not prose and must never go through the maths parser: it
      // reads the "/" in a URL path as a fraction, so
      // "https://en.wikisource.org/wiki/Ozymandias" rendered as
      // "https://en.wikisource./Ozymandias" — an unusable link on every sourced
      // resource, which defeats the point of sourcing verifiable text.
      math: false,
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

/**
 * Render one sourced visual stimulus: a heading, the image, the task, then the
 * credit line.
 *
 * The credit is not decoration. Commons material is used under CC BY / CC BY-SA
 * or as public domain, and the attribution is what keeps a paid resource on the
 * right side of those terms — so creator, licence and the source URL are
 * printed even when they crowd the page. An image with no usable bytes renders
 * nothing at all rather than a caption describing a picture that is not there.
 */
function makeImageContent({ label, title, creator, date, licence, source, task, image } = {}) {
  if (!image?.buffer || !image.type) return [];

  // Every part of the block except the last carries keepNext, so the heading,
  // picture, task and credit stay on one page. Without it the heading strands
  // itself at the foot of the previous page and the student meets the image
  // with no label on it.
  const children = [];
  const heading = [cleanText(label), cleanText(title)].filter(Boolean).join(": ");
  if (heading) {
    children.push(paragraph(heading, {
      bold: true,
      color: BRAND.NAVY,
      size: BRAND.FONT_SIZE_H3,
      spacing: { after: 120 },
      keepNext: true,
    }));
  }

  const scale = Math.min(1, STIMULUS_IMAGE_TARGET_WIDTH / (image.width || STIMULUS_IMAGE_TARGET_WIDTH));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    keepNext: true,
    children: [
      new ImageRun({
        data: image.buffer,
        type: image.type,
        transformation: {
          width: Math.round((image.width || STIMULUS_IMAGE_TARGET_WIDTH) * scale),
          height: Math.round((image.height || STIMULUS_IMAGE_TARGET_WIDTH) * scale),
        },
      }),
    ],
  }));

  if (task) {
    children.push(paragraph(task, { spacing: { after: 80 }, keepNext: true }));
  }

  const credit = [
    creator ? `Image: ${cleanText(creator)}` : null,
    date ? cleanText(date) : null,
    licence ? cleanText(licence) : null,
    source ? cleanText(source) : null,
  ].filter(Boolean).join("   |   ");
  if (credit) {
    children.push(paragraph(credit, {
      italics: true,
      color: "555555",
      size: BRAND.FONT_SIZE_SMALL,
      spacing: { after: 0 },
      // As above: the maths parser eats the path separators in the source URL.
      math: false,
    }));
  }

  return children;
}

module.exports = {
  splitPassageBlocks,
  makePassageContent,
  makeImageContent,
  STIMULUS_IMAGE_TARGET_WIDTH,
};
