"use strict";

// RES-54: can we lift questions and their original diagrams out of the Drive
// teaching resources reliably enough to build a question bank? Phase 0 ran it
// on hand-picked Maths pages; phase 1 runs it on a random sample of the whole
// corpus (driveCorpusInventory.js --sample writes that manifest).
//
// For each page in the manifest this renders the page, asks Claude to list every
// question (and worked example, answer block...) with the pixel box of each
// diagram and crops those diagrams from a high-resolution render. With --verify
// it makes a second call that sees every box drawn on the page and either
// accepts it or returns a corrected one (phase 0 found it rarely changed a box).
// Word and PowerPoint files are converted to PDF with LibreOffice first. It
// writes the crops, overlays, the extracted units, token usage and a review
// page to --out.
//
// Read-only against everything but --out: the PDFs are read from the locally
// synced shared drive, and the only production access is the optional
// Secret Manager lookup of the Anthropic key (--firebase-secrets).
//
//   node scripts/driveExtractionPilot.js --out /tmp/res54 [--firebase-secrets]
//     [--manifest scripts/driveExtractionPilot.manifest.json] [--effort high]
//     [--only <book id>] [--max-pages 25] [--verify] [--model claude-haiku-5-5]
//     [--diagram-types] [--sort-effort low]
//
// --diagram-types narrows the run to the Maths diagrams worth keeping
// (DIAGRAM_TYPES): a cheap first call lists which of those types a page has,
// and only pages with one are extracted, keeping only the units that use them.

process.env.POSTHOG_PROJECT_TOKEN = "";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { PDFParse } = require("pdf-parse");

const { callAnthropicForResource } = require("../src/resources/apiClient");
const { modelForChoice } = require("../src/resources/modelRegistry");
const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");

const DEFAULT_RESOURCES_ROOT = path.join(
  os.homedir(),
  "Library/CloudStorage/GoogleDrive-admin@tenacitytutoring.com",
  "Shared drives/Tenacity Tutoring/Tenacity Tutoring/Resources"
);
// Claude downsizes any image whose long edge exceeds 1568px before it sees it,
// which would silently rescale every coordinate it returns. Sending the page at
// exactly that size keeps its boxes in our pixel space.
const MODEL_LONG_EDGE = 1568;
// Crops come from a separate, sharper render so they print cleanly (~290 dpi
// across an A4 page).
const CROP_RENDER_WIDTH = 2400;
const CROP_PADDING = 0.006;
// List prices (USD per million tokens, prompts under 100K tokens), for the cost
// estimate only. Thinking tokens are billed as output.
const PRICES_PER_MTOK = Object.freeze({
  "claude-opus-5-5": { input: 4, cachedInput: 0.2, cacheWrite: 5, output: 20 },
  "claude-sonnet-5-5": { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 10 },
  "claude-haiku-5-5": { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
});
// The Maths diagrams worth lifting into the question bank. English diagrams
// are left out entirely.
const DIAGRAM_TYPES = Object.freeze({
  shape_2d: "2D shapes and composite shapes, for area and perimeter",
  solid_3d: "3D solids and nets, for surface area and volume",
  triangle: "triangles for Pythagoras and trigonometry, including angles of elevation and depression and bearings",
  graph_line: "straight-line graphs",
  graph_curve: "graphs of parabolas, polynomials, circles, hyperbolas and exponential, logarithmic or trigonometric functions",
  number_plane: "points, segments or shapes plotted on the number plane",
});

const SORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["types"],
  properties: {
    types: { type: "array", items: { type: "string", enum: Object.keys(DIAGRAM_TYPES) } },
  },
};

const box = {
  type: "object",
  additionalProperties: false,
  required: ["x0", "y0", "x1", "y1"],
  properties: {
    x0: { type: "integer" },
    y0: { type: "integer" },
    x1: { type: "integer" },
    y1: { type: "integer" },
  },
};

