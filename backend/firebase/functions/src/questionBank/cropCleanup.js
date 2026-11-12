"use strict";

// RES-107. Cleaning bank diagram crops so they print in black, white and grey
// with every label kept: what is wrong with a crop (one cheap model call), what
// to do about it, the image work itself, and a second call that checks the
// cleaned crop against the original. Nothing here reads or writes Firestore or
// Storage.

const sharp = require("sharp");

const { buildAnthropicSystemParam } = require("../resources/apiClient");
const { QUESTION_BANK_MODEL } = require("./prompts");

const CLASSIFY_MAX_TOKENS = 4000;
const VERIFY_MAX_TOKENS = 4000;
// Claude downsizes anything longer than this, which would rescale the boxes it
// returns, so crops are sent at no more than this size (see pages.js).
const MODEL_LONG_EDGE = 1568;

const WHITE_MIN = 240;
// How close a pixel must be to the page tint to count as background. Connected
// to the crop's edge it can be looser; an enclosed area has to match closely,
// because a pale shaded region can sit very near the tint.
const EDGE_TOLERANCE = 14;
const ENCLOSED_TOLERANCE = 8;
// The tint has to be most of the crop's border, or there is no page tint.
const MIN_BORDER_SHARE = 0.4;
// Enclosed tint below this share of the crop is the inside of a letter or a
// small gap, never a region that means something.
const SMALL_ENCLOSED_SHARE = 0.004;
const HALO_RADIUS = 2;
// A stray mark is small and near the crop's edge; a box that isn't was probably
// drawn around part of the diagram.
const MAX_STRAY_AREA = 0.35;
const MAX_STRAY_EDGE_DISTANCE = 0.12;
// Any pixel darker than this belongs to a shape, so a shape's soft edge goes
// with it and leaves no ghost.
const INK_MAX = 245;
const MIN_WHITE_BORDER = 0.7;
// Colours this close are one region of the drawing.
const REGION_TOLERANCE = 40;
// A region must be at least this share of the crop to be a filled area.
const MIN_FILL_SHARE = 0.002;
const LARGE_FILL_SHARE = 0.006;
// Average half-thickness, in pixels and against the region's own size, that
// separates a filled area from a line or a letter.
const MIN_FILL_THICKNESS = 7;
const FILL_THICKNESS_OF_CROP = 0.012;
const FILL_THICKNESS_OF_SELF = 0.22;
const LARGE_FILL_THICKNESS_OF_SELF = 0.1;
const MIN_FILL_LUMINANCE = 25;
// Fills differing by less than this share one grey.
const SAME_FILL_LUMINANCE = 12;
const FILL_GREY_DARKEST = 150;
const FILL_GREY_LIGHTEST = 235;
const SINGLE_FILL_GREY = 215;
const GRIDLINE_GREY = 195;
const GRIDLINE_MIN_LUMINANCE = 175;
const GRIDLINE_MAX_SATURATION = 130;
const MATCHES_FILL = 45;
const NEUTRAL_SATURATION = 40;
const WHITE_REGION_MIN = 225;
const WHITE_BOX_DENSITY = 0.55;
const WHITE_BOX_MIN_SIZE = 80;
const KEY_DENSITY = 0.75;
const KEY_MIN_SIZE = 8;
const KEY_MAX_ASPECT = 2.5;
const SOFT_EDGE_COLOUR_SPREAD = 0.2;
const LIGHT_INK_LUMINANCE = 200;
// A white shape this long against the crop is a frame or a panel, not writing.
const FRAME_MIN_SPAN = 0.3;
// Edge pixels per unit of size above which a frame-sized shape is a grid.
const FRAME_MAX_EDGE_RATIO = 7;
// A grid has at least this many rows or columns its line runs most of the way across.
const GRID_MIN_LINES = 3;
const GRID_LINE_COVERAGE = 0.6;
// Lines this close to the edge of the region's box (as a share of it) do not count.
const GRID_INNER_MARGIN = 0.1;
// A grid has far more line than an outline of the same size.
const GRID_EDGE_RATIO = 10;
const GRID_MIN_SPAN = 0.15;
const GRID_MIN_LUMINANCE = 130;
// Share of a crop's drawing that changes gradually. Above this it is shaded
// like a photo, and flat tones would break it into bands. Measured on the
// RES-107 test set: shaded pictures score 0.18 and up, flat drawings below 0.15.
const SMOOTH_SHADING_SHARE = 0.15;
const COLOUR_WORD = /\b(?:red|blue|green|yellow|orange|purple|violet|pink|brown|colou?red|colou?rs?)\b/i;
const SHADING_MATTERS = new Set(["region_inequality", "probability_diagram", "calculus_graph", "normal_curve"]);

