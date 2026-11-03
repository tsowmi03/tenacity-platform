"use strict";

/*
 * RES-57: builds the question bank from the pending files in
 * questionBankSources (RES-56), through the Message Batches API on Haiku 5.5.
 *
 *   1. prepare: download each file as a PDF, render its pages, skip blank ones;
 *   2. sort:    one cheap call per page lists which diagram types it has;
 *   3. extract: pages with a match get the full call; each kept question and
 *               its diagram crops are written to Firestore and Storage.
 *
 * Usage:
 *   node scripts/questionBankExtract.js --projectId=tenacity-tutoring-staging \
 *     --work-dir=/tmp/qb-run [--limit-sources=40] [--pages-per-source=5] \
 *     [--seed=54] [--cap=100] [--firebase-secrets] [--commit --yes]
 *
 * Without --commit --yes it only prepares pages and prints the plan: no API
 * calls and no writes. Rerunning with the same --work-dir resumes: prepared
 * files and finished pages are kept, and submitted batches are awaited.
 * --pages-per-source samples pages (the RES-58 quality check); a sampled file
 * is never marked as extracted.
 *
 * Auth: Application Default Credentials for Firestore and Storage, and the
 * Token Creator role on the Drive account (see questionBankSync.js). The
 * Anthropic key comes from ANTHROPIC_API_KEY or, with --firebase-secrets, from
 * production Secret Manager (the staging key is a placeholder).
 */

process.env.POSTHOG_PROJECT_TOKEN = "";

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const { batchCostOf, chunkRequests, collectResults, submitBatch, waitForBatch } = require("../src/questionBank/batches");
const { createDriveClient, createImpersonatedTokenProvider } = require("../src/questionBank/driveSource");
const { QUESTIONS_COLLECTION, majorityYearLevel, parseRequestId, requestId, toQuestionDocs } = require("../src/questionBank/extraction");
const { cropFigure, pageCount, pageText, renderHiResPage, renderModelPage } = require("../src/questionBank/pages");
const { EXTRACT_MAX_TOKENS, QUESTION_BANK_MODEL, SORT_MAX_TOKENS, buildExtractParams, buildSortParams, readMessage } = require("../src/questionBank/prompts");
const { fetchSourcePdf } = require("../src/questionBank/sourceFiles");
const { SOURCES_COLLECTION } = require("../src/questionBank/sourceStore");
const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");

// Rough per-page batch prices, measured in RES-54 phase 1 and halved for
// batches, used to check a batch fits under the cap before it is submitted.
const ESTIMATE = { sort: 0.00017, extract: 0.001 };
const TERMINAL_STAGES = new Set(["blank", "no_target", "done", "failed"]);

function parseArgs(argv) {
  const options = { projectId: "", workDir: "", limitSources: Infinity, pagesPerSource: null, seed: 54, cap: 100, firebaseSecrets: false, commit: false, yes: false };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else {
      const [flag, value] = arg.split(/=(.*)/s);
      const key = { "--projectId": "projectId", "--work-dir": "workDir", "--limit-sources": "limitSources", "--pages-per-source": "pagesPerSource", "--seed": "seed", "--cap": "cap" }[flag];
      if (!key || value === undefined) throw new Error(`Unknown argument: ${arg}`);
      options[key] = ["projectId", "workDir"].includes(key) ? value : Number(value);
    }
  }
  if (!options.projectId) throw new Error("--projectId is required");
  if (!options.workDir) throw new Error("--work-dir is required");
  return options;
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

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createRun(workDir) {
  const statePath = path.join(workDir, "state.json");
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { runId: `qb-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`, spentUsd: 0, sources: null, pages: {}, batches: [] };
  const save = () => {
    fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state));
    fs.renameSync(`${statePath}.tmp`, statePath);
  };
  return { state, save, pdfPath: (id) => path.join(workDir, "pdf", `${id}.pdf`), imagePath: (key) => path.join(workDir, "pages", `${key}.jpg`) };
}

async function selectSources(db, options) {
  const snapshot = await db.collection(SOURCES_COLLECTION).where("status", "==", "pending").get();
  const pending = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((source) => source.extractedVersion !== source.version)
    .sort((a, b) => a.path.localeCompare(b.path));
  const chosen = Number.isFinite(options.limitSources) ? shuffled(pending, randomSource(options.seed)).slice(0, options.limitSources) : pending;
  return Object.fromEntries(chosen.map(({ id, name, path: sourcePath, mimeType, version }) => [id, { id, name, path: sourcePath, mimeType, version, prepared: false }]));
}