// With target types, each figure also carries which of them it is.
function extractionSchema(targetTypes) {
  if (!targetTypes) return EXTRACTION_SCHEMA;
  const schema = JSON.parse(JSON.stringify(EXTRACTION_SCHEMA));
  const figure = schema.properties.units.items.properties.figures.items;
  figure.required.push("type");
  figure.properties.type = { type: "string", enum: targetTypes };
  return schema;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["layout", "units"],
  properties: {
    layout: { type: "string", enum: ["single", "spread"] },
    units: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "topic", "stem", "text", "box", "figures"],
        properties: {
          kind: {
            type: "string",
            enum: ["question", "worked_example", "passage", "explanation", "answers", "other"],
          },
          label: { type: "string" },
          topic: { type: "string" },
          stem: { type: ["string", "null"] },
          text: { type: "string" },
          box,
          figures: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["box", "description"],
              properties: { box, description: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["figures", "missed"],
  properties: {
    figures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "verdict", "box"],
        properties: {
          n: { type: "integer" },
          verdict: { type: "string", enum: ["good", "cut_off", "too_loose", "wrong", "not_a_figure"] },
          box,
        },
      },
    },
    missed: { type: "array", items: box },
  },
};

const EXTRACTION_SYSTEM = `You index pages of NSW school maths and English resources (textbooks, workbooks, exam papers, worksheets and study guides) so their questions, texts and diagrams can be reused in new booklets. You return exact transcriptions and precise pixel coordinates.`;

function sortPrompt() {
  const types = Object.entries(DIAGRAM_TYPES).map(([key, text]) => `- ${key}: ${text}`).join("\n");
  return `Which of these kinds of diagram appear on this page as part of a question, worked example or explanation?

${types}

Return each type that appears at least once. Ignore decoration, tables, and diagrams of any other kind (probability, statistics charts, fraction grids, number lines and so on). An empty list is the right answer for a page with none.`;
}

function extractionPrompt({ book, pageNumber, width, height, textLayer, targetTypes }) {
  const textNote = textLayer
    ? `\n\nThe PDF's own text layer for this page follows. Use it to get wording and numbers exactly right, but it may be out of reading order and has no maths formatting:\n<text_layer>\n${textLayer}\n</text_layer>`
    : "";
  return `The image is PDF page ${pageNumber} of "${book.label}". It is ${width}x${height} pixels; give every coordinate in these pixels, origin top-left.

List every unit on the page:
- question: the smallest separately answerable part (2b, not 2). Put instructions shared by the parts in "stem" and the part's own content in "text". Label with the printed numbering, prefixed by the exercise or unit heading when one is visible, e.g. "Exercise 7A Q2b".
- worked_example: a printed example whose full solution is shown on the page, usually headed "Example". A task the student is meant to do is a question even when hints or a model answer appear elsewhere.
- passage: a reading text, poem, extract or source that questions refer to. Label it with its title, or the questions it serves.
- explanation, answers, other: one unit per block. "answers" is a block of printed answers or solutions to questions elsewhere.
Write all maths in LaTeX between $...$. "topic" is the syllabus topic in a few words; for English, the text studied or the skill.

"box" covers the whole unit. "figures" lists every diagram, graph, picture or drawn table that belongs to the unit and that a student needs to answer or follow it. Leave out decoration: cartoon characters and mascots, clip-art and photos that only illustrate, logos, icons, theme keys and legends, and blank grids, organisers or writing frames meant for answers. A table counts when it holds the question's data or is the table the question asks the student to complete. Each figure box must contain the entire figure with all of its labels, measurements and arrows, and nothing from neighbouring questions or answer lines. A figure shared by several parts belongs to the first of them. Units without a figure have an empty "figures" list. On a two-page spread, cover both pages.${targetTypes ? `

Only these kinds of diagram matter:
${targetTypes.map((key) => `- ${key}: ${DIAGRAM_TYPES[key]}`).join("\n")}
List only the units that have at least one of them, and only those figures, each with its "type". Leave out every other unit and figure.` : ""}${textNote}`;
}