const SYSTEM_PROMPT = "You check diagrams cropped from school maths textbooks, exam papers and slides before they are reprinted on clean white worksheets. You are precise and report only what you can see.";

const box = {
  type: "object",
  additionalProperties: false,
  required: ["x0", "y0", "x1", "y1"],
  properties: { x0: { type: "integer" }, y0: { type: "integer" }, x1: { type: "integer" }, y1: { type: "integer" } },
};

const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["background", "questionNamesColour", "strayItems", "handwriting", "wrongSymbols", "usable", "note"],
  properties: {
    background: { type: "string", enum: ["white", "page_tint", "photo_or_texture", "other"] },
    questionNamesColour: { type: "boolean" },
    strayItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "box"],
        properties: {
          kind: { type: "string", enum: ["part_letter", "cut_off_text", "neighbouring_question", "slide_text", "other"] },
          text: { type: "string" },
          box,
        },
      },
    },
    handwriting: { type: "boolean" },
    wrongSymbols: { type: "boolean" },
    usable: { type: "boolean" },
    note: { type: "string" },
  },
};

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["missingLabels", "missingShapes", "unreadableLabels", "wronglyFilled", "mergedRegions", "wrongSymbols"],
  properties: {
    missingLabels: { type: "array", items: { type: "string" } },
    missingShapes: { type: "array", items: { type: "string" } },
    unreadableLabels: { type: "array", items: { type: "string" } },
    wronglyFilled: { type: "array", items: { type: "string" } },
    mergedRegions: { type: "array", items: { type: "string" } },
    wrongSymbols: { type: "boolean" },
  },
};

function classifyPrompt({ width, height, description, questionText }) {
  return `This image is a diagram cropped from a maths resource, ${width} x ${height} pixels. It will be reprinted in black, white and grey on a white worksheet.

What the diagram should show: ${description || "not recorded"}
The question it belongs to: ${questionText || "not recorded"}

Report:
- background: "white"; "page_tint" for one flat page colour behind the diagram; "photo_or_texture" for a photo or textured slide background; "other" for anything else.
- questionNamesColour: the question text points at a colour in the diagram, such as "the red line" or "the shaded blue region", so it would not make sense in black and white. Colours of objects in a story, such as red marbles, are false.
- strayItems: each separate thing that is clearly NOT part of the diagram, with its text and a tight pixel box: a question or part letter such as "c" or "(b)" beside the diagram; cut-off text from the page; part of a neighbouring question; slide sentences explaining the diagram. Never list the diagram's own labels, measurements, axis labels, legends, titles or vertex letters. If in any doubt, leave it out. Most diagrams have none.
- handwriting: any handwriting or hand-drawn marks on the diagram.
- wrongSymbols: a symbol that is clearly wrong for the maths, such as the Greek letter xi where the variable x belongs.
- usable: false only if the diagram itself is unreadable, mostly cut off, or is a photo or screenshot rather than a drawn diagram.
- note: at most ten words, only if something is unusual.`;
}

function verifyPrompt({ description, removed }) {
  return `The first image is an original diagram crop. The second is the same diagram cleaned for a black-and-white worksheet. A white background, and colours becoming black or grey, are intended and are not problems.

What the diagram should show: ${description || "not recorded"}
Removed on purpose, so do not report these: ${removed?.length ? removed.join("; ") : "nothing"}. Sentences or text outside the diagram may also have gone.

Look only at the diagram itself. Each list must be empty unless you can name something specific:
- missingLabels: each number, measurement, letter or axis label in the first diagram that is absent from the second.
- missingShapes: each line, face, shaded region or other part of the drawing in the first that is absent from the second.
- unreadableLabels: each label in the second that is too pale to read against its background.
- wronglyFilled: each area solid black or very dark in the second that was an outline, a gap or a lighter area in the first, such as a filled-in right-angle box, or a digit with its inside filled in.
- mergedRegions: each pair of regions clearly different in the first that can no longer be told apart in the second.
- wrongSymbols: a symbol in the second is clearly wrong for the maths, such as the Greek letter xi where x belongs.`;
}

async function modelImage(png) {
  const { data, info } = await sharp(png)
    .flatten({ background: "#ffffff" })
    .resize({ width: MODEL_LONG_EDGE, height: MODEL_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { image: data, width: info.width, height: info.height };
}

const imageBlock = (png) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } });

