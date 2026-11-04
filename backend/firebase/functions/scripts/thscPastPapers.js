"use strict";

/*
 * RES-54: copies school past papers from THSC Online (thsconline.github.io)
 * into the shared drive at Resources/Maths/Past Papers, filed by year, so the
 * question bank sync and backfill pick them up like any other resource. THSC
 * Online's maintainers gave Tenacity permission to store and use them for
 * tutoring (November 2026).
 *
 * Usage:
 *   node scripts/thscPastPapers.js [--years=9,10] [--out=<folder>] [--dry-run]
 *
 * It works one paper at a time with a pause between requests, skips files that
 * are already there (so a stopped run resumes), and writes "THSC sources.json"
 * beside the papers recording where each one came from.
 *
 * How THSC serves a file: each listing links papers as pdf(this, <group>) with
 * the paper's title; the viewer asks one of a pool of Google Apps Script
 * "workers" for it with export=view, base=<group>, field=<title> and
 * hash=sha256(<group>), and gets the PDF back as base64 JSON.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SITE = "https://thsconline.github.io";
const DEFAULT_OUT = path.join(
  os.homedir(),
  "Library/CloudStorage/GoogleDrive-admin@tenacitytutoring.com",
  "Shared drives/Tenacity Tutoring/Tenacity Tutoring/Resources/Maths/Past Papers"
);
const LISTINGS = Object.freeze({
  9: [
    { kind: "Yearly Papers", page: "/s/yr9/Maths/yr9papers.html" },
    { kind: "Assessment Tasks", page: "/s/yr9/Maths/assessment-tasks.html" },
  ],
  10: [
    { kind: "Yearly Papers", page: "/s/yr10/Maths/yr10papers.html" },
    { kind: "Assessment Tasks", page: "/s/yr10/Maths/assessment-tasks.html" },
  ],
});
const PAUSE_MS = 2000;
const ATTEMPTS = 3;
const MANIFEST = "THSC sources.json";

function parseArgs(argv) {
  const options = { years: [9, 10], out: DEFAULT_OUT, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--years=")) options.years = arg.slice(8).split(",").map(Number);
    else if (arg.startsWith("--out=")) options.out = arg.slice(6);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const year of options.years) if (!LISTINGS[year]) throw new Error(`No THSC listing set up for Year ${year}`);
  return options;
}

// Papers on a listing page: <a href="#v" onClick="pdf(this, 5098)">Title</a>
function parseListing(html) {
  return [...html.matchAll(/<a[^>]*onclick="pdf\(this,\s*'?([A-Za-z0-9]+)'?\)"[^>]*>([^<]+)<\/a>/gi)]
    .map((match) => ({ group: match[1], title: match[2].trim() }));
}

// The worker pool from the site's own viewer script, so a retired worker
// doesn't need a code change here.
function parseWorkers(viewerJs) {
  const pool = /function selectworker[\s\S]*?var workers\s*=\s*\[([\s\S]*?)\]/.exec(viewerJs);
  return pool ? [...pool[1].matchAll(/"(AKfyc[A-Za-z0-9_-]+)"/g)].map((match) => match[1]) : [];
}

// The viewer only sends these characters of a title.
function viewerTitle(title) {
  return title.replace(/[^A-Za-z0-9._\- ]/g, "");
}

// "Baulkham Hills 2010 w. sol" -> "Baulkham Hills 2010 - Year 9 Yearly.pdf".
// The file name must not say "solutions": the question bank skips answer and
// solution files by name, and these papers carry their questions first.
function fileNameFor({ title, year, kind }) {
  const paper = title.replace(/\s*w\.\s*sol\.?\s*$/i, "").replace(/[\\/:*?"<>|]/g, "-").trim();
  const label = kind === "Yearly Papers" ? "Yearly" : "Assessment Task";
  return `${paper} - Year ${year} ${label}.pdf`;
}

function legacyUrl(worker, group, title) {
  const url = new URL(`https://script.google.com/macros/s/${worker}/exec`);
  url.searchParams.set("export", "view");
  url.searchParams.set("base", group);
  url.searchParams.set("field", viewerTitle(title));
  url.searchParams.set("hash", crypto.createHash("sha256").update(String(group)).digest("hex"));
  return url;
}

async function fetchPaper({ group, title }, workers, { fetchImpl = fetch } = {}) {
  let lastError;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const worker = workers[Math.floor(Math.random() * workers.length)];
    try {
      const response = await fetchImpl(legacyUrl(worker, group, title), { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body.error || !body.data) throw new Error(body.error || "no file in response");
      const pdf = Buffer.from(body.data, "base64");
      if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("response is not a PDF");
      return { pdf, originalFileName: body.name || null };
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workers = parseWorkers(await (await fetch(`${SITE}/s/viewer.js`)).text());
  if (!workers.length) throw new Error("Could not find THSC's worker pool in viewer.js");

  const papers = [];
  for (const year of options.years) {
    for (const listing of LISTINGS[year]) {
      const html = await (await fetch(`${SITE}${listing.page}`)).text();
      for (const paper of parseListing(html)) {
        const folder = path.join(options.out, `Year ${year}`, listing.kind);
        papers.push({ ...paper, year, kind: listing.kind, file: path.join(folder, fileNameFor({ ...paper, year, kind: listing.kind })) });
      }
      console.log(`Year ${year} ${listing.kind}: ${papers.filter((p) => p.year === year && p.kind === listing.kind).length} papers`);
    }
  }
  const todo = papers.filter((paper) => !fs.existsSync(paper.file));
  console.log(`${papers.length} papers, ${papers.length - todo.length} already saved, ${todo.length} to download into ${options.out}`);
  if (options.dryRun) return;

  const manifestPath = path.join(options.out, MANIFEST);
  fs.mkdirSync(options.out, { recursive: true });
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { source: SITE, permission: "Granted by THSC Online's maintainers to Tenacity Tutoring for storage and use in tutoring, November 2026.", papers: {} };
  const failures = [];
  for (const [index, paper] of todo.entries()) {
    try {
      const { pdf, originalFileName } = await fetchPaper(paper, workers);
      fs.mkdirSync(path.dirname(paper.file), { recursive: true });
      fs.writeFileSync(paper.file, pdf);
      manifest.papers[path.relative(options.out, paper.file)] = {
        year: paper.year, kind: paper.kind, title: paper.title, group: paper.group,
        originalFileName, withSolutions: /w\.\s*sol/i.test(paper.title), bytes: pdf.length, savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`${index + 1}/${todo.length} Saved ${path.relative(options.out, paper.file)} (${Math.round(pdf.length / 1024)} KB)`);
    } catch (err) {
      failures.push(`${paper.title} (Year ${paper.year} ${paper.kind}): ${err.message}`);
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

module.exports = { fileNameFor, legacyUrl, parseArgs, parseListing, parseWorkers, viewerTitle };