async function prepareSource(run, drive, source, options) {
  const { state } = run;
  try {
    const pdf = await fetchSourcePdf({ drive, source });
    fs.mkdirSync(path.dirname(run.pdfPath(source.id)), { recursive: true });
    fs.writeFileSync(run.pdfPath(source.id), pdf);
    source.pageCount = await pageCount(pdf);
    const all = Array.from({ length: source.pageCount }, (_, i) => i + 1);
    source.sampled = Boolean(options.pagesPerSource && options.pagesPerSource < all.length);
    const pages = source.sampled ? shuffled(all, randomSource(options.seed + source.pageCount)).slice(0, options.pagesPerSource).sort((a, b) => a - b) : all;
    fs.mkdirSync(path.dirname(run.imagePath("x")), { recursive: true });
    let previousText = null;
    for (const pageNumber of pages) {
      const key = requestId("page", source.id, pageNumber);
      const page = await renderModelPage(pdf, pageNumber);
      fs.writeFileSync(run.imagePath(key), page.image);
      const previousPageText = pageNumber > 1
        ? (pages.includes(pageNumber - 1) ? previousText : await pageText(pdf, pageNumber - 1))
        : null;
      state.pages[key] = {
        sourceId: source.id, pageNumber, width: page.width, height: page.height,
        textLayer: page.textLayer, previousPageText, stage: page.blank ? "blank" : "sort",
      };
      previousText = page.textLayer;
    }
  } catch (err) {
    source.error = err.message.slice(0, 300);
  }
  source.prepared = true;
  run.save();
}

function pendingRequests(run, stage) {
  const queued = new Set(run.state.batches.filter((b) => b.status === "submitted").flatMap((b) => b.keys));
  return Object.entries(run.state.pages)
    .filter(([key, page]) => page.stage === stage && !queued.has(key))
    .map(([key, page]) => {
      const source = run.state.sources[page.sourceId];
      const image = fs.readFileSync(run.imagePath(key));
      const params = stage === "sort"
        ? buildSortParams({ image })
        : buildExtractParams({ image, sourcePath: source.path, pageNumber: page.pageNumber, width: page.width, height: page.height, targetTypes: page.targetTypes, textLayer: page.textLayer, previousPageText: page.previousPageText });
      return { key, request: { custom_id: requestId(stage, page.sourceId, page.pageNumber), params } };
    });
}

// Submits what fits under the cap; returns false when the cap stopped it.
async function submitStage(run, client, stage, options) {
  const pending = pendingRequests(run, stage);
  const outstanding = run.state.batches.filter((b) => b.status === "submitted").reduce((sum, b) => sum + b.estimateUsd, 0);
  for (const chunk of chunkRequests(pending.map((p) => p.request))) {
    const estimateUsd = chunk.length * ESTIMATE[stage];
    if (run.state.spentUsd + outstanding + estimateUsd > options.cap) {
      console.log(`Spending cap $${options.cap} reached: $${run.state.spentUsd.toFixed(2)} spent; ${chunk.length} ${stage} requests not submitted.`);
      return false;
    }
    const id = await submitBatch(client, chunk);
    const keys = chunk.map((request) => {
      const { sourceId, pageNumber } = parseRequestId(request.custom_id);
      return requestId("page", sourceId, pageNumber);
    });
    run.state.batches.push({ id, stage, keys, estimateUsd, status: "submitted" });
    run.save();
    console.log(`Submitted ${stage} batch ${id}: ${chunk.length} pages`);
  }
  return true;
}

async function writeQuestions({ run, bucket, db, key, page, units }) {
  const source = run.state.sources[page.sourceId];
  const docs = toQuestionDocs({ source, pageNumber: page.pageNumber, width: page.width, height: page.height, units, runId: run.state.runId, model: QUESTION_BANK_MODEL });
  if (!docs.length) return 0;
  const hiRes = await renderHiResPage(fs.readFileSync(run.pdfPath(page.sourceId)), page.pageNumber);
  const batch = db.batch();
  for (const doc of docs) {
    for (const figure of doc.data.figures) {
      const png = await cropFigure(hiRes, figure.box, page.width);
      await bucket.file(figure.storagePath).save(png, { contentType: "image/png", resumable: false });
    }
    batch.set(db.collection(QUESTIONS_COLLECTION).doc(doc.id), { ...doc.data, extractedAt: admin.firestore.FieldValue.serverTimestamp() });
  }
  await batch.commit();
  return docs.length;
}

async function collectBatch(run, client, batch, { db, bucket }) {
  await waitForBatch(client, batch.id, { onPoll: (b) => console.log(`Waiting on ${batch.stage} batch ${batch.id}: ${b.request_counts.processing} processing`) });
  for (const result of await collectResults(client, batch.id)) {
    const { stage, sourceId, pageNumber } = parseRequestId(result.customId);
    const key = requestId("page", sourceId, pageNumber);
    const page = run.state.pages[key];
    if (result.type !== "succeeded") {
      Object.assign(page, { stage: "failed", error: `${result.type}${result.error ? `: ${JSON.stringify(result.error).slice(0, 200)}` : ""}` });
      continue;
    }
    try {
      const { parsed, usage } = readMessage(result.message, stage === "sort" ? SORT_MAX_TOKENS : EXTRACT_MAX_TOKENS);
      run.state.spentUsd += batchCostOf(usage, QUESTION_BANK_MODEL);
      if (stage === "sort") {
        page.targetTypes = [...new Set(parsed.types)];
        page.stage = page.targetTypes.length ? "extract" : "no_target";
      } else {
        page.questionCount = await writeQuestions({ run, bucket, db, key, page, units: parsed.units });
        page.stage = "done";
      }
    } catch (err) {
      Object.assign(page, { stage: "failed", error: err.message.slice(0, 300) });
    }
  }
  batch.status = "collected";
  run.save();
}