function baseParams({ maxTokens, schema, content, model, effort = "medium" }) {
  return {
    model,
    max_tokens: maxTokens,
    system: buildAnthropicSystemParam({ systemPrompt: SYSTEM_PROMPT }),
    messages: [{ role: "user", content }],
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema } },
  };
}

function buildClassifyParams({ image, width, height, description, questionText, model = QUESTION_BANK_MODEL }) {
  return baseParams({
    model,
    maxTokens: CLASSIFY_MAX_TOKENS,
    schema: CLASSIFY_SCHEMA,
    content: [imageBlock(image), { type: "text", text: classifyPrompt({ width, height, description, questionText }) }],
  });
}

function buildVerifyParams({ before, after, description, removed, model = QUESTION_BANK_MODEL }) {
  return baseParams({
    model,
    maxTokens: VERIFY_MAX_TOKENS,
    schema: VERIFY_SCHEMA,
    content: [imageBlock(before), imageBlock(after), { type: "text", text: verifyPrompt({ description, removed }) }],
  });
}

/**
 * What to do with a crop, given the model's report. `steps` run in order;
 * `hide` means the crop can't be saved and no steps apply.
 */
function planCleanup(report, { extension = "pdf", hasColour = false, questionText = "" } = {}) {
  const hide = (reason) => ({ outcome: "hide", reason, steps: [] });
  if (!report.usable) return hide("unusable");
  if (report.handwriting) return hide("handwriting");
  // Re-rendering restores the slide but draws the same equation image, so a
  // wrong symbol survives it.
  if (report.wrongSymbols) return hide("wrong_symbols");
  // The model over-reports this, so the question has to actually say a colour,
  // and the crop has to have colour that greying would take away.
  if (report.questionNamesColour && hasColour && COLOUR_WORD.test(questionText)) return hide("names_colour");
  const slides = ["pps", "ppt", "pptx"].includes(extension);
  const steps = [];
  if (report.background === "photo_or_texture") {
    // Without a source slide, try lifting it: most are textbook gradients, and
    // anything left behind fails verify and leaves the crop as it was.
    steps.push(slides ? "rerender" : "untint");
  } else if (report.background === "page_tint") {
    steps.push("untint");
  } else if (report.background === "other") {
    // Worth trying: anything left behind is caught by backgroundLeft.
    steps.push(slides ? "rerender" : "untint");
  }
  if (report.strayItems?.length) steps.push("erase");
  // A re-render comes out grey already.
  if (hasColour && !steps.includes("rerender")) steps.push("grey");
  return steps.length ? { outcome: "clean", reason: steps.join("+"), steps } : { outcome: "keep", reason: "already_clean", steps };
}

