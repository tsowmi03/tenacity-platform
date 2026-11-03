"use strict";

// RES-54 phase 1: how big is the Drive teaching corpus once duplicates and
// non-documents are set aside, and how much of it is scanned?
//
// Walks Resources/Maths and Resources/English (skipping any "Student Docs"
// folder), sorts every file into document / image / software / other, and for
// each document records its SHA-256, page count and whether it has a usable
// text layer. Exact duplicates are grouped by hash. The summary gives unique
// pages per folder and the extraction cost measured in the phase 0 pilot.
//
// Read-only: files are read from the locally synced shared drive (reading a
// cloud-only file downloads it). Results are cached in inventory.jsonl by path,
// size and modified time, so an interrupted run picks up where it stopped.
//
// --sample N also draws N random pages from the unique documents (weighted by
// page count, with --english-share of them from English) and writes them to
// sample.manifest.json in the format driveExtractionPilot.js reads.
//
//   node scripts/driveCorpusInventory.js --out /tmp/res54-inventory
//     [--resources-root <Resources>] [--concurrency 4] [--limit 50]
//     [--sample 40] [--english-share 0.3] [--seed 54]

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");
const { PDFParse } = require("pdf-parse");

const DEFAULT_RESOURCES_ROOT = path.join(
  os.homedir(),
  "Library/CloudStorage/GoogleDrive-admin@tenacitytutoring.com",
  "Shared drives/Tenacity Tutoring/Tenacity Tutoring/Resources"
);
const SUBJECTS = ["Maths", "English"];
const EXCLUDED_DIR = /^student docs$/i;

const CATEGORY_BY_EXT = {
  pdf: "document", docx: "document", doc: "document",
  pptx: "document", ppt: "document", pps: "document", ppsx: "document",
  jpg: "image", jpeg: "image", png: "image", gif: "image", bmp: "image", tif: "image", tiff: "image",
  exe: "software", dll: "software", x32: "software", db: "software", dxr: "software",
  cat: "software", a6r: "software", wg2: "software", mcd: "software", cgl: "software",
  fig: "software", strings: "software", plist: "software", ds_store: "software", ini: "software",
};
// Formats we can't count pages in without converting them first (LibreOffice).
const NEEDS_CONVERSION = new Set(["doc", "ppt", "pps"]);
// Same threshold the pilot used to decide whether to send the text layer: a
// page with fewer non-space characters than this is treated as scanned.
const TEXT_LAYER_MIN_CHARS = 200;
const TEXT_SAMPLE_PAGES = 5;
// Measured in the phase 0 pilot (extraction call only, no check pass).
const EXTRACTION_COST_PER_PAGE = 0.08;
const BATCH_DISCOUNT = 0.5;

function parseArgs(argv) {
  const options = {
    resourcesRoot: DEFAULT_RESOURCES_ROOT,
    out: null,
    concurrency: 4,
    limit: Infinity,
    sample: 0,
    englishShare: 0.3,
    seed: 54,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = {
      "--resources-root": "resourcesRoot",
      "--out": "out",
      "--concurrency": "concurrency",
      "--limit": "limit",
      "--sample": "sample",
      "--english-share": "englishShare",
      "--seed": "seed",
    }[argv[i]];
    if (!key) throw new Error(`Unknown argument: ${argv[i]}`);
    options[key] = argv[++i];
  }
  if (!options.out) throw new Error("--out is required");
  options.concurrency = Number(options.concurrency);
  for (const key of ["limit", "sample", "englishShare", "seed"]) options[key] = Number(options[key]);
  return options;
}

function extensionOf(file) {
  const base = path.basename(file);
  if (base === ".DS_Store") return "ds_store";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function walk(root, relDir, files) {
  for (const entry of fs.readdirSync(path.join(root, relDir), { withFileTypes: true })) {
    const rel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR.test(entry.name)) walk(root, rel, files);
    } else if (entry.isFile()) {
      const stat = fs.statSync(path.join(root, rel));
      const ext = extensionOf(rel);
      files.push({
        path: rel,
        folder: relDir.split(path.sep).slice(0, 2).join("/"),
        ext,
        category: CATEGORY_BY_EXT[ext] || "other",
        bytes: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      });
    }
  }
  return files;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function samplePages(total) {
  if (total <= TEXT_SAMPLE_PAGES) return Array.from({ length: total }, (_, i) => i + 1);
  return Array.from({ length: TEXT_SAMPLE_PAGES }, (_, i) =>
    1 + Math.round((i * (total - 1)) / (TEXT_SAMPLE_PAGES - 1)));
}

