"use strict";

// RES-54 phase 0: can we lift questions and their original diagrams out of the
// Drive teaching resources reliably enough to build a question bank?
//
// For each page in the manifest this renders the page, asks Claude to list every
// question (and worked example, answer block...) with the pixel box of each
// diagram, crops those diagrams from a high-resolution render, then makes a
// second call that sees every box drawn on the page and either accepts it or
// returns a corrected one. It writes the crops, before/after overlays, the
// extracted units, token usage and a review page to --out.
//
// Read-only against everything but --out: the PDFs are read from the locally
// synced shared drive, and the only production access is the optional
// Secret Manager lookup of the Anthropic key (--firebase-secrets).
//
//   node scripts/driveExtractionPilot.js --out /tmp/res54 [--firebase-secrets]
//     [--manifest scripts/driveExtractionPilot.manifest.json] [--effort high]
//     [--only <book id>] [--max-pages 25] [--skip-verify]

process.env.POSTHOG_PROJECT_TOKEN = "";

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
// claude-opus-5-5 list prices (USD per million tokens), for the cost estimate
// only. Thinking tokens are billed as output.
const PRICE_PER_MTOK = Object.freeze({ input: 4, cachedInput: 0.2, cacheWrite: 5, output: 20 });

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
            enum: ["question", "worked_example", "explanation", "answers", "other"],
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

const EXTRACTION_SYSTEM = `You index pages of NSW school maths textbooks, workbooks and exam papers so their questions and diagrams can be reused in new booklets. You return exact transcriptions and precise pixel coordinates.`;

function extractionPrompt({ book, pageNumber, width, height, textLayer }) {
  const textNote = textLayer
    ? `\n\nThe PDF's own text layer for this page follows. Use it to get wording and numbers exactly right, but it may be out of reading order and has no maths formatting:\n<text_layer>\n${textLayer}\n</text_layer>`
    : "";
  return `The image is PDF page ${pageNumber} of "${book.label}". It is ${width}x${height} pixels; give every coordinate in these pixels, origin top-left.

List every unit on the page:
- question: the smallest separately answerable part (2b, not 2). Put instructions shared by the parts in "stem" and the part's own content in "text". Label with the printed numbering, prefixed by the exercise or unit heading when one is visible, e.g. "Exercise 7A Q2b".
- worked_example, explanation, answers, other: one unit per block.
Write all maths in LaTeX between $...$. "topic" is the syllabus topic in a few words.

"box" covers the whole unit. "figures" lists every diagram, graph, picture or drawn table that belongs to the unit. Each figure box must contain the entire figure with all of its labels, measurements and arrows, and nothing from neighbouring questions or answer lines. A figure shared by several parts belongs to the first of them. Units without a figure have an empty "figures" list. On a two-page spread, cover both pages.${textNote}`;
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
    only: null,
    maxPages: 25,
    verify: true,
    firebaseSecrets: false,
    concurrency: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg === "--skip-verify") options.verify = false;
    else {
      const key = {
        "--manifest": "manifest",
        "--resources-root": "resourcesRoot",
        "--out": "out",
        "--effort": "effort",
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

function costOf(usage) {
  return (
    (usage.inputTokens || 0) * PRICE_PER_MTOK.input +
    (usage.cachedInputTokens || 0) * PRICE_PER_MTOK.cachedInput +
    (usage.cacheWriteTokens || 0) * PRICE_PER_MTOK.cacheWrite +
    (usage.outputTokens || 0) * PRICE_PER_MTOK.output
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

  const usage = { extract: {}, verify: {} };
  const started = Date.now();
  const extraction = await callAnthropicForResource({
    apiKey,
    model,
    systemPrompt: EXTRACTION_SYSTEM,
    messages: [{
      role: "user",
      content: [imageBlock(page.model), { type: "text", text: extractionPrompt({ book, pageNumber, ...page }) }],
    }],
    maxTokens: 32000,
    effort: options.effort,
    responseSchema: EXTRACTION_SCHEMA,
    mathBearing: false,
  });
  addUsage(usage.extract, extraction.usage);
  const units = extraction.parsed.units;

  // Flatten figures so the verify pass and the crops can number them 1..n.
  const figures = [];
  units.forEach((unit, unitIndex) => {
    unit.figures.forEach((figure) => {
      const clamped = clampBox(figure.box, page.width, page.height);
      if (clamped) figures.push({ unitIndex, description: figure.description, firstBox: clamped, finalBox: clamped });
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
    layout: extraction.parsed.layout,
    hadTextLayer: Boolean(page.textLayer),
    seconds: Math.round((Date.now() - started) / 1000),
    usage,
    cost: costOf(usage.extract) + costOf(usage.verify),
    units,
    figures: figures.map(({ unitIndex, description, firstBox, finalBox, verdict, n, firstCrop, finalCrop }) => ({
      n, unit: units[unitIndex].label, description, verdict: verdict || null, firstBox, finalBox, firstCrop, finalCrop: finalCrop || null,
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(options.manifest, "utf8"));
  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) {
    Object.assign(keys, loadFirebaseSecrets({ secretNames: ["ANTHROPIC_API_KEY"] }));
  }
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  const model = modelForChoice("anthropic");

  const jobs = [];
  for (const book of manifest.books) {
    if (options.only && book.id !== options.only) continue;
    const pdfBuffer = fs.readFileSync(path.join(options.resourcesRoot, book.path));
    for (const pageNumber of book.pages) jobs.push({ book, pdfBuffer, pageNumber });
  }
  if (jobs.length > options.maxPages) {
    throw new Error(`${jobs.length} pages selected; raise --max-pages to run more than ${options.maxPages}`);
  }
  fs.mkdirSync(options.out, { recursive: true });
  console.log(`Extracting ${jobs.length} pages with ${model} (effort ${options.effort})`);

  const results = await mapWithConcurrency(jobs, options.concurrency, (job) =>
    processPage({ ...job, options, apiKey: keys.ANTHROPIC_API_KEY, model })
  );
  const figures = results.flatMap((r) => r.figures);
  const summary = {
    model,
    effort: options.effort,
    pages: results.length,
    failedPages: jobs.length - results.length,
    units: results.reduce((n, r) => n + r.units.length, 0),
    figures: figures.length,
    verdicts: figures.reduce((counts, f) => ({ ...counts, [f.verdict || "unchecked"]: (counts[f.verdict || "unchecked"] || 0) + 1 }), {}),
    missed: results.reduce((n, r) => n + r.missed, 0),
    cost: results.reduce((n, r) => n + r.cost, 0),
    costPerPage: results.length ? results.reduce((n, r) => n + r.cost, 0) / results.length : 0,
    secondsPerPage: results.length ? results.reduce((n, r) => n + r.seconds, 0) / results.length : 0,
  };
  fs.writeFileSync(path.join(options.out, "results.json"), JSON.stringify({ summary, results }, null, 2));
  fs.writeFileSync(path.join(options.out, "review.html"), reviewHtml(results));
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { EXTRACTION_SCHEMA, VERIFY_SCHEMA, clampBox, cleanCrop, costOf, parseArgs };