async function rawRgb(png) {
  return sharp(png).flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

// The commonest colour around the crop's border and its share of the border.
function borderColour(data, width, height) {
  const counts = new Map();
  let total = 0;
  const add = (x, y) => {
    const i = (y * width + x) * 3;
    const key = ((data[i] >> 2) << 12) | ((data[i + 1] >> 2) << 6) | (data[i + 2] >> 2);
    const entry = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    entry.n++;
    entry.r += data[i];
    entry.g += data[i + 1];
    entry.b += data[i + 2];
    counts.set(key, entry);
    total++;
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
  let best = null;
  for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry;
  return { colour: [best.r / best.n, best.g / best.n, best.b / best.n], share: best.n / total };
}

/**
 * Turns a flat page tint white. Tint connected to the crop's edge goes, along
 * with enclosed areas of the same colour, except that where `diagramType` is
 * one whose shading matters only small enclosed gaps go. Returns the original
 * buffer with `changed: false` if there is no uniform tint to remove.
 */
async function removePageTint(png, { diagramType = "" } = {}) {
  const { data, info } = await rawRgb(png);
  const { width, height } = info;
  const { colour, share } = borderColour(data, width, height);
  if (share < MIN_BORDER_SHARE) return { image: png, changed: false, reason: "no_uniform_border" };
  if (Math.min(...colour) >= WHITE_MIN) return { image: png, changed: false, reason: "already_white" };

  const count = width * height;
  const distance = (p) => Math.max(Math.abs(data[p * 3] - colour[0]), Math.abs(data[p * 3 + 1] - colour[1]), Math.abs(data[p * 3 + 2] - colour[2]));
  const background = new Uint8Array(count);
  const stack = [];
  const seed = (p) => { if (!background[p] && distance(p) <= EDGE_TOLERANCE) { background[p] = 1; stack.push(p); } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  const flood = (mark, tolerance, list) => {
    while (list.length) {
      const p = list.pop();
      const x = p % width;
      for (const n of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (n < 0 || n >= count || mark[n] || distance(n) > tolerance) continue;
        mark[n] = 1;
        list.push(n);
      }
    }
  };
  flood(background, EDGE_TOLERANCE, stack);

  const keepLarge = SHADING_MATTERS.has(diagramType);
  const smallLimit = count * SMALL_ENCLOSED_SHARE;
  const visited = new Uint8Array(count);
  for (let start = 0; start < count; start++) {
    if (background[start] || visited[start] || distance(start) > ENCLOSED_TOLERANCE) continue;
    const region = [start];
    const queue = [start];
    visited[start] = 1;
    while (queue.length) {
      const p = queue.pop();
      const x = p % width;
      for (const n of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (n < 0 || n >= count || visited[n] || background[n] || distance(n) > ENCLOSED_TOLERANCE) continue;
        visited[n] = 1;
        region.push(n);
        queue.push(n);
      }
    }
    if (!keepLarge || region.length <= smallLimit) for (const p of region) background[p] = 1;
  }

  // Anti-aliased ink is a blend of ink and tint. Dividing out the tint next to
  // the removed area leaves a clean edge rather than a coloured halo.
  const out = Buffer.from(data);
  for (let p = 0; p < count; p++) {
    if (background[p]) {
      out.fill(255, p * 3, p * 3 + 3);
      continue;
    }
    const x = p % width;
    const y = (p - x) / width;
    let near = false;
    for (let dy = -HALO_RADIUS; dy <= HALO_RADIUS && !near; dy++) {
      for (let dx = -HALO_RADIUS; dx <= HALO_RADIUS && !near; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && background[ny * width + nx]) near = true;
      }
    }
    if (!near) continue;
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.min(255, Math.round((data[p * 3 + c] / Math.max(colour[c], 1)) * 255));
  }
  const image = await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { image, changed: true, reason: "removed" };
}

// Groups pixels for which `isInk` holds into 8-connected shapes.
function inkComponents(width, height, isInk) {
  const count = width * height;
  const label = new Int32Array(count).fill(-1);
  const components = [];
  for (let start = 0; start < count; start++) {
    if (label[start] !== -1 || !isInk(start)) continue;
    const id = components.length;
    const component = { id, pixels: [], x0: width, y0: height, x1: 0, y1: 0 };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      component.pixels.push(p);
      if (x < component.x0) component.x0 = x;
      if (x > component.x1) component.x1 = x;
      if (y < component.y0) component.y0 = y;
      if (y > component.y1) component.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (label[n] === -1 && isInk(n)) {
            label[n] = id;
            stack.push(n);
          }
        }
      }
    }
    components.push(component);
  }
  return components;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Why a reported stray item shouldn't be erased, or null if it is safe to.
function strayRejection(item, box, width, height, description) {
  const boxArea = (box.x1 - box.x0) * (box.y1 - box.y0);
  if (boxArea > MAX_STRAY_AREA * width * height) return "too_large";
  const fromEdge = Math.min(box.x0 / width, box.y0 / height, (width - box.x1) / width, (height - box.y1) / height);
  if (fromEdge > MAX_STRAY_EDGE_DISTANCE) return "not_near_edge";
  for (const number of item.text.match(/\d+(?:\.\d+)?/g) || []) {
    if (new RegExp(`(^|[^\\d.])${escapeRegExp(number)}($|[^\\d])`).test(description)) return "matches_diagram_number";
  }
  if (item.kind === "part_letter") {
    const letter = item.text.replace(/[().\s]/g, "");
    if (letter.length !== 1 && !/^[ivx]+$/.test(letter)) return "not_a_part_letter";
    const named = new RegExp(`\\$[^$]*\\b${escapeRegExp(letter)}\\b[^$]*\\$|label(?:l?ed)?\\s+['"]?${escapeRegExp(letter)}\\b`);
    if (named.test(description)) return "matches_diagram_label";
  }
  return null;
}

/**
 * Erases only what the model named as stray, and only shapes wholly inside
 * those boxes, so a line crossing a box survives. A box that looks wrong is
 * ignored: a missed stray mark is harmless, a lost label is not. Then trims to
 * what is left.
 */
