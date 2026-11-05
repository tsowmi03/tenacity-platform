"use strict";

/*
 * RES-54: copies school past papers from THSC Online (thsconline.github.io)
 * into the shared drive at Resources/<Subject>/Past Papers, filed by year, so
 * the bank syncs and backfills pick them up like any other resource. THSC
 * Online's maintainers gave Tenacity permission to store and use them for
 * tutoring (November 2026). RES-65 added English, which THSC only has for
 * Year 12 (HSC papers and marking guidelines, trials, Extension 1).
 *
 * Usage:
 *   node scripts/thscPastPapers.js [--subject=maths|english] [--years=9,10]
 *     [--out=<folder>] [--dry-run]
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
const RESOURCES = path.join(
  os.homedir(),
  "Library/CloudStorage/GoogleDrive-admin@tenacitytutoring.com",
  "Shared drives/Tenacity Tutoring/Tenacity Tutoring/Resources"
);
// Each listing names its folder (kind) and the label its file names carry.
const CURRENT_SYLLABUS_FROM = 2019;
function senior(kind, label, course, page) {
  return { kind, label: `${course} ${label}`, course, since: CURRENT_SYLLABUS_FROM, page };
}
const SUBJECTS = Object.freeze({
  maths: {
    folder: "Maths",
    years: {
      9: [
        { kind: "Yearly Papers", label: "Yearly", page: "/s/yr9/Maths/yr9papers.html" },
        { kind: "Assessment Tasks", label: "Assessment Task", page: "/s/yr9/Maths/assessment-tasks.html" },
      ],
      10: [
        { kind: "Yearly Papers", label: "Yearly", page: "/s/yr10/Maths/yr10papers.html" },
        { kind: "Assessment Tasks", label: "Assessment Task", page: "/s/yr10/Maths/assessment-tasks.html" },
      ],
      // RES-69. Senior papers are filed by course too ("Year 12/Trial
      // Papers/Extension 1") and default to the current syllabus, first
      // examined in 2019-2020; older papers test content no longer taught.
      // THSC's "general" listings hold Standard papers from 2019 on.
      11: [
        senior("Prelim Papers", "Prelim", "Advanced", "/s/yr11/Maths/prelimpapers_advanced.html"),
        senior("Prelim Papers", "Prelim", "Extension 1", "/s/yr11/Maths/prelimpapers_extension1.html"),
        senior("Prelim Papers", "Prelim", "Standard", "/s/yr11/Maths/prelimpapers_general.html"),
        senior("Assessment Tasks", "Assessment Task", "Advanced", "/s/yr11/Maths/assessment-tasks_advanced.html"),
        senior("Assessment Tasks", "Assessment Task", "Extension 1", "/s/yr11/Maths/assessment-tasks_extension1.html"),
      ],
      12: [
        senior("Trial Papers", "Trial", "Advanced", "/s/yr12/Maths/trialpapers_advanced.html"),
        senior("Trial Papers", "Trial", "Extension 1", "/s/yr12/Maths/trialpapers_extension1.html"),
        senior("Trial Papers", "Trial", "Extension 2", "/s/yr12/Maths/trialpapers_extension2.html"),
        senior("Trial Papers", "Trial", "Standard", "/s/yr12/Maths/trialpapers_general.html"),
        senior("Assessment Tasks", "Assessment Task", "Advanced", "/s/yr12/Maths/assessment-tasks_advanced.html"),
        senior("Assessment Tasks", "Assessment Task", "Extension 1", "/s/yr12/Maths/assessment-tasks_extension1.html"),
        senior("Assessment Tasks", "Assessment Task", "Extension 2", "/s/yr12/Maths/assessment-tasks_extension2.html"),
      ],
    },
  },
  english: {
    folder: "English",
    years: {
      12: [
        { kind: "HSC Papers", label: "HSC", page: "/s/yr12/English/hscpapers.html" },
        { kind: "Trial Paper 1", label: "Trial", page: "/s/yr12/English/trialpapers_paper1.html" },
        { kind: "Trial Paper 2 Advanced", label: "Trial", page: "/s/yr12/English/trialpapers_paper2_advanced.html" },
        { kind: "Trial Paper 2 Standard", label: "Trial", page: "/s/yr12/English/trialpapers_paper2_standard.html" },
        { kind: "Extension 1 Trials", label: "Extension 1 Trial", page: "/s/yr12/English Ext 1/trialpapers_extension1.html" },
        { kind: "Assessment Tasks", label: "Assessment Task", page: "/s/yr12/English/assessment-tasks.html" },
      ],
    },
  },
});
const PAUSE_MS = 2000;
const ATTEMPTS = 3;
const MANIFEST = "THSC sources.json";

function parseArgs(argv) {
  const options = { subject: "maths", years: null, since: null, out: null, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--subject=")) options.subject = arg.slice(10);
    else if (arg.startsWith("--years=")) options.years = arg.slice(8).split(",").map(Number);
    else if (arg.startsWith("--out=")) options.out = arg.slice(6);
    else if (arg.startsWith("--since=")) options.since = Number(arg.slice(8));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const subject = SUBJECTS[options.subject];
  if (!subject) throw new Error(`Unknown subject: ${options.subject}`);
  options.listings = subject.years;
  options.years = options.years || Object.keys(subject.years).map(Number);
  options.out = options.out || path.join(RESOURCES, subject.folder, "Past Papers");
  for (const year of options.years) if (!subject.years[year]) throw new Error(`No THSC ${options.subject} listing set up for Year ${year}`);
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

// The viewer only sends these characters of a title, except that it keeps
// "(Adv.)" and "(Std.)" (the English Paper 2 trials are stored under them).
function viewerTitle(title) {
  return title
    .replace(/\(Adv\.\)/g, "__ADV__")
    .replace(/\(Std\.\)/g, "__STD__")
    .replace(/[^A-Za-z0-9._\- ]/g, "")
    .replace(/__ADV__/g, "(Adv.)")
    .replace(/__STD__/g, "(Std.)");
}

// THSC answers a missing file with a "404 Not Found" PDF rather than an error,
// often under the paper's own file name, so it is recognised by its bytes.
const MISSING_FILE_PDF_SHA256 = "ae3414ce7149e4f808bca8563d46b813a36af04c5651762c47ce0f854ff0561c";
function isMissingFilePdf(pdf, originalFileName) {
  if (/^404_html\.pdf$/i.test(originalFileName || "")) return true;
  return crypto.createHash("sha256").update(pdf).digest("hex") === MISSING_FILE_PDF_SHA256;
}

// "Baulkham Hills 2010 w. sol" -> "Baulkham Hills 2010 - Year 9 Yearly.pdf".
// The file name must not say "solutions": the question bank skips answer and
// solution files by name, and these papers carry their questions first.
// English titles such as "2001 Marking Guidelines" keep their wording, so the
// English sync can pair each guide with its paper.
function fileNameFor({ title, year, label }) {
  const paper = title.replace(/\s*w\.\s*sol\.?\s*$/i, "").replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${paper} - Year ${year} ${label}.pdf`;
}

// The latest year a paper's title names, or null.
function paperYear(title) {
  const years = String(title).match(/\b(?:19|20)\d\d\b/g);
  return years ? Math.max(...years.map(Number)) : null;
}

function legacyUrl(worker, group, title) {
  const url = new URL(`https://script.google.com/macros/s/${worker}/exec`);
  url.searchParams.set("export", "view");
  url.searchParams.set("base", group);
  url.searchParams.set("field", viewerTitle(title));
  url.searchParams.set("hash", crypto.createHash("sha256").update(String(group)).digest("hex"));
  return url;
}

class MissingOnThsc extends Error {
  constructor() {
    super("THSC Online doesn't have this file (its viewer shows 404 too)");
  }
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
      if (isMissingFilePdf(pdf, body.name)) throw new MissingOnThsc();
      return { pdf, originalFileName: body.name || null };
    } catch (err) {
      if (err instanceof MissingOnThsc) throw err;
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
    for (const listing of options.listings[year]) {
      const response = await fetch(encodeURI(`${SITE}${listing.page}`));
      if (!response.ok) throw new Error(`THSC listing ${listing.page}: HTTP ${response.status}`);
      const since = options.since || listing.since || null;
      let count = 0;
      for (const paper of parseListing(await response.text())) {
        if (since && !(paperYear(paper.title) >= since)) continue;
        const folder = path.join(options.out, `Year ${year}`, listing.kind, ...(listing.course ? [listing.course] : []));
        papers.push({ ...paper, year, kind: listing.kind, course: listing.course || null, file: path.join(folder, fileNameFor({ ...paper, year, label: listing.label })) });
        count += 1;
      }
      console.log(`Year ${year} ${listing.kind}${listing.course ? ` ${listing.course}` : ""}: ${count} papers`);
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
        year: paper.year, kind: paper.kind, course: paper.course, title: paper.title, group: paper.group,
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

module.exports = { MissingOnThsc, fetchPaper, fileNameFor, isMissingFilePdf, legacyUrl, paperYear, parseArgs, parseListing, parseWorkers, viewerTitle };
