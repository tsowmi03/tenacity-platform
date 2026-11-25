"use strict";

// RES-40. Rebuilds resources that were already generated, with the current
// builder, so a layout change can be checked on real content without a single
// model call. Reads the job records a benchmark or replay run left behind
// (`<runDir>/<id>/replay/job.json`, or `<runDir>/job.json` for one replay),
// rebuilds each DOCX from its saved `generatedJson`, converts it to PDF with
// LibreOffice and reports the pages that are left nearly empty.
//
//   node scripts/rerenderSavedResources.js <runDir> [outputDir] [--only m01,e10] [--no-pdf]
//
// Production access is read-only: question-bank crops are downloaded from the
// default bucket when a resource uses them. Every write stays in outputDir.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { buildResourceDocx } = require("../src/resources/builder");
const { joinShortSections } = require("../src/resources/layoutPass");
const { cloneWithSourceImages, loadSourceImages, walkSourceImages } = require("../src/resources/sourceImages");
const { findSparsePages } = require("./lib/sparsePages");

const SOFFICE_CANDIDATES = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/opt/homebrew/bin/soffice",
  "/usr/bin/soffice",
];
const PROJECT_ID = "tenacity-tutoring-b8eb2";
const BUCKET = "tenacity-tutoring-b8eb2.firebasestorage.app";

function parseArgs(argv) {
  const options = { runDir: null, output: null, only: null, pdf: true };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--no-pdf") options.pdf = false;
    else if (argv[i] === "--only") options.only = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (argv[i].startsWith("--")) throw new Error(`Unknown option: ${argv[i]}`);
    else positional.push(argv[i]);
  }
  [options.runDir, options.output] = positional;
  if (!options.runDir) throw new Error("Usage: rerenderSavedResources.js <runDir> [outputDir] [--only a,b] [--no-pdf]");
  options.output = options.output || fs.mkdtempSync(path.join(os.tmpdir(), "tenacity-rerender-"));
  return options;
}

/** Job records under a run directory: one per benchmark request, or a lone replay. */
function findJobs(runDir) {
  const lone = path.join(runDir, "job.json");
  if (fs.existsSync(lone)) return [{ id: path.basename(runDir), file: lone }];
  return fs.readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ id: entry.name, file: path.join(runDir, entry.name, "replay", "job.json") }))
    .filter((job) => fs.existsSync(job.file))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildOptionsFor(job) {
  return {
    studentName: job.studentName,
    subject: job.subject,
    year: job.year,
    answerMode: job.answerMode,
    showMarks: typeof job.showMarks === "boolean" ? job.showMarks : job.resourceType === "practice-paper",
  };
}

function usesSourceImages(resource) {
  let found = false;
  walkSourceImages(resource, () => { found = true; });
  return found;
}

/**
 * A sourced stimulus photo is stored without its bytes. Its layout only needs
 * the size, so a grey box of the same dimensions stands in for it.
 */
async function fillMissingPhotos(node) {
  if (Array.isArray(node)) { for (const child of node) await fillMissingPhotos(child); return; }
  if (!node || typeof node !== "object" || Buffer.isBuffer(node)) return;
  const image = node.image;
  if (image && typeof image === "object" && !Buffer.isBuffer(image) && !Buffer.isBuffer(image.buffer) &&
      Number(image.width) > 0 && Number(image.height) > 0) {
    const sharp = require("sharp");
    image.buffer = await sharp({
      create: { width: Math.round(image.width), height: Math.round(image.height), channels: 3, background: "#cccccc" },
    }).png().toBuffer();
    image.type = "png";
  }
  for (const value of Object.values(node)) await fillMissingPhotos(value);
}