async function eraseStrayItems(png, items, modelSize, { description = "" } = {}) {
  const { data, info } = await rawRgb(png);
  const { width, height } = info;
  const scaleX = width / modelSize.width;
  const scaleY = height / modelSize.height;
  const pad = Math.round(Math.min(width, height) * 0.015);
  const accepted = [];
  const rejected = [];
  for (const item of items) {
    const box = {
      x0: Math.max(0, Math.min(item.box.x0, item.box.x1) * scaleX - pad),
      y0: Math.max(0, Math.min(item.box.y0, item.box.y1) * scaleY - pad),
      x1: Math.min(width, Math.max(item.box.x0, item.box.x1) * scaleX + pad),
      y1: Math.min(height, Math.max(item.box.y0, item.box.y1) * scaleY + pad),
    };
    const reason = strayRejection(item, box, width, height, description);
    if (reason) rejected.push({ text: item.text, reason });
    else accepted.push({ text: item.text, box });
  }
  if (!accepted.length) return { image: png, changed: false, reason: "nothing_safe", erased: [], rejected };

  const isInk = (p) => Math.min(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]) < INK_MAX;
  const components = inkComponents(width, height, isInk);
  const inside = (c, b) => c.x0 >= b.x0 && c.y0 >= b.y0 && c.x1 <= b.x1 && c.y1 <= b.y1;
  const stray = new Set();
  const erased = new Set();
  for (const c of components) {
    const hit = accepted.find((a) => inside(c, a.box));
    if (hit) {
      stray.add(c.id);
      erased.add(hit.text);
    }
  }
  const kept = components.filter((c) => !stray.has(c.id) && c.pixels.length > 4);
  if (!stray.size || !kept.length) return { image: png, changed: false, reason: "nothing_safe", erased: [], rejected };

  const out = Buffer.from(data);
  for (const c of components) if (stray.has(c.id)) for (const p of c.pixels) out.fill(255, p * 3, p * 3 + 3);
  const margin = Math.round(Math.min(width, height) * 0.03);
  const left = Math.max(0, Math.min(...kept.map((c) => c.x0)) - margin);
  const top = Math.max(0, Math.min(...kept.map((c) => c.y0)) - margin);
  const right = Math.min(width, Math.max(...kept.map((c) => c.x1)) + margin + 1);
  const bottom = Math.min(height, Math.max(...kept.map((c) => c.y1)) + margin + 1);
  const image = await sharp(out, { raw: { width, height, channels: 3 } })
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
  return { image, changed: true, reason: "erased", erased: [...erased], rejected };
}

/**
 * What is really drawn, from one slide rendered on white and on black: a pixel
 * the same in both is solid, one that follows the background is see-through.
 * This is what recovers white text, which is invisible on white alone.
 */
async function matteFromRenders(onWhitePng, onBlackPng) {
  const white = await rawRgb(onWhitePng);
  const black = await rawRgb(onBlackPng);
  const { width, height } = white.info;
  if (black.info.width !== width || black.info.height !== height) throw new Error("The two renders are different sizes");
  const count = width * height;
  const alpha = new Float32Array(count);
  const colour = Buffer.alloc(count * 3);
  for (let p = 0; p < count; p++) {
    let difference = 0;
    for (let k = 0; k < 3; k++) difference += white.data[p * 3 + k] - black.data[p * 3 + k];
    const a = Math.min(1, Math.max(0, 1 - difference / 3 / 255));
    alpha[p] = a;
    for (let k = 0; k < 3; k++) colour[p * 3 + k] = a > 0.02 ? Math.min(255, Math.round(black.data[p * 3 + k] / a)) : 255;
  }
  return { colour, alpha, width, height };
}