function verifyPrompt({ width, height, count }) {
  return `This is the same ${width}x${height} page with ${count} red rectangles drawn on it, each numbered at its top-left corner. Each one is meant to tightly contain exactly one complete figure (diagram, graph, picture or drawn table) with all of its labels, and nothing from neighbouring questions or answer lines. Ignore the red drawing itself when judging.

For every rectangle n return a verdict: good, cut_off (part of the figure or its labels is outside), too_loose (it also takes in question text, answer lines or another figure), wrong (it is on the wrong thing) or not_a_figure. Return "box" as the correct box in pixels: the same box when it is good, a corrected one otherwise.

Under "missed", give a box for every figure on the page that no rectangle covers.`;
}

function parseArgs(argv) {
  const options = {
    manifest: path.join(__dirname, "driveExtractionPilot.manifest.json"),
    resourcesRoot: DEFAULT_RESOURCES_ROOT,
    out: null,
    effort: "high",
    sortEffort: "low",
    model: null,
    diagramTypes: false,
    only: null,
    maxPages: 25,
    verify: false,
    firebaseSecrets: false,
    concurrency: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg === "--verify") options.verify = true;
    else if (arg === "--diagram-types") options.diagramTypes = true;
    else {
      const key = {
        "--manifest": "manifest",
        "--resources-root": "resourcesRoot",
        "--out": "out",
        "--effort": "effort",
        "--sort-effort": "sortEffort",
        "--model": "model",
        "--only": "only",
        "--max-pages": "maxPages",
        "--concurrency": "concurrency",
      }[arg];
      if (!key) throw new Error(`Unknown argument: ${arg}`);
      options[key] = argv[++i];
    }
  }
  if (!options.out) throw new Error("--out is required");
  options.maxPages = Number(options.maxPages);
  options.concurrency = Number(options.concurrency);
  return options;
}

function clampBox(b, width, height) {
  const x0 = Math.max(0, Math.min(b.x0, b.x1));
  const y0 = Math.max(0, Math.min(b.y0, b.y1));
  const x1 = Math.min(width, Math.max(b.x0, b.x1));
  const y1 = Math.min(height, Math.max(b.y0, b.y1));
  return x1 - x0 < 4 || y1 - y0 < 4 ? null : { x0, y0, x1, y1 };
}

async function cropFigure(hiRes, b, scale, file) {
  const meta = await sharp(hiRes).metadata();
  const pad = Math.round(meta.width * CROP_PADDING);
  const left = Math.max(0, Math.round(b.x0 * scale) - pad);
  const top = Math.max(0, Math.round(b.y0 * scale) - pad);
  const width = Math.min(meta.width - left, Math.round((b.x1 - b.x0) * scale) + 2 * pad);
  const height = Math.min(meta.height - top, Math.round((b.y1 - b.y0) * scale) + 2 * pad);
  const crop = await sharp(hiRes).extract({ left, top, width, height }).png().toBuffer();
  await sharp(await cleanCrop(crop)).toFile(file);
}

// A box that is right on the page can still clip the edge of a neighbouring
// question: its number, an answer line, half a caption. Those fragments are the
// ink touching the crop's border that lies outside the figure itself (the
// extent of the ink that does not touch the border), so they are whitened and
// the crop is trimmed to what is left.
const INK_THRESHOLD = 170;

