"use strict";

// RES-57. Page images for the question bank: the model-sized render each call
// sees, a local check for blank pages (so they cost nothing), and the
// high-resolution crops of each diagram. Moved from the RES-54 pilot script.

const sharp = require("sharp");
const { PDFParse } = require("pdf-parse");

// Claude downsizes any image whose long edge exceeds 1568px before it sees it,
// which would silently rescale every coordinate it returns. Sending the page at
// exactly that size keeps its boxes in our pixel space.
const MODEL_LONG_EDGE = 1568;
// Crops come from a separate, sharper render so they print cleanly (~290 dpi
// across an A4 page).
const CROP_RENDER_WIDTH = 2400;
const CROP_PADDING = 0.006;
// A page whose text layer has fewer non-space characters than this is treated
// as scanned, and its text isn't sent.
const TEXT_LAYER_MIN_CHARS = 200;
// Ink darker than this counts as a mark, for blank detection and crop clean-up.
const INK_THRESHOLD = 170;
// Below this share of inked pixels a page is blank. Scans of blank pages carry
// a little speckle, so it isn't zero.
const BLANK_INK_SHARE = 0.002;

async function withParser(pdfBuffer, fn) {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    return await fn(parser);
  } finally {
    await parser.destroy();
  }
}

async function pageCount(pdfBuffer) {
  return withParser(pdfBuffer, async (parser) => (await parser.getInfo()).total);
}

// Share of pixels darker than the ink threshold.
async function inkShare(image) {
  const { data } = await sharp(image).greyscale().raw().toBuffer({ resolveWithObject: true });
  let inked = 0;
  for (let i = 0; i < data.length; i++) if (data[i] < INK_THRESHOLD) inked++;
  return inked / data.length;
}

/**
 * Renders a page at the size the model sees. Returns the JPEG, its pixel size,
 * the page's own text when it has a usable text layer, and whether it is blank.
 */
