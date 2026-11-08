"use strict";

const { AlignmentType, ImageRun, Paragraph } = require("docx");

const { BRAND } = require("./branding");
const { imageSourceLine, textSourceLine } = require("../stimulusIntegrity");
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
// RES-92. The passage as groups of paragraphs, one group per shaded-box row
// (makeShadedRows): the title, source line and opening block together, then one
// group per further paragraph or stanza. Nothing here carries keepNext. Inside
// a table cell LibreOffice reads keepNext as "keep this whole table with what
// follows", so a passage box longer than the rest of the page was pushed whole
// onto the next one, leaving the "Stimulus booklet" heading alone on its page.
// Keeping the title with the opening is the first row's job instead.
const SHORT_BLOCK_CHARS = 700;
function makePassageGroups({ label, title, author, source, licence, body, verbatim } = {}) {
  // A real public-domain text keeps its true author (the prompt requires
  // accurate attribution) and where it came from. Our own writing carries no
  // author at all, so it gets a plain "Tenacity Original" caption rather than
  // a byline (RES-100): crediting it by name was what led the model to tag its
  // own maths scenarios. A text that names where it came from is not ours to
  // call original, even when its author is unknown; there the source line
  // alone runs. See stimulusIntegrity.textSourceLine.
  const heading = [cleanText(label), cleanText(title)].filter(Boolean).join(": ");
  const attribution = textSourceLine({
    author: cleanText(author),
    source: cleanText(source),
    licence: cleanText(licence),
  });
  const blocks = splitPassageBlocks(body, verbatim ? { verbatim: true } : {});
  const hasBody = blocks.length > 0;

  const opening = [];
  if (heading) {
    opening.push(paragraph(heading, {
      bold: true,
      color: BRAND.NAVY,
      size: BRAND.FONT_SIZE_H3,
      spacing: { after: attribution || hasBody ? 60 : 0 },
    }));
  }
  if (attribution) {
    opening.push(paragraph(attribution, {
      italics: true,
      color: "555555",
      size: BRAND.FONT_SIZE_SMALL,
      spacing: { after: hasBody ? 160 : 0 },
      // A citation is not prose and must never go through the maths parser,
      // which reads "/" as a fraction and silently drops what surrounds it.
      // Wikisource source names carry slashes of their own — "The Complete
      // Poems and Fragments of Wilfred Owen/Dulce et Decorum Est" — so the
      // attribution would lose the very part naming the work.
      math: false,
    }));
  }
  const groups = blocks.map((lines, blockIndex) => {
    const lastBlock = blockIndex === blocks.length - 1;
    const group = lines.map((line, lineIndex) => {
      const lastLineOfBlock = lineIndex === lines.length - 1;
      // Tight spacing between lines of the same block (verse lines / wrapped
      // prose); a paragraph-sized gap between blocks; none after the last line.
      const after = !lastLineOfBlock ? 30 : lastBlock ? 0 : 160;
      return paragraph(line, {
        spacing: { after },
        ...(verbatim ? { math: false, verbatim: true } : {}),
      });
    });
    // A stanza or a short paragraph stays in one piece; a long paragraph may
    // break across a page like any prose.
    group.keepTogether = lines.join(" ").length <= SHORT_BLOCK_CHARS;
    return group;
  });
  if (groups.length) groups[0] = Object.assign([...opening, ...groups[0]], { keepTogether: true });
  else if (opening.length) groups.push(Object.assign(opening, { keepTogether: true }));
  return groups.length ? groups : [[paragraph("", { spacing: { after: 0 } })]];
}

// The same content as makePassageGroups, as one flat list of paragraphs.
function makePassageContent(args = {}) {
  return makePassageGroups(args).flat();
}

/**
 * Render one sourced visual stimulus: a heading, the image, then the credit
 * line.
 *
 * The credit is not decoration. Commons material is used under CC BY / CC BY-SA
 * or as public domain, and naming the creator, the licence and where the image
 * came from is what keeps a paid resource on the right side of those terms.
 * The canonical URL is deliberately not printed — it is kept on the job
 * document (sourceCanonicalUrls) for auditing, where a link is useful, rather
 * than on a page a student writes on, where it is only noise.
 *
 * An image with no usable bytes renders nothing at all, rather than a caption
 * describing a picture that is not there.
 */
function makeImageContent({ label, title, creator, date, licence, source, image } = {}) {
  if (!image?.buffer || !image.type) return [];

  // Every part of the block except the last carries keepNext, so the heading,
  // picture and credit stay on one page. Without it the heading strands
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

  // No instruction line sits under the image. What the student does with it is
  // the questions' job; a task here would either duplicate them or quietly
  // contradict them. The planner's task still travels with the stimulus so the
  // generator knows what the image is for when it writes those questions.
  const credit = imageSourceLine({
    creator: cleanText(creator),
    date: cleanText(date),
    licence: cleanText(licence),
    source: cleanText(source),
  });
  if (credit) {
    children.push(paragraph(credit, {
      italics: true,
      color: "555555",
      size: BRAND.FONT_SIZE_SMALL,
      spacing: { after: 0 },
      // As above: a credit is not prose. Source names carry slashes of their
      // own ("...Wilfred Owen/Dulce et Decorum Est"), which the maths parser
      // would read as a fraction and silently eat.
      math: false,
    }));
  }

  return children;
}

module.exports = {
  splitPassageBlocks,
  makePassageContent,
  makePassageGroups,
  makeImageContent,
  STIMULUS_IMAGE_TARGET_WIDTH,
};