async function describePdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    const pages = info.total;
    const text = await parser.getText({ partial: samplePages(pages) });
    const chars = (text.pages || []).map((page) => page.text.replace(/\s+/g, "").length);
    return { pages, textChars: median(chars) };
  } finally {
    await parser.destroy();
  }
}

async function describeOoxml(buffer, ext) {
  const zip = await JSZip.loadAsync(buffer);
  const app = (await zip.file("docProps/app.xml")?.async("string")) || "";
  const tag = ext === "docx" ? "Pages" : "Slides";
  const counted = Number(app.match(new RegExp(`<${tag}>(\\d+)</${tag}>`))?.[1]);
  let text = "";
  for (const name of Object.keys(zip.files)) {
    if (/^(word\/document|ppt\/slides\/slide\d+)\.xml$/.test(name)) {
      text += (await zip.file(name).async("string")).replace(/<[^>]+>/g, "");
    }
  }
  // Word only stores a page count when it last saved the file; fall back to
  // one page per slide or a rough 3,000 characters per page.
  const pages = counted || Math.max(1, Math.ceil(text.replace(/\s+/g, "").length / 3000));
  return { pages, pagesEstimated: !counted, textChars: Math.round(text.replace(/\s+/g, "").length / pages) };
}

async function describe(root, file) {
  const buffer = await fs.promises.readFile(path.join(root, file.path));
  const record = { ...file, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
  try {
    if (file.ext === "pdf") Object.assign(record, await describePdf(buffer));
    else if (file.ext === "docx" || file.ext === "pptx" || file.ext === "ppsx") {
      Object.assign(record, await describeOoxml(buffer, file.ext));
    } else if (NEEDS_CONVERSION.has(file.ext)) record.needsConversion = true;
  } catch (err) {
    record.error = err.message.slice(0, 200);
  }
  if (record.pages) record.textLayer = record.textChars >= TEXT_LAYER_MIN_CHARS;
  return record;
}

function cacheKey(file) {
  return `${file.path}\u0000${file.bytes}\u0000${file.mtimeMs}`;
}

function loadCache(file) {
  const cache = new Map();
  if (!fs.existsSync(file)) return cache;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const record = JSON.parse(line);
    cache.set(cacheKey(record), record);
  }
  return cache;
}

// The copy we keep from a set of identical files: prefer names without a
// trailing " a"/"a" (Drive's duplicate-upload pattern), then the shortest path.
function canonicalOf(records) {
  const score = (r) => [/ ?a\.[^.]+$/i.test(r.path) ? 1 : 0, r.path.length, r.path];
  return [...records].sort((a, b) => {
    const [x, y] = [score(a), score(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
  })[0];
}

function summarise(records) {
  const allDocuments = records.filter((r) => r.category === "document");
  const documents = allDocuments.filter((r) => r.sha256);
  const byHash = new Map();
  for (const r of documents) {
    if (!byHash.has(r.sha256)) byHash.set(r.sha256, []);
    byHash.get(r.sha256).push(r);
  }
  const unique = [...byHash.values()].map(canonicalOf);
  const duplicateGroups = [...byHash.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ keep: canonicalOf(group).path, copies: group.length, bytes: group[0].bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const folders = {};
  for (const r of records) {
    const f = (folders[r.folder] ||= {
      files: 0, documents: 0, uniqueDocuments: 0, pages: 0, scannedPages: 0, needsConversion: 0, errors: 0,
    });
    f.files++;
    if (r.category === "document") f.documents++;
  }
  for (const r of unique) {
    const f = folders[r.folder];
    f.uniqueDocuments++;
    f.pages += r.pages || 0;
    if (r.pages && !r.textLayer) f.scannedPages += r.pages;
    if (r.needsConversion) f.needsConversion++;
    if (r.error) f.errors++;
  }

  const count = (list, key) => list.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] || 0) + 1 }), {});
  const pages = unique.reduce((sum, r) => sum + (r.pages || 0), 0);
  return {
    files: records.length,
    byCategory: count(records, "category"),
    documents: allDocuments.length,
    unreadDocuments: allDocuments.length - documents.length,
    uniqueDocuments: unique.length,
    duplicateCopies: documents.length - unique.length,
    duplicateBytes: duplicateGroups.reduce((sum, g) => sum + g.bytes * (g.copies - 1), 0),
    pages,
    scannedPages: unique.reduce((sum, r) => sum + (r.pages && !r.textLayer ? r.pages : 0), 0),
    estimatedPages: unique.reduce((sum, r) => sum + (r.pagesEstimated ? r.pages : 0), 0),
    needsConversion: unique.filter((r) => r.needsConversion).length,
    errors: unique.filter((r) => r.error).map((r) => ({ path: r.path, error: r.error })),
    extractionCost: {
      perPage: EXTRACTION_COST_PER_PAGE,
      standard: Math.round(pages * EXTRACTION_COST_PER_PAGE),
      batch: Math.round(pages * EXTRACTION_COST_PER_PAGE * BATCH_DISCOUNT),
    },
    folders: Object.fromEntries(Object.entries(folders).sort((a, b) => b[1].pages - a[1].pages)),
    largestDuplicateGroups: duplicateGroups.slice(0, 25),
  };
}

