"use strict";

// RES-81. Places a question's diagram the way printed workbooks do.
//
// Side by side (the default): the question text sits on the left and the
// diagram top-right. Answer lines start directly under the text and run beside
// the diagram, then continue at full width once they are below it, so there is
// no blank band between a question and its working space. Parts (a), (b)...
// carry on in the left column while there is room beside the picture.
//
// Centred: a wide, flat diagram (or a question whose text contains a table) is
// centred under the text instead, with the answer lines straight below it.
//
// A block is a run of "items": text (question or part stems, options), which
// is re-rendered for the width it lands in, and ruled answer lines, which are
// finished paragraphs. Which items fit beside the diagram is worked out from
// estimated heights; the estimates err tall, so any slack ends up under the
// diagram rather than as a gap under the text.

const {
  AlignmentType,
  BorderStyle,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  VerticalAlign,
  WidthType,
} = require("docx");

const { PAGE } = require("./branding");
const { diagramImageRun, renderDiagramImage } = require("./diagrams");

const TWIPS_PER_CM = 567;
const PX_PER_CM = 96 / 2.54;

// The diagram column: at most 7 cm wide and 5 cm tall. Small crops are raised
// to 4.5 cm wide so their labels stay readable.
const SIDE_MAX_WIDTH_CM = 7;
const SIDE_MAX_HEIGHT_CM = 5;
const SIDE_MIN_WIDTH_CM = 4.5;
const COLUMN_GUTTER = Math.round(0.5 * TWIPS_PER_CM);
// Wider than this (width ÷ height), a diagram is centred: squeezed into the
// side column it would print too small to read.
const WIDE_ASPECT_RATIO = 1.9;
// A centred diagram keeps its natural size up to 9 × 6 cm.
const CENTRE_MAX_WIDTH_CM = 9;
const CENTRE_MAX_HEIGHT_CM = 6;
// Space above and below a centred diagram.
const DIAGRAM_GAP = 160;

// Height estimates for Calibri 11 pt body text, in twips.
const AVERAGE_CHAR_WIDTH = 0.13 * TWIPS_PER_CM;
const TEXT_LINE_HEIGHT = 0.47 * TWIPS_PER_CM;

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
  insideHorizontal: noBorder,
  insideVertical: noBorder,
};