// Splits the solid pixels into regions of one colour, with the measures used to
// tell a filled area from a line or a letter.
function colourRegions({ colour, alpha, width, height }) {
  const count = width * height;
  const label = new Int32Array(count).fill(-1);
  const regions = [];
  const distance = (p, q) => Math.max(Math.abs(colour[p * 3] - colour[q * 3]), Math.abs(colour[p * 3 + 1] - colour[q * 3 + 1]), Math.abs(colour[p * 3 + 2] - colour[q * 3 + 2]));
  for (let start = 0; start < count; start++) {
    if (label[start] !== -1 || alpha[start] < 0.5) continue;
    const id = regions.length;
    const region = { pixels: 0, x0: width, y0: height, x1: 0, y1: 0, sum: [0, 0, 0], edge: 0, touchesBackground: false };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      region.pixels++;
      for (let k = 0; k < 3; k++) region.sum[k] += colour[p * 3 + k];
      if (x < region.x0) region.x0 = x;
      if (x > region.x1) region.x1 = x;
      if (y < region.y0) region.y0 = y;
      if (y > region.y1) region.y1 = y;
      let onEdge = false;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q < 0 || q >= count) { onEdge = true; continue; }
        if (alpha[q] < 0.5) { region.touchesBackground = true; onEdge = true; continue; }
        if (label[q] === id) continue;
        if (distance(start, q) > REGION_TOLERANCE) { onEdge = true; continue; }
        if (label[q] === -1) { label[q] = id; stack.push(q); }
      }
      if (onEdge) region.edge++;
    }
    regions.push(region);
  }
  const smallest = Math.min(width, height);
  for (const r of regions) {
    r.width = r.x1 - r.x0 + 1;
    r.height = r.y1 - r.y0 + 1;
    r.colour = r.sum.map((v) => v / r.pixels);
    r.luminance = 0.299 * r.colour[0] + 0.587 * r.colour[1] + 0.114 * r.colour[2];
    r.low = Math.min(...r.colour);
    r.saturation = Math.max(...r.colour) - r.low;
    const thickness = (2 * r.pixels) / Math.max(r.edge, 1);
    const own = Math.min(r.width, r.height);
    r.isFill = r.pixels > count * MIN_FILL_SHARE
      && thickness > Math.max(MIN_FILL_THICKNESS, smallest * FILL_THICKNESS_OF_CROP)
      && (thickness > FILL_THICKNESS_OF_SELF * own || (r.pixels > count * LARGE_FILL_SHARE && thickness > LARGE_FILL_THICKNESS_OF_SELF * own))
      && r.luminance > MIN_FILL_LUMINANCE;
  }
  return { label, regions };
}

// Spreads the filled areas evenly over light greys, darkest colour darkest.
function assignFillGreys(fills) {
  const groups = [];
  for (const fill of [...fills].sort((a, b) => a.luminance - b.luminance)) {
    const last = groups[groups.length - 1];
    if (last && fill.luminance - last.luminance < SAME_FILL_LUMINANCE) fill.group = last;
    else {
      fill.group = { luminance: fill.luminance };
      groups.push(fill.group);
    }
  }
  groups.forEach((group, i) => {
    group.grey = groups.length === 1 ? SINGLE_FILL_GREY : Math.round(FILL_GREY_DARKEST + (i / (groups.length - 1)) * (FILL_GREY_LIGHTEST - FILL_GREY_DARKEST));
  });
}

/**
 * For each region big enough to be a grid or frame, how many rows and columns
 * it covers most of the way across its own box.
 */
function countStraightLines(regions, label, width, height) {
  const count = width * height;
  const candidates = new Set();
  regions.forEach((r, id) => {
    r.straightLines = 0;
    if (!r.isFill && r.pixels > count * MIN_FILL_SHARE) candidates.add(id);
  });
  if (!candidates.size) return;
  const rows = new Map([...candidates].map((id) => [id, new Uint32Array(height)]));
  const cols = new Map([...candidates].map((id) => [id, new Uint32Array(width)]));
  for (let p = 0; p < count; p++) {
    const id = label[p];
    if (!candidates.has(id)) continue;
    const x = p % width;
    rows.get(id)[(p - x) / width]++;
    cols.get(id)[x]++;
  }
  // Runs of full rows (or columns) well inside the region's box: a textured
  // border band only has them near its edges.
  const inner = (counts, from, to, span) => {
    const margin = GRID_INNER_MARGIN * (to - from);
    let lines = 0;
    let start = -1;
    for (let i = from; i <= to + 1; i++) {
      const isFull = i <= to && counts[i] >= GRID_LINE_COVERAGE * span;
      if (isFull && start < 0) start = i;
      if (!isFull && start >= 0) {
        if (start > from + margin && i - 1 < to - margin) lines++;
        start = -1;
      }
    }
    return lines;
  };
  for (const id of candidates) {
    const r = regions[id];
    r.straightLines = inner(rows.get(id), r.y0, r.y1, r.width) + inner(cols.get(id), r.x0, r.x1, r.height);
  }
}