// Small seeded PRNG (mulberry32) so a sample can be drawn again exactly.
function randomSource(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws pages uniformly from all pages of the unique, readable documents in
// each subject, so a 600-page textbook is sampled 600 times as often as a
// one-page worksheet.
function drawSample(records, { sample, englishShare, seed }) {
  const random = randomSource(seed);
  const byHash = new Map();
  for (const r of records) {
    if (r.category !== "document" || !r.sha256) continue;
    if (!byHash.has(r.sha256)) byHash.set(r.sha256, []);
    byHash.get(r.sha256).push(r);
  }
  const unique = [...byHash.values()].map(canonicalOf).filter((r) => r.pages && !r.error);
  const picks = new Map();
  for (const [subject, count] of [
    ["English", Math.round(sample * englishShare)],
    ["Maths", sample - Math.round(sample * englishShare)],
  ]) {
    const docs = unique.filter((r) => r.path.startsWith(`${subject}/`));
    const total = docs.reduce((sum, r) => sum + r.pages, 0);
    const chosen = new Set();
    while (chosen.size < Math.min(count, total)) chosen.add(Math.floor(random() * total));
    for (const index of chosen) {
      let offset = index;
      const doc = docs.find((r) => (offset < r.pages ? true : ((offset -= r.pages), false)));
      if (!picks.has(doc.path)) picks.set(doc.path, { doc, pages: [] });
      picks.get(doc.path).pages.push(offset + 1);
    }
  }
  return {
    description: `RES-54 phase 1 random sample: ${sample} pages, seed ${seed}. Paths are relative to the shared drive's Resources folder.`,
    books: [...picks.values()].map(({ doc, pages }, i) => ({
      id: `s${String(i + 1).padStart(2, "0")}`,
      label: `${path.basename(doc.path)} (${doc.folder}${doc.textLayer ? "" : ", scanned"})`,
      path: doc.path,
      pages: pages.sort((a, b) => a - b),
    })),
  };
}

async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });
  const cacheFile = path.join(options.out, "inventory.jsonl");
  const cache = loadCache(cacheFile);

  const files = SUBJECTS.flatMap((subject) => walk(options.resourcesRoot, subject, []));
  const todo = files
    .filter((f) => f.category === "document" && !cache.has(cacheKey(f)))
    .slice(0, options.limit);
  console.log(`${files.length} files; ${todo.length} documents to read (${cache.size} cached)`);

  const out = fs.createWriteStream(cacheFile, { flags: "a" });
  let done = 0;
  await mapWithConcurrency(todo, options.concurrency, async (file) => {
    const record = await describe(options.resourcesRoot, file).catch((err) => ({ ...file, error: err.message }));
    cache.set(cacheKey(record), record);
    out.write(`${JSON.stringify(record)}\n`);
    if (++done % 25 === 0 || done === todo.length) {
      console.log(`${done}/${todo.length}  ${record.pages ?? "-"}p  ${record.path}`);
    }
  });
  await new Promise((resolve) => out.end(resolve));

  const records = files.map((f) => (f.category === "document" ? cache.get(cacheKey(f)) || f : f));
  const summary = summarise(records);
  fs.writeFileSync(path.join(options.out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const { folders, largestDuplicateGroups, errors, ...headline } = summary;
  console.log(JSON.stringify({ ...headline, errors: errors.length }, null, 2));
  if (options.sample) {
    const manifest = drawSample(records, options);
    fs.writeFileSync(path.join(options.out, "sample.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Sample: ${manifest.books.length} documents, ${options.sample} pages -> sample.manifest.json`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { canonicalOf, drawSample, extensionOf, randomSource, samplePages, summarise };