async function collectAll(run, client, io) {
  for (const batch of run.state.batches.filter((b) => b.status === "submitted")) await collectBatch(run, client, batch, io);
}

async function fillYearLevels(db, sourceId, runId) {
  const snapshot = await db.collection(QUESTIONS_COLLECTION).where("sourceId", "==", sourceId).where("runId", "==", runId).get();
  const level = majorityYearLevel(snapshot.docs.map((doc) => doc.get("yearLevel")));
  const missing = snapshot.docs.filter((doc) => !doc.get("yearLevel"));
  if (!level || !missing.length) return;
  const batch = db.batch();
  for (const doc of missing) batch.update(doc.ref, { yearLevel: level, yearLevelInferred: true });
  await batch.commit();
}

// A file is extracted once every one of its pages has finished; sampled files
// never are, so the full run still covers them.
async function markExtractedSources(run, db) {
  const pages = Object.values(run.state.pages);
  for (const source of Object.values(run.state.sources)) {
    if (!source.prepared || source.marked) continue;
    const own = pages.filter((page) => page.sourceId === source.id);
    if (source.error) {
      await db.collection(SOURCES_COLLECTION).doc(source.id).set({ extractionError: source.error, extractionRunId: run.state.runId }, { merge: true });
    } else if (!own.every((page) => TERMINAL_STAGES.has(page.stage))) {
      continue;
    } else if (source.sampled) {
      await fillYearLevels(db, source.id, run.state.runId);
    } else {
      await fillYearLevels(db, source.id, run.state.runId);
      await db.collection(SOURCES_COLLECTION).doc(source.id).set({
        extractedVersion: source.version,
        extractedAt: admin.firestore.FieldValue.serverTimestamp(),
        extractionRunId: run.state.runId,
        questionCount: own.reduce((sum, page) => sum + (page.questionCount || 0), 0),
        failedPages: own.filter((page) => page.stage === "failed").map((page) => page.pageNumber),
        extractionError: null,
      }, { merge: true });
    }
    source.marked = true;
  }
  run.save();
}

function summary(run) {
  const pages = Object.values(run.state.pages);
  const stages = pages.reduce((counts, page) => ({ ...counts, [page.stage]: (counts[page.stage] || 0) + 1 }), {});
  const sources = Object.values(run.state.sources);
  return {
    runId: run.state.runId,
    sources: sources.length,
    sourceErrors: sources.filter((s) => s.error).map((s) => `${s.path}: ${s.error}`),
    pages: pages.length,
    stages,
    questions: pages.reduce((sum, page) => sum + (page.questionCount || 0), 0),
    spentUsd: Number(run.state.spentUsd.toFixed(4)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.workDir, { recursive: true });
  const run = createRun(options.workDir);
  admin.initializeApp({ projectId: options.projectId, storageBucket: `${options.projectId}.firebasestorage.app` });
  const db = admin.firestore();

  if (!run.state.sources) {
    run.state.sources = await selectSources(db, options);
    run.save();
  }
  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider() });
  for (const source of Object.values(run.state.sources).filter((s) => !s.prepared)) {
    await prepareSource(run, drive, source, options);
    console.log(`Prepared ${source.path}: ${source.error || `${source.pageCount} pages`}`);
  }
  const plan = summary(run);
  console.log(JSON.stringify(plan, null, 2));

  if (!(options.commit && options.yes)) {
    const toSort = plan.stages.sort || 0;
    console.log(`Dry run: ${toSort} pages to sort, about $${(toSort * (ESTIMATE.sort + 0.3 * ESTIMATE.extract)).toFixed(2)} in all. Pass --commit --yes to run.`);
    return;
  }

  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) {
    Object.assign(keys, loadFirebaseSecrets({ secretNames: ["ANTHROPIC_API_KEY"] }));
  }
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  const client = new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY });
  const io = { db, bucket: admin.storage().bucket() };

  // Batches left from an interrupted run first, then each stage in turn.
  await collectAll(run, client, io);
  await submitStage(run, client, "sort", options);
  await collectAll(run, client, io);
  await submitStage(run, client, "extract", options);
  await collectAll(run, client, io);
  await markExtractedSources(run, db);
  console.log(JSON.stringify(summary(run), null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, randomSource, shuffled };