async function renderModelPage(pdfBuffer, pageNumber) {
  return withParser(pdfBuffer, async (parser) => {
    const shot = await parser.getScreenshot({ partial: [pageNumber], desiredWidth: CROP_RENDER_WIDTH, imageBuffer: true });
    const text = await parser.getText({ partial: [pageNumber] });
    const image = await sharp(Buffer.from(shot.pages[0].data))
      .flatten({ background: "#ffffff" })
      .resize({ width: MODEL_LONG_EDGE, height: MODEL_LONG_EDGE, fit: "inside" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const { width, height } = await sharp(image).metadata();
    const pageText = (text.pages?.[0]?.text || "").trim();
    return {
      image,
      width,
      height,
      textLayer: pageText.replace(/\s+/g, "").length >= TEXT_LAYER_MIN_CHARS ? pageText : null,
      blank: (await inkShare(image)) < BLANK_INK_SHARE,
    };
  });
}

// A page's own text when it has a usable text layer, else null.
async function pageText(pdfBuffer, pageNumber) {
  return withParser(pdfBuffer, async (parser) => {
    const text = (await parser.getText({ partial: [pageNumber] })).pages?.[0]?.text?.trim() || "";
    return text.replace(/\s+/g, "").length >= TEXT_LAYER_MIN_CHARS ? text : null;
  });
}

async function renderHiResPage(pdfBuffer, pageNumber) {
  return withParser(pdfBuffer, async (parser) => {
    const shot = await parser.getScreenshot({ partial: [pageNumber], desiredWidth: CROP_RENDER_WIDTH, imageBuffer: true });
    return sharp(Buffer.from(shot.pages[0].data)).flatten({ background: "#ffffff" }).png().toBuffer();
  });
}

function clampBox(b, width, height) {
  const x0 = Math.max(0, Math.min(b.x0, b.x1));
  const y0 = Math.max(0, Math.min(b.y0, b.y1));
  const x1 = Math.min(width, Math.max(b.x0, b.x1));
  const y1 = Math.min(height, Math.max(b.y0, b.y1));
  return x1 - x0 < 4 || y1 - y0 < 4 ? null : { x0, y0, x1, y1 };
}

// A box that is right on the page can still clip the edge of a neighbouring
// question: its number, an answer line, half a caption. Those fragments are the
// ink touching the crop's border that lies outside the figure itself (the
// extent of the ink that does not touch the border), so they are whitened and
// the crop is trimmed to what is left.
async function cleanCrop(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const label = new Int32Array(width * height).fill(-1);
  const components = [];
  for (let start = 0; start < data.length; start++) {
    if (data[start] >= INK_THRESHOLD || label[start] !== -1) continue;
    const component = { pixels: 0, x0: width, y0: height, x1: 0, y1: 0, edge: false };
    const stack = [start];
    label[start] = components.length;
    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = (index - x) / width;
      component.pixels++;
      if (x < component.x0) component.x0 = x;
      if (x > component.x1) component.x1 = x;
      if (y < component.y0) component.y0 = y;
      if (y > component.y1) component.y1 = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) component.edge = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (label[next] === -1 && data[next] < INK_THRESHOLD) {
            label[next] = components.length;
            stack.push(next);
          }
        }
      }
    }
    components.push(component);
  }

  const inner = components.filter((c) => !c.edge && c.pixels > 4);
  if (!inner.length) return png;
  const extent = (list) => list.reduce((acc, c) => ({
    x0: Math.min(acc.x0, c.x0), y0: Math.min(acc.y0, c.y0), x1: Math.max(acc.x1, c.x1), y1: Math.max(acc.y1, c.y1),
  }), { x0: width, y0: height, x1: 0, y1: 0 });
  const core = extent(inner);
  const overlap = (c) =>
    Math.max(0, Math.min(c.x1, core.x1) - Math.max(c.x0, core.x0)) *
    Math.max(0, Math.min(c.y1, core.y1) - Math.max(c.y0, core.y0));
  // A neighbour's fragment is small; anything spanning half the crop or more
  // is the figure itself (a circle or axes drawn right up to a tight box).
  const small = (c) => c.x1 - c.x0 + 1 < width / 2 && c.y1 - c.y0 + 1 < height / 2;
  const stray = new Set(components.filter((c) => c.edge && small(c) && overlap(c) < 0.5 * (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)));
  if (!stray.size) return png;

  // Whiten each fragment's surroundings, not just its dark pixels: the
  // anti-aliased grey around a scanned glyph sits above the ink threshold and
  // would otherwise survive as a faint ghost. Only pixels belonging to a kept
  // component are spared.
  const rgb = await sharp(png).removeAlpha().raw().toBuffer();
  const keptLabels = new Set(components.map((c, i) => (stray.has(c) ? -1 : i)).filter((i) => i >= 0));
  for (const c of stray) {
    for (let y = Math.max(0, c.y0 - 3); y <= Math.min(height - 1, c.y1 + 3); y++) {
      for (let x = Math.max(0, c.x0 - 3); x <= Math.min(width - 1, c.x1 + 3); x++) {
        const index = y * width + x;
        if (!keptLabels.has(label[index])) rgb.fill(255, index * 3, index * 3 + 3);
      }
    }
  }
  const kept = extent(components.filter((c) => !stray.has(c)));
  const margin = Math.round(Math.min(width, height) * 0.03);
  const left = Math.max(0, kept.x0 - margin);
  const top = Math.max(0, kept.y0 - margin);
  const right = Math.min(width, kept.x1 + margin + 1);
  const bottom = Math.min(height, kept.y1 + margin + 1);
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
}

/**
 * Crops a box given in model-page pixels from the high-resolution render and
 * cleans it. `modelWidth` is the model page's width, to scale the box.
 */
async function cropFigure(hiRes, box, modelWidth) {
  const meta = await sharp(hiRes).metadata();
  const scale = meta.width / modelWidth;
  const pad = Math.round(meta.width * CROP_PADDING);
  const left = Math.max(0, Math.round(box.x0 * scale) - pad);
  const top = Math.max(0, Math.round(box.y0 * scale) - pad);
  const width = Math.min(meta.width - left, Math.round((box.x1 - box.x0) * scale) + 2 * pad);
  const height = Math.min(meta.height - top, Math.round((box.y1 - box.y0) * scale) + 2 * pad);
  const crop = await sharp(hiRes).extract({ left, top, width, height }).png().toBuffer();
  return cleanCrop(crop);
}

module.exports = {
  MODEL_LONG_EDGE,
  clampBox,
  cleanCrop,
  cropFigure,
  inkShare,
  pageCount,
  pageText,
  renderHiResPage,
  renderModelPage,
};