function findSoffice() {
  return SOFFICE_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

function convertToPdf(soffice, docxPath, outDir) {
  // A private profile per run: a second LibreOffice sharing the user's profile
  // exits without converting anything.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tenacity-lo-profile-"));
  execFileSync(soffice, [
    `-env:UserInstallation=file://${profile}`,
    "--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath,
  ], { stdio: "ignore", timeout: 180000 });
  return path.join(outDir, `${path.basename(docxPath, ".docx")}.pdf`);
}

async function rerender(options) {
  const jobs = findJobs(options.runDir).filter((job) => !options.only || options.only.some((id) => job.id.startsWith(id)));
  if (!jobs.length) throw new Error(`No saved jobs found under ${options.runDir}`);
  fs.mkdirSync(options.output, { recursive: true });
  const soffice = options.pdf ? findSoffice() : null;
  if (options.pdf && !soffice) throw new Error("LibreOffice (soffice) was not found; pass --no-pdf to build DOCX only");

  let bucket = null;
  const rows = [];
  for (const { id, file } of jobs) {
    const job = JSON.parse(fs.readFileSync(file, "utf8"));
    const row = { id, resourceType: job.resourceType, pages: null, sparse: [], joined: [], error: null };
    rows.push(row);
    try {
      if (typeof job.generatedJson !== "string" || !job.generatedJson.trim()) throw new Error("job has no generatedJson");
      const resource = JSON.parse(job.generatedJson);
      if (usesSourceImages(resource)) {
        if (!bucket) {
          const admin = require("firebase-admin");
          if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
          bucket = admin.storage().bucket();
        }
        await loadSourceImages(resource, bucket);
      }
      await fillMissingPhotos(resource);
      const docx = await buildResourceDocx(job.resourceType, resource, buildOptionsFor(job));
      const docxPath = path.join(options.output, `${id}.docx`);
      fs.writeFileSync(docxPath, docx);
      if (soffice) {
        let pdfPath = convertToPdf(soffice, docxPath, options.output);
        // The same measured pass the pipeline runs after converting (RES-40).
        const passDir = path.join(options.output, ".layout-pass");
        fs.mkdirSync(passDir, { recursive: true });
        const joined = await joinShortSections({
          built: { buffer: docx, resource },
          pdf: fs.readFileSync(pdfPath),
          clone: cloneWithSourceImages,
          rebuild: async (changed) => ({ buffer: await buildResourceDocx(job.resourceType, changed, buildOptionsFor(job)), resource: changed }),
          convert: async (buffer) => {
            const trial = path.join(passDir, `${id}.docx`);
            fs.writeFileSync(trial, buffer);
            return fs.readFileSync(convertToPdf(soffice, trial, passDir));
          },
        });
        if (joined.joined.length) {
          fs.writeFileSync(docxPath, joined.built.buffer);
          fs.writeFileSync(pdfPath, joined.pdf);
          row.joined = joined.joined;
        }
        const report = findSparsePages(pdfPath);
        row.pages = report.pages;
        row.sparse = report.sparse;
      }
    } catch (err) {
      row.error = err?.message || String(err);
    }
    const sparse = row.sparse.map((page) => `p${page.page} (${page.lines} lines)`).join(", ");
    const joined = row.joined?.length ? `, joined before: ${row.joined.join("; ")}` : "";
    console.log(`${id}: ${row.error ? `FAILED ${row.error}` : `${row.pages ?? "?"} pages${joined}${sparse ? `, near-blank: ${sparse}` : ""}`}`);
  }
  fs.writeFileSync(path.join(options.output, "layout-report.json"), JSON.stringify(rows, null, 2));
  const totals = {
    resources: rows.length,
    failed: rows.filter((row) => row.error).length,
    pages: rows.reduce((sum, row) => sum + (row.pages || 0), 0),
    sparsePages: rows.reduce((sum, row) => sum + row.sparse.length, 0),
  };
  console.log(`\n${totals.resources} resources, ${totals.pages} pages, ${totals.sparsePages} near-blank pages, ${totals.failed} failed`);
  console.log(`Output: ${options.output}`);
  return { rows, totals };
}

if (require.main === module) {
  rerender(parseArgs(process.argv.slice(2)))
    .then(({ totals }) => { process.exitCode = totals.failed ? 1 : 0; })
    .catch((err) => { console.error(err.message || err); process.exitCode = 1; });
}

module.exports = { buildOptionsFor, findJobs, parseArgs, rerender };