// How one small region should print, given the filled areas around it.
function toneOfDetail(region, fills, lightInk, count, smallest) {
  const near = (fill) => Math.max(...region.colour.map((v, k) => Math.abs(v - fill.colour[k]))) <= MATCHES_FILL;
  const within = (fill) => region.x0 >= fill.x0 - 3 && region.y0 >= fill.y0 - 3 && region.x1 <= fill.x1 + 3 && region.y1 <= fill.y1 + 3;
  if (!region.touchesBackground) {
    // The colour of the fill around it: the inside of a right-angle box or a digit.
    const enclosing = fills.find((fill) => near(fill) && within(fill));
    if (enclosing) return { grey: enclosing.group.grey };
    const around = fills.filter(within).sort((a, b) => a.pixels - b.pixels)[0];
    // White on a coloured fill is writing. White elsewhere is a gap.
    if (region.low >= WHITE_REGION_MIN) return { grey: around ? 0 : 255 };
    if (around && region.pixels < count * MIN_FILL_SHARE && region.luminance < around.luminance) {
      const ratios = region.colour.map((v, k) => v / Math.max(around.colour[k], 1));
      if (Math.max(...ratios) - Math.min(...ratios) < SOFT_EDGE_COLOUR_SPREAD) return { blendWith: around };
    }
  }
  const density = region.pixels / (region.width * region.height);
  const longest = Math.max(region.width, region.height);
  const shortest = Math.min(region.width, region.height);
  // A legend key: same grey as the area it describes.
  if (density > KEY_DENSITY && shortest >= KEY_MIN_SIZE && longest / shortest < KEY_MAX_ASPECT) {
    const described = fills.find(near);
    if (described) return { grey: described.group.grey };
  }
  if (region.low >= WHITE_REGION_MIN && density > WHITE_BOX_DENSITY && longest > WHITE_BOX_MIN_SIZE) return { grey: 255 };
  // A frame is one loop of line, about four edge pixels per unit of its size; a
  // grid is many lines, so far more. A pale grid must not be taken for a frame.
  const edgeRatio = region.edge / (region.width + region.height);
  const isFrame = region.pixels > count * MIN_FILL_SHARE && longest > FRAME_MIN_SPAN * smallest;
  // Speckled texture has as much edge as a grid, but no long straight lines.
  const isGrid = region.straightLines >= GRID_MIN_LINES
    && ((edgeRatio > GRID_EDGE_RATIO && shortest > GRID_MIN_SPAN * smallest) || (isFrame && edgeRatio > FRAME_MAX_EDGE_RATIO));
  if (isFrame && !isGrid && region.luminance > LIGHT_INK_LUMINANCE && region.saturation < NEUTRAL_SATURATION) return { grey: 255 };
  if (isGrid && region.luminance > GRID_MIN_LUMINANCE && region.saturation < GRIDLINE_MAX_SATURATION) {
    return { grey: Math.min(GRIDLINE_GREY, Math.round(region.luminance)) };
  }
  if (region.saturation < NEUTRAL_SATURATION) return { neutral: true, lightInk };
  if (region.luminance > GRIDLINE_MIN_LUMINANCE && region.saturation < GRIDLINE_MAX_SATURATION) return { grey: GRIDLINE_GREY };
  return { grey: 0 };
}

/**
 * Prints a drawing in black, white and grey: lines and writing black, filled
 * areas distinct light greys, gridlines pale. `lightInk` says white writing is
 * real (a slide made for a dark background) and must turn black.
 */
function toneToGrey({ colour, alpha, width, height }, { lightInk = false } = {}) {
  const count = width * height;
  const { label, regions } = colourRegions({ colour, alpha, width, height });
  const fills = regions.filter((r) => r.isFill && r.low < 235);
  assignFillGreys(fills);
  countStraightLines(regions, label, width, height);
  for (const region of regions) if (!region.isFill) region.tone = toneOfDetail(region, fills, lightInk, count, Math.min(width, height));
  const luminance = (p) => 0.299 * colour[p * 3] + 0.587 * colour[p * 3 + 1] + 0.114 * colour[p * 3 + 2];
  const toneAt = (p) => {
    const region = regions[label[p]];
    if (region.isFill) return region.low >= 235 ? 255 : region.group.grey;
    const { grey, blendWith, neutral } = region.tone;
    if (blendWith) return Math.min(1, luminance(p) / blendWith.luminance) * blendWith.group.grey;
    if (neutral) return region.touchesBackground && lightInk && luminance(p) > LIGHT_INK_LUMINANCE ? 0 : luminance(p);
    return grey;
  };
  const out = Buffer.alloc(count * 3, 255);
  for (let p = 0; p < count; p++) {
    const a = alpha[p];
    const v = label[p] >= 0 ? Math.round(a * toneAt(p) + (1 - a) * 255) : a > 0.04 ? Math.round(255 - a * 255) : 255;
    out.fill(v, p * 3, p * 3 + 3);
  }
  return sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

// Whether much of the drawing changes gradually, like a shaded sphere or a photo.
function isSmoothlyShaded(data, width, height) {
  const step = Math.max(6, Math.round(Math.min(width, height) * 0.02));
  const difference = (a, b) => Math.max(Math.abs(data[a * 3] - data[b * 3]), Math.abs(data[a * 3 + 1] - data[b * 3 + 1]), Math.abs(data[a * 3 + 2] - data[b * 3 + 2]));
  let solid = 0;
  let smooth = 0;
  for (let y = 0; y < height - step; y += 2) {
    for (let x = 0; x < width - step; x += 2) {
      const p = y * width + x;
      if (Math.min(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]) >= INK_MAX) continue;
      solid++;
      if (difference(p, p + 1) > 3 || difference(p, p + width) > 3) continue;
      const change = Math.max(difference(p, p + step), difference(p, p + step * width));
      if (change < 5 || change > 45) continue;
      let gradual = true;
      for (let k = 1; k < step && gradual; k++) gradual = difference(p + k - 1, p + k) <= 6;
      if (gradual) smooth++;
    }
  }
  return solid > 0 && smooth / solid > SMOOTH_SHADING_SHARE;
}