// Text length as it prints: maths markup and markdown markers take no width.
function printedLength(text) {
  return String(text ?? "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}$^_*`\\]/g, "")
    .length;
}

function estimateTextHeight(text, width, { before = 0, after = 0, indent = 0, extraChars = 0 } = {}) {
  const usable = Math.max(TWIPS_PER_CM, width - indent);
  const lines = Math.max(1, Math.ceil(((printedLength(text) + extraChars) * AVERAGE_CHAR_WIDTH) / usable));
  return before + after + lines * TEXT_LINE_HEIGHT;
}

function textItem({ render, estimate, hasTable = false }) {
  return { kind: "text", render, estimate, hasTable };
}

function lineItems(paragraphs, lineHeight) {
  return paragraphs.map((paragraph) => ({ kind: "line", paragraph, estimate: () => lineHeight }));
}

function renderItems(items, width) {
  return items.flatMap((item) => (item.kind === "line" ? [item.paragraph] : item.render(width)));
}

function fitSize(image, maxWidth, maxHeight, minWidth) {
  const aspect = image.width / image.height;
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  if (width < minWidth) {
    width = minWidth;
    height = width / aspect;
  }
  return { width, height };
}

// The printed size of a diagram in the side column, in pixels: its natural
// size, shrunk to fit the column and raised to the minimum width.
// The height limit always wins: a tall, narrow crop is raised only as far as
// the column height allows, never to the full minimum width.
function sideColumnSize(image) {
  const maxHeight = SIDE_MAX_HEIGHT_CM * PX_PER_CM;
  const minWidth = Math.min(SIDE_MIN_WIDTH_CM * PX_PER_CM, maxHeight * (image.width / image.height));
  return fitSize(
    image,
    Math.min(image.width, SIDE_MAX_WIDTH_CM * PX_PER_CM),
    Math.min(image.height, maxHeight),
    minWidth
  );
}

function placement(image, lead) {
  if (lead.some((item) => item.hasTable)) return "centred";
  return image.width / image.height >= WIDE_ASPECT_RATIO ? "centred" : "side";
}

// How many items go in the left column: always the lead (the stem and any
// options), then answer lines and later parts until the column is at least as
// tall as the diagram. The column never ends on a part's text, or that part's
// lines would start below the diagram, and it stops before a part whose text
// holds a table: tables are sized to the full text width.
function columnCount(lead, follow, width, target) {
  const items = [...lead, ...follow];
  let used = 0;
  let count = 0;
  while (count < items.length && (count < lead.length || (used < target && !items[count].hasTable))) {
    used += items[count].estimate(width);
    count += 1;
  }
  while (count > lead.length && items[count - 1].kind === "text") count -= 1;
  return count;
}

function sideBySide(image, lead, follow, alignBefore) {
  const size = sideColumnSize(image);
  const imageWidth = Math.round((size.width / PX_PER_CM) * TWIPS_PER_CM);
  const imageHeight = Math.round((size.height / PX_PER_CM) * TWIPS_PER_CM);
  const textWidth = PAGE.CONTENT_WIDTH - imageWidth - COLUMN_GUTTER;
  const items = [...lead, ...follow];
  const count = columnCount(lead, follow, textWidth, alignBefore + imageHeight);

  const row = new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        width: { size: textWidth + COLUMN_GUTTER, type: WidthType.DXA },
        borders: noBorders,
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 0, bottom: 0, left: 0, right: COLUMN_GUTTER },
        children: renderItems(items.slice(0, count), textWidth),
      }),
      new TableCell({
        width: { size: imageWidth, type: WidthType.DXA },
        borders: noBorders,
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            keepNext: true,
            // Level with the first line of the question text.
            spacing: { before: alignBefore, after: 0 },
            children: [diagramImageRun(image, size)],
          }),
        ],
      }),
    ],
  });

  return [
    new Table({
      width: { size: PAGE.CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [textWidth + COLUMN_GUTTER, imageWidth],
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: [row],
    }),
    ...renderItems(items.slice(count), PAGE.CONTENT_WIDTH),
  ];
}

function centredSize(image) {
  return fitSize(
    image,
    Math.min(image.width, CENTRE_MAX_WIDTH_CM * PX_PER_CM),
    Math.min(image.height, CENTRE_MAX_HEIGHT_CM * PX_PER_CM),
    0
  );
}

function centred(image, lead, follow) {
  return [
    ...renderItems(lead, PAGE.CONTENT_WIDTH),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: DIAGRAM_GAP, after: DIAGRAM_GAP },
      children: [diagramImageRun(image, centredSize(image))],
    }),
    ...renderItems(follow, PAGE.CONTENT_WIDTH),
  ];
}

// Lays out one block: lead items (the stem the diagram belongs to), its
// diagram, and the items that follow (answer lines, later parts).
async function layoutDiagramBlock({ lead, follow, diagram, context, alignBefore }) {
  const resolved = await renderDiagramImage(diagram, context);
  if (!resolved) return renderItems([...lead, ...follow], PAGE.CONTENT_WIDTH);
  if (resolved.blocks) {
    return [
      ...renderItems(lead, PAGE.CONTENT_WIDTH),
      ...resolved.blocks,
      ...renderItems(follow, PAGE.CONTENT_WIDTH),
    ];
  }
  return placement(resolved.image, lead) === "side"
    ? sideBySide(resolved.image, lead, follow, alignBefore)
    : centred(resolved.image, lead, follow);
}

module.exports = {
  CENTRE_MAX_WIDTH_CM,
  SIDE_MAX_HEIGHT_CM,
  SIDE_MAX_WIDTH_CM,
  SIDE_MIN_WIDTH_CM,
  WIDE_ASPECT_RATIO,
  centredSize,
  estimateTextHeight,
  layoutDiagramBlock,
  lineItems,
  renderItems,
  sideColumnSize,
  textItem,
};