async function cleanCrop(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const label = new Int32Array(width * height).fill(-1);
  const components = [];
  for (let start = 0; start < data.length; start++) {
    if (data[start] >= INK_THRESHOLD || label[start] !== -1) continue;
    const component = { pixels: [], x0: width, y0: height, x1: 0, y1: 0, edge: false };
    const stack = [start];
    label[start] = components.length;
    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = (index - x) / width;
      component.pixels.push(index);
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

  const inner = components.filter((c) => !c.edge && c.pixels.length > 4);
  if (!inner.length) return png;
  const core = {
    x0: Math.min(...inner.map((c) => c.x0)),
    y0: Math.min(...inner.map((c) => c.y0)),
    x1: Math.max(...inner.map((c) => c.x1)),
    y1: Math.max(...inner.map((c) => c.y1)),
  };
  const overlap = (c) =>
    Math.max(0, Math.min(c.x1, core.x1) - Math.max(c.x0, core.x0)) *
    Math.max(0, Math.min(c.y1, core.y1) - Math.max(c.y0, core.y0));
  const stray = components.filter((c) => c.edge && overlap(c) < 0.5 * (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1));
  if (!stray.length) return png;

  // Whiten each fragment's surroundings, not just its dark pixels: the
  // anti-aliased grey around a scanned glyph sits above the ink threshold and
  // would otherwise survive as a faint ghost. Only pixels belonging to a kept
  // component are spared.
  const rgb = await sharp(png).removeAlpha().raw().toBuffer();
  const kept = components.filter((c) => !stray.includes(c));
  const keptLabels = new Set(kept.map((c) => components.indexOf(c)));
  for (const c of stray) {
    for (let y = Math.max(0, c.y0 - 3); y <= Math.min(height - 1, c.y1 + 3); y++) {
      for (let x = Math.max(0, c.x0 - 3); x <= Math.min(width - 1, c.x1 + 3); x++) {
        const index = y * width + x;
        if (!keptLabels.has(label[index])) rgb.fill(255, index * 3, index * 3 + 3);
      }
    }
  }
  const margin = Math.round(Math.min(width, height) * 0.03);
  const left = Math.max(0, Math.min(...kept.map((c) => c.x0)) - margin);
  const top = Math.max(0, Math.min(...kept.map((c) => c.y0)) - margin);
  const right = Math.min(width, Math.max(...kept.map((c) => c.x1)) + margin + 1);
  const bottom = Math.min(height, Math.max(...kept.map((c) => c.y1)) + margin + 1);
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
}

// Draws numbered rectangles on the model-sized page: the input to the verify
// pass, and the before/after picture a reviewer looks at.
async function drawBoxes(image, width, height, boxes, colour = "#e00") {
  const shapes = boxes.map((b, i) => `
    <rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="${colour}" stroke-width="3"/>
    <rect x="${b.x0}" y="${Math.max(0, b.y0 - 22)}" width="${String(i + 1).length * 12 + 10}" height="22" fill="${colour}"/>
    <text x="${b.x0 + 5}" y="${Math.max(0, b.y0 - 22) + 17}" font-size="18" font-family="Arial" font-weight="bold" fill="#fff">${i + 1}</text>`);
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${shapes.join("")}</svg>`);
  return sharp(image).composite([{ input: svg, left: 0, top: 0 }]).jpeg({ quality: 85 }).toBuffer();
}

function imageBlock(buffer) {
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buffer.toString("base64") } };
}

function addUsage(total, usage = {}) {
  for (const key of ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"]) {
    total[key] = (total[key] || 0) + (usage[key] || 0);
  }
  return total;
}

function costOf(usage, model) {
  const price = PRICES_PER_MTOK[model];
  if (!price) throw new Error(`No price for ${model}; add it to PRICES_PER_MTOK`);
  return (
    (usage.inputTokens || 0) * price.input +
    (usage.cachedInputTokens || 0) * price.cachedInput +
    (usage.cacheWriteTokens || 0) * price.cacheWrite +
    (usage.outputTokens || 0) * price.output
  ) / 1e6;
}

async function renderPage(pdfBuffer, pageNumber) {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const shot = await parser.getScreenshot({ partial: [pageNumber], desiredWidth: CROP_RENDER_WIDTH, imageBuffer: true });
    const text = await parser.getText({ partial: [pageNumber] });
    const hiRes = Buffer.from(shot.pages[0].data);
    const model = await sharp(hiRes)
      .resize({ width: MODEL_LONG_EDGE, height: MODEL_LONG_EDGE, fit: "inside" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const meta = await sharp(model).metadata();
    const hiMeta = await sharp(hiRes).metadata();
    const textLayer = (text.pages?.[0]?.text || "").trim();
    return {
      hiRes,
      model,
      width: meta.width,
      height: meta.height,
      scale: hiMeta.width / meta.width,
      // A scan's text layer is empty or a stray page number; only a real one
      // helps the transcription.
      textLayer: textLayer.replace(/\s+/g, "").length >= 200 ? textLayer : null,
    };
  } finally {
    await parser.destroy();
  }
}

async function processPage({ book, pdfBuffer, pageNumber, options, apiKey, model }) {
  const id = `${book.id}-p${pageNumber}`;
  const dir = path.join(options.out, book.id);
  fs.mkdirSync(path.join(dir, "crops"), { recursive: true });
  const page = await renderPage(pdfBuffer, pageNumber);
  fs.writeFileSync(path.join(dir, `p${pageNumber}.jpg`), page.model);

  const usage = { sort: {}, extract: {}, verify: {} };
  const started = Date.now();
  let targetTypes = null;
  if (options.diagramTypes) {
    const sorting = await callAnthropicForResource({
      apiKey,
      model,
      systemPrompt: EXTRACTION_SYSTEM,
      messages: [{ role: "user", content: [imageBlock(page.model), { type: "text", text: sortPrompt() }] }],
      maxTokens: 4000,
      effort: options.sortEffort,
      responseSchema: SORT_SCHEMA,
      mathBearing: false,
    });
    addUsage(usage.sort, sorting.usage);
    targetTypes = [...new Set(sorting.parsed.types)];
    if (!targetTypes.length) {
      const result = {
        id, book: book.id, pageNumber, sortedTypes: [], extracted: false,
        hadTextLayer: Boolean(page.textLayer), seconds: Math.round((Date.now() - started) / 1000),
        usage, cost: costOf(usage.sort, model), units: [], figures: [], missed: 0,
      };
      fs.writeFileSync(path.join(dir, `p${pageNumber}.json`), JSON.stringify(result, null, 2));
      console.log(`${id}: no target diagrams, $${result.cost.toFixed(4)}`);
      return result;
    }
  }
  const extraction = await callAnthropicForResource({
    apiKey,
    model,
    systemPrompt: EXTRACTION_SYSTEM,
    messages: [{
      role: "user",
      content: [imageBlock(page.model), { type: "text", text: extractionPrompt({ book, pageNumber, ...page, targetTypes }) }],
    }],
    maxTokens: 32000,
    effort: options.effort,
    responseSchema: extractionSchema(targetTypes),
    mathBearing: false,
  });
  addUsage(usage.extract, extraction.usage);
  // A targeted run only wants units with a target diagram; the model sometimes
  // lists the rest of the page anyway.
  const units = targetTypes
    ? extraction.parsed.units.filter((unit) => unit.figures.length)
    : extraction.parsed.units;

  // Flatten figures so the verify pass and the crops can number them 1..n.
  const figures = [];
  units.forEach((unit, unitIndex) => {
    unit.figures.forEach((figure) => {
      const clamped = clampBox(figure.box, page.width, page.height);
      if (clamped) figures.push({ unitIndex, type: figure.type || null, description: figure.description, firstBox: clamped, finalBox: clamped });
    });
  });
  const before = await drawBoxes(page.model, page.width, page.height, figures.map((f) => f.firstBox));
  fs.writeFileSync(path.join(dir, `p${pageNumber}-boxes-first.jpg`), before);

  let missed = [];
  if (options.verify && figures.length) {
    const verification = await callAnthropicForResource({
      apiKey,
      model,
      systemPrompt: EXTRACTION_SYSTEM,
      messages: [{
        role: "user",
        content: [
          imageBlock(page.model),
          imageBlock(before),
          { type: "text", text: `The first image is the clean page; the second has the rectangles.\n\n${verifyPrompt({ ...page, count: figures.length })}` },
        ],
      }],
      maxTokens: 16000,
      effort: options.effort,
      responseSchema: VERIFY_SCHEMA,
      mathBearing: false,
    });
    addUsage(usage.verify, verification.usage);
    for (const result of verification.parsed.figures) {
      const figure = figures[result.n - 1];
      if (!figure) continue;
      figure.verdict = result.verdict;
      const corrected = clampBox(result.box, page.width, page.height);
      if (result.verdict === "not_a_figure") figure.finalBox = null;
      else if (result.verdict !== "good" && corrected) figure.finalBox = corrected;
    }
    missed = verification.parsed.missed.map((b) => clampBox(b, page.width, page.height)).filter(Boolean);
  }

  const kept = figures.filter((f) => f.finalBox);
  const after = await drawBoxes(page.model, page.width, page.height, [...kept.map((f) => f.finalBox), ...missed], "#0a7");
  fs.writeFileSync(path.join(dir, `p${pageNumber}-boxes-final.jpg`), after);
  for (const [index, figure] of figures.entries()) {
    figure.n = index + 1;
    figure.firstCrop = `crops/p${pageNumber}-f${figure.n}-first.png`;
    await cropFigure(page.hiRes, figure.firstBox, page.scale, path.join(dir, figure.firstCrop));
    if (figure.finalBox && figure.finalBox !== figure.firstBox) {
      figure.finalCrop = `crops/p${pageNumber}-f${figure.n}-final.png`;
      await cropFigure(page.hiRes, figure.finalBox, page.scale, path.join(dir, figure.finalCrop));
    } else if (figure.finalBox) {
      figure.finalCrop = figure.firstCrop;
    }
  }
  for (const [index, b] of missed.entries()) {
    await cropFigure(page.hiRes, b, page.scale, path.join(dir, `crops/p${pageNumber}-missed${index + 1}.png`));
  }

  const result = {
    id,
    book: book.id,
    pageNumber,
    sortedTypes: targetTypes,
    extracted: true,
    layout: extraction.parsed.layout,
    hadTextLayer: Boolean(page.textLayer),
    seconds: Math.round((Date.now() - started) / 1000),
    usage,
    cost: costOf(usage.sort, model) + costOf(usage.extract, model) + costOf(usage.verify, model),
    units,
    figures: figures.map(({ unitIndex, type, description, firstBox, finalBox, verdict, n, firstCrop, finalCrop }) => ({
      n, unit: units[unitIndex].label, type, description, verdict: verdict || null, firstBox, finalBox, firstCrop, finalCrop: finalCrop || null,
    })),
    missed: missed.length,
  };
  fs.writeFileSync(path.join(dir, `p${pageNumber}.json`), JSON.stringify(result, null, 2));
  console.log(`${id}: ${units.length} units, ${figures.length} figures (${figures.filter((f) => f.verdict && f.verdict !== "good").length} corrected), ${missed.length} missed, $${result.cost.toFixed(3)}, ${result.seconds}s`);
  return result;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function reviewHtml(results) {
  const sections = results.map((r) => `
<section>
  <h2>${escapeHtml(r.id)} <small>${r.units.length} units · ${r.figures.length} figures · ${r.missed} missed · text layer: ${r.hadTextLayer ? "yes" : "no"} · $${r.cost.toFixed(3)}</small></h2>
  <div class="pages"><figure><img src="${r.book}/p${r.pageNumber}-boxes-first.jpg"><figcaption>First pass</figcaption></figure>
  <figure><img src="${r.book}/p${r.pageNumber}-boxes-final.jpg"><figcaption>After check (missed figures included)</figcaption></figure></div>
  <table><tr><th>#</th><th>Unit</th><th>Verdict</th><th>First crop</th><th>Final crop</th></tr>
  ${r.figures.map((f) => `<tr><td>${f.n}</td><td>${escapeHtml(f.unit)}<br><small>${escapeHtml(f.description)}</small></td><td>${escapeHtml(f.verdict || "-")}</td>
    <td><img src="${r.book}/${f.firstCrop}"></td><td>${f.finalCrop ? `<img src="${r.book}/${f.finalCrop}">` : "dropped"}</td></tr>`).join("")}
  </table>
  <details><summary>Units</summary><ol>${r.units.map((u) => `<li><b>${escapeHtml(u.kind)} · ${escapeHtml(u.label)}</b> (${escapeHtml(u.topic)})${u.stem ? `<br><i>${escapeHtml(u.stem)}</i>` : ""}<br>${escapeHtml(u.text)}</li>`).join("")}</ol></details>
</section>`);
  return `<!doctype html><meta charset="utf-8"><title>RES-54 pilot review</title>
<style>body{font:14px system-ui;margin:16px}.pages{display:flex;gap:8px}.pages img{max-width:100%;max-height:900px;border:1px solid #ccc}
table{border-collapse:collapse;margin-top:8px}td,th{border:1px solid #ccc;padding:4px;vertical-align:top}td img{max-width:360px;max-height:300px}
section{border-top:3px solid #333;margin-top:24px}</style>
<h1>RES-54 extraction pilot</h1>${sections.join("")}`;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index]);
      } catch (err) {
        console.error(`${items[index].book.id}-p${items[index].pageNumber} failed: ${err.message}`);
        results[index] = null;
      }
    }
  }));
  return results.filter(Boolean);
}

// Word and PowerPoint files go through LibreOffice so every page can be
// rendered the same way; the PDF is kept under --out/converted.
function loadPdf(options, book) {
  const source = path.join(options.resourcesRoot, book.path);
  if (path.extname(source).toLowerCase() === ".pdf") return fs.readFileSync(source);
  const dir = path.join(options.out, "converted", book.id);
  const pdf = path.join(dir, `${path.basename(source, path.extname(source))}.pdf`);
  if (!fs.existsSync(pdf)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", dir, source], { stdio: "ignore" });
  }
  return fs.readFileSync(pdf);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(options.manifest, "utf8"));
  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) {
    Object.assign(keys, loadFirebaseSecrets({ secretNames: ["ANTHROPIC_API_KEY"] }));
  }
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  const model = options.model || modelForChoice("anthropic");
  if (!PRICES_PER_MTOK[model]) throw new Error(`No price for ${model}; add it to PRICES_PER_MTOK`);
  fs.mkdirSync(options.out, { recursive: true });

  const jobs = [];
  const unconverted = [];
  for (const book of manifest.books) {
    if (options.only && book.id !== options.only) continue;
    let pdfBuffer;
    try {
      pdfBuffer = loadPdf(options, book);
    } catch (err) {
      console.error(`${book.id} skipped: could not convert ${book.path} (${err.message.split("\n")[0]})`);
      unconverted.push(book.path);
      continue;
    }
    for (const pageNumber of book.pages) jobs.push({ book, pdfBuffer, pageNumber });
  }
  if (jobs.length > options.maxPages) {
    throw new Error(`${jobs.length} pages selected; raise --max-pages to run more than ${options.maxPages}`);
  }
  console.log(`Extracting ${jobs.length} pages with ${model} (effort ${options.effort}${options.diagramTypes ? `, sorting at ${options.sortEffort}` : ""})`);

  const results = await mapWithConcurrency(jobs, options.concurrency, (job) =>
    processPage({ ...job, options, apiKey: keys.ANTHROPIC_API_KEY, model })
  );
  const figures = results.flatMap((r) => r.figures);
  const summary = {
    model,
    effort: options.effort,
    pages: results.length,
    pagesExtracted: results.filter((r) => r.extracted !== false).length,
    figureTypes: figures.reduce((counts, f) => (f.type ? { ...counts, [f.type]: (counts[f.type] || 0) + 1 } : counts), {}),
    sortCost: results.reduce((n, r) => n + costOf(r.usage.sort || {}, model), 0),
    failedPages: jobs.length - results.length,
    unconverted,
    units: results.reduce((n, r) => n + r.units.length, 0),
    figures: figures.length,
    verdicts: figures.reduce((counts, f) => ({ ...counts, [f.verdict || "unchecked"]: (counts[f.verdict || "unchecked"] || 0) + 1 }), {}),
    missed: results.reduce((n, r) => n + r.missed, 0),
    cost: results.reduce((n, r) => n + r.cost, 0),
    costPerPage: results.length ? results.reduce((n, r) => n + r.cost, 0) / results.length : 0,
    secondsPerPage: results.length ? results.reduce((n, r) => n + r.seconds, 0) / results.length : 0,
  };
  fs.writeFileSync(path.join(options.out, "results.json"), JSON.stringify({ summary, results }, null, 2));
  fs.writeFileSync(path.join(options.out, "review.html"), reviewHtml(results.filter((r) => r.extracted !== false)));
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { DIAGRAM_TYPES, EXTRACTION_SCHEMA, SORT_SCHEMA, VERIFY_SCHEMA, clampBox, cleanCrop, costOf, extractionSchema, parseArgs };
