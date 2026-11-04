"use strict";

/*
 * RES-58: contact sheets for checking a question bank run by eye.
 *
 *   matched-N.png    pages with a target diagram, each kept diagram boxed
 *   unmatched-N.png  pages sorted as having none, to spot missed diagrams
 *   crops-N.png      every diagram crop from Storage, with its question and skill
 *
 * Usage:
 *   node scripts/questionBankReview.js --projectId=tenacity-tutoring-staging \
 *     --work-dir=/tmp/qb-run --out=/tmp/qb-review
 *
 * Read-only: reads the run's work folder, Firestore and Storage.
 */

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");
const sharp = require("sharp");

const { QUESTIONS_COLLECTION, requestId } = require("../src/questionBank/extraction");

const COLUMNS = 4;
const PER_SHEET = 8;

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const [flag, value] = arg.split(/=(.*)/s);
    const key = { "--projectId": "projectId", "--work-dir": "workDir", "--out": "out" }[flag];
    if (!key || !value) throw new Error(`Unknown argument: ${arg}`);
    options[key] = value;
  }
  for (const key of ["projectId", "workDir", "out"]) if (!options[key]) throw new Error(`--${key} is required`);
  return options;
}

function escapeXml(text) {
  return String(text ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" })[c]);
}

async function labelled(image, lines, width, height) {
  const body = await sharp(image).resize({ width: width - 8, height: height - 16 * lines.length - 12, fit: "contain", background: "#fff" }).png().toBuffer();
  const text = lines.map((line, i) => `<text x="4" y="${16 * (i + 1)}" font-size="14" font-family="Arial" fill="${i ? "#06c" : "#c00"}">${escapeXml(line).slice(0, Math.floor(width / 7))}</text>`).join("");
  const frame = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fff" stroke="#999"/>${text}</svg>`);
  return sharp(frame).composite([{ input: body, left: 4, top: 16 * lines.length + 8 }]).png().toBuffer();
}

async function boxed(image, width, height, boxes) {
  const rects = boxes.map((b, i) => `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#0a7" stroke-width="4"/><text x="${b.x0 + 4}" y="${b.y0 + 22}" font-size="22" font-family="Arial" fill="#0a7">${i + 1}</text>`).join("");
  return sharp(image).composite([{ input: Buffer.from(`<svg width="${width}" height="${height}">${rects}</svg>`) }]).jpeg().toBuffer();
}

async function writeSheets(tiles, { name, out, width, height, columns = COLUMNS, perSheet = PER_SHEET }) {
  const files = [];
  for (let start = 0; start < tiles.length; start += perSheet) {
    const part = tiles.slice(start, start + perSheet);
    const file = path.join(out, `${name}-${start / perSheet + 1}.png`);
    await sharp({ create: { width: columns * width, height: Math.ceil(part.length / columns) * height, channels: 3, background: "#ddd" } })
      .composite(part.map((tile, i) => ({ input: tile, left: (i % columns) * width, top: Math.floor(i / columns) * height })))
      .png()
      .toFile(file);
    files.push(file);
  }
  return files;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.out, { recursive: true });
  const state = JSON.parse(fs.readFileSync(path.join(options.workDir, "state.json"), "utf8"));
  admin.initializeApp({ projectId: options.projectId, storageBucket: `${options.projectId}.firebasestorage.app` });
  const snapshot = await admin.firestore().collection(QUESTIONS_COLLECTION).where("runId", "==", state.runId).get();
  const questions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const imageFor = (page) => fs.readFileSync(path.join(options.workDir, "pages", `${requestId("page", page.sourceId, page.pageNumber)}.jpg`));
  const nameOf = (page) => `${state.sources[page.sourceId].path.split("/").slice(-2).join("/")} p${page.pageNumber}`;

  const pages = Object.values(state.pages).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const matched = [];
  const unmatched = [];
  for (const page of pages) {
    if (page.stage === "done") {
      const own = questions.filter((q) => q.sourceId === page.sourceId && q.pageNumber === page.pageNumber);
      const image = await boxed(imageFor(page), page.width, page.height, own.flatMap((q) => q.figures.map((f) => f.box)));
      matched.push(await labelled(image, [nameOf(page), `${page.targetTypes.join(", ")} · ${own.length} questions`], 700, 960));
    } else if (page.stage === "no_target") {
      unmatched.push(await labelled(imageFor(page), [nameOf(page)], 450, 620));
    }
  }

  const bucket = admin.storage().bucket();
  const crops = [];
  for (const question of questions.sort((a, b) => a.id.localeCompare(b.id))) {
    for (const figure of question.figures) {
      const [png] = await bucket.file(figure.storagePath).download();
      crops.push(await labelled(png, [`${question.label} (p${question.pageNumber})`, `${question.diagramType}/${question.skill}`], 300, 260));
    }
  }

  const files = [
    ...(await writeSheets(matched, { name: "matched", out: options.out, width: 700, height: 960 })),
    ...(await writeSheets(unmatched, { name: "unmatched", out: options.out, width: 450, height: 620, columns: 6, perSheet: 18 })),
    ...(await writeSheets(crops, { name: "crops", out: options.out, width: 300, height: 260, columns: 8, perSheet: 48 })),
  ];
  console.log(JSON.stringify({ runId: state.runId, matchedPages: matched.length, unmatchedPages: unmatched.length, questions: questions.length, crops: crops.length, sheets: files.length }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
