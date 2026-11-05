"use strict";

/*
 * RES-65: copies NESA's HSC English exam papers, marking guidelines and
 * sample writing booklets into the shared drive at
 * Resources/English/Past Papers/Year 12/HSC Papers/<course>, so the English
 * sync picks them up. THSC Online lists HSC papers but no longer has the
 * files; NESA publishes them on nsw.gov.au.
 *
 * Usage:
 *   node scripts/nesaHscPapers.js [--out=<folder>] [--dry-run]
 *
 * Each course has an index page linking one page per year, and each year
 * page links its PDFs directly. A paper shared by two courses (the common
 * Standard/Advanced Paper 1) is saved once, under "Standard and Advanced".
 * Files already there are skipped, so a stopped run resumes, and
 * "NESA sources.json" records where each one came from.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SITE = "https://www.nsw.gov.au";
const PAPERS = "/education-and-training/nesa/curriculum/hsc-exam-papers/";
const COURSES = Object.freeze([
  { slug: "english-advanced", folder: "Advanced" },
  { slug: "english-advanced-archive", folder: "Advanced" },
  { slug: "english-standard", folder: "Standard" },
  { slug: "english-standard-archive", folder: "Standard" },
  { slug: "english-extension-1", folder: "Extension 1" },
  { slug: "english-extension-1-archive", folder: "Extension 1" },
]);
const SHARED_FOLDER = "Standard and Advanced";
const DEFAULT_OUT = path.join(
  os.homedir(),
  "Library/CloudStorage/GoogleDrive-admin@tenacitytutoring.com",
  "Shared drives/Tenacity Tutoring/Tenacity Tutoring/Resources/English/Past Papers/Year 12/HSC Papers"
);
const PAUSE_MS = 1000;
const ATTEMPTS = 3;
const MANIFEST = "NESA sources.json";

function parseArgs(argv) {
  const options = { out: DEFAULT_OUT, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--out=")) options.out = arg.slice(6);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

// Year pages a course index links to, oldest first.
function parseYears(html, slug) {
  const years = [...html.matchAll(new RegExp(`${PAPERS}${slug}/(\\d{4})(?=["/?#])`, "g"))].map((match) => match[1]);
  return [...new Set(years)].sort();
}

function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'").replace(/&ndash;|&mdash;/g, "-").replace(/&nbsp;/g, " ");
}

// PDF links on a year page, with the link text minus its "(PDF 1.2MB)" size.
function parsePdfLinks(html) {
  return [...html.matchAll(/<a[^>]+href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    url: new URL(decodeEntities(match[1]), SITE).href,
    title: decodeEntities(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\(PDF[^)]*\)/i, "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}

// "English Advanced HSC marking guidelines 2025 - paper 1" stays as it is, so
// the English sync can pair each guideline with its paper.
function fileNameFor(title) {
  return `${title.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim()}.pdf`;
}

function folderFor(title, courseFolder) {
  return /Standard\s*\/\s*Advanced/i.test(title) ? SHARED_FOLDER : courseFolder;
}

async function fetchWithRetry(url, { fetchImpl = fetch, as = "text" } = {}) {
  let lastError;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; TenacityTutoring/1.0)" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return as === "buffer" ? Buffer.from(await response.arrayBuffer()) : await response.text();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

async function listPapers(out) {
  const papers = new Map();
  for (const course of COURSES) {
    const index = await fetchWithRetry(`${SITE}${PAPERS}${course.slug}`);
    const years = parseYears(index, course.slug);
    let count = 0;
    for (const year of years) {
      for (const link of parsePdfLinks(await fetchWithRetry(`${SITE}${PAPERS}${course.slug}/${year}`))) {
        if (papers.has(link.url)) continue;
        const folder = folderFor(link.title, course.folder);
        papers.set(link.url, { ...link, year: Number(year), course: course.slug, file: path.join(out, folder, fileNameFor(link.title)) });
        count++;
      }
    }
    console.log(`${course.slug}: ${years.join(", ") || "no years"} (${count} new files)`);
  }
  return [...papers.values()];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const papers = await listPapers(options.out);
  const clashes = papers.filter((paper, i) => papers.findIndex((other) => other.file === paper.file) !== i);
  if (clashes.length) throw new Error(`Two NESA files would share a name: ${clashes.map((p) => p.file).join(", ")}`);
  const todo = papers.filter((paper) => !fs.existsSync(paper.file));
  console.log(`${papers.length} files, ${papers.length - todo.length} already saved, ${todo.length} to download into ${options.out}`);
  if (options.dryRun) return;

  fs.mkdirSync(options.out, { recursive: true });
  const manifestPath = path.join(options.out, MANIFEST);
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { source: `${SITE}${PAPERS}`, publisher: "NSW Education Standards Authority", papers: {} };
  const failures = [];
  for (const [index, paper] of todo.entries()) {
    try {
      const pdf = await fetchWithRetry(paper.url, { as: "buffer" });
      if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("response is not a PDF");
      fs.mkdirSync(path.dirname(paper.file), { recursive: true });
      fs.writeFileSync(paper.file, pdf);
      manifest.papers[path.relative(options.out, paper.file)] = { title: paper.title, year: paper.year, course: paper.course, url: paper.url, bytes: pdf.length, savedAt: new Date().toISOString() };
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`${index + 1}/${todo.length} Saved ${path.relative(options.out, paper.file)} (${Math.round(pdf.length / 1024)} KB)`);
    } catch (err) {
      failures.push(`${paper.title}: ${err.message}`);
      console.log(`${index + 1}/${todo.length} FAILED ${paper.title}: ${err.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  console.log(`Done: ${todo.length - failures.length} saved, ${failures.length} failed.`);
  for (const failure of failures) console.log(`  ${failure}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { fileNameFor, folderFor, parseArgs, parsePdfLinks, parseYears };