/** A crop already on white, in black, white and grey. */
async function greyscaleCrop(png) {
  const { data, info } = await rawRgb(png);
  const { width, height } = info;
  if (isSmoothlyShaded(data, width, height)) {
    return sharp(png).flatten({ background: "#ffffff" }).greyscale().png().toBuffer();
  }
  const alpha = new Float32Array(width * height);
  for (let p = 0; p < alpha.length; p++) alpha[p] = Math.min(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]) >= INK_MAX ? 0 : 1;
  return toneToGrey({ colour: data, alpha, width, height });
}

/** One slide crop, from its renders on white and black. */
async function greyscaleSlide(onWhitePng, onBlackPng) {
  return toneToGrey(await matteFromRenders(onWhitePng, onBlackPng), { lightInk: true });
}

/** Whether a page tint is still showing around the crop after clean-up. */
async function backgroundLeft(png) {
  const { data, info } = await rawRgb(png);
  const { width, height } = info;
  let white = 0;
  let total = 0;
  const add = (x, y) => {
    const i = (y * width + x) * 3;
    if (Math.min(data[i], data[i + 1], data[i + 2]) >= WHITE_MIN) white++;
    total++;
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
  return white / total < MIN_WHITE_BORDER;
}

/**
 * Puts a slide, layout or master on a plain background. Slides and layouts lose
 * their own background and inherit it; a master is given `hexColour`.
 */
function setSlideBackground(xml, hexColour, { isMaster = false } = {}) {
  const stripped = xml.replace(/<p:bg\b[^>]*\/>|<p:bg\b[\s\S]*?<\/p:bg>/g, "");
  if (!isMaster) return stripped;
  const background = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hexColour}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  return stripped.replace(/<p:cSld(\s[^>]*)?>/, (open) => open + background);
}

/**
 * Whether the final result stands: anything the check names, or a tint left
 * behind, fails it, and the crop is hidden rather than printed.
 */
function verdict(report, { tintLeft = false } = {}) {
  const failed = ["missingLabels", "missingShapes", "unreadableLabels", "wronglyFilled", "mergedRegions"].filter((key) => report[key]?.length);
  if (report.wrongSymbols) failed.push("wrongSymbols");
  if (tintLeft) failed.push("tintLeft");
  return { pass: failed.length === 0, failed };
}

/** Cheap local measures used to pick the test set: no model involved. */
async function cropMetrics(png) {
  const { data, info } = await sharp(png)
    .flatten({ background: "#ffffff" })
    .resize(200, 200, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  let white = 0;
  let colour = 0;
  let edgeInk = 0;
  let edgePixels = 0;
  for (let p = 0; p < width * height; p++) {
    const r = data[p * 3];
    const g = data[p * 3 + 1];
    const b = data[p * 3 + 2];
    const high = Math.max(r, g, b);
    const low = Math.min(r, g, b);
    if (low >= 235) white++;
    if (high - low > 40) colour++;
    const x = p % width;
    const y = (p - x) / width;
    if (x < band || y < band || x >= width - band || y >= height - band) {
      edgePixels++;
      if (high < 130) edgeInk++;
    }
  }
  const total = width * height;
  return { white: white / total, colour: colour / total, edgeInk: edgeInk / edgePixels };
}

module.exports = {
  CLASSIFY_MAX_TOKENS,
  CLASSIFY_SCHEMA,
  VERIFY_MAX_TOKENS,
  VERIFY_SCHEMA,
  backgroundLeft,
  buildClassifyParams,
  buildVerifyParams,
  cropMetrics,
  eraseStrayItems,
  greyscaleCrop,
  greyscaleSlide,
  matteFromRenders,
  modelImage,
  planCleanup,
  removePageTint,
  setSlideBackground,
  verdict,
};
