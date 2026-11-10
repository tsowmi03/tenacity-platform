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
 *     [--seed=54] [--cap=100] [--concurrency=4] [--priority-only] [--firebase-secrets] \
 *     [--commit --yes]
 *
 * Without --commit --yes it only prepares pages and prints the plan: no API
 * calls and no writes. Rerunning with the same --work-dir resumes: prepared
 * files and finished pages are kept, and submitted batches are awaited.
 * --pages-per-source samples pages (the RES-58 quality check); a sampled file
 * is never marked as extracted.
 *
 * RES-58 made it fit the whole corpus (about 45,000 pages): each PDF is opened
 * once, page text lives in its own files rather than the state file, the state
 * is saved at most every few seconds, files are prepared --concurrency at a
 * time, and batches are built and submitted one slice at a time so only one
 * slice of page images is ever held in memory.
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
const { adminAppOptions, loadApiKeys } = require("./lib/questionBankAuth");

const { MAX_BATCH_BYTES, batchCostOf, collectResults, submitBatch, waitForBatch } = require("../src/questionBank/batches");
const { createDriveClient, createImpersonatedTokenProvider } = require("../src/questionBank/driveSource");
const { QUESTIONS_COLLECTION, majorityYearLevel, parseRequestId, requestId, toQuestionDocs } = require("../src/questionBank/extraction");
const { withAdminChanges } = require("../src/questionBank/adminChanges");
const { cropFigure, openPdf } = require("../src/questionBank/pages");
const { EXTRACT_MAX_TOKENS, QUESTION_BANK_MODEL, SORT_MAX_TOKENS, buildExtractParams, buildSortParams, readMessage } = require("../src/questionBank/prompts");
const { fetchSourcePdf } = require("../src/questionBank/sourceFiles");
const { SOURCES_COLLECTION } = require("../src/questionBank/sourceStore");
const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");

// Per-page batch prices measured in the RES-58 quality check, with headroom,
// used to check a batch fits under the cap before it is submitted.
const ESTIMATE = { sort: 0.0002, extract: 0.0015 };
const TERMINAL_STAGES = new Set(["blank", "no_target", "done", "failed"]);
const SAVE_EVERY_MS = 10 * 1000;
const PREPARE_TIMEOUT_MS = 20 * 60 * 1000;

function parseArgs(argv) {
  const options = { projectId: "", workDir: "", limitSources: Infinity, pagesPerSource: null, seed: 54, cap: 100, concurrency: 4, priorityOnly: false, firebaseSecrets: false, commit: false, yes: false };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--priority-only") options.priorityOnly = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else {
      const [flag, value] = arg.split(/=(.*)/s);
      const key = { "--projectId": "projectId", "--work-dir": "workDir", "--limit-sources": "limitSources", "--pages-per-source": "pagesPerSource", "--seed": "seed", "--cap": "cap", "--concurrency": "concurrency" }[flag];
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

async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

function createRun(workDir) {
  const statePath = path.join(workDir, "state.json");
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { runId: `qb-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`, spentUsd: 0, sources: null, pages: {}, batches: [] };
  let lastSaved = 0;
  // Saves at most every few seconds unless forced: with tens of thousands of
  // pages, writing the state after every page would dominate the run.
  const save = ({ force = false } = {}) => {
    if (!force && Date.now() - lastSaved < SAVE_EVERY_MS) return;
    fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state));
    fs.renameSync(`${statePath}.tmp`, statePath);
    lastSaved = Date.now();
  };
  for (const dir of ["pdf", "pages", "text"]) fs.mkdirSync(path.join(workDir, dir), { recursive: true });
  return {
    state,
    save,
    pdfPath: (id) => path.join(workDir, "pdf", `${id}.pdf`),
    imagePath: (key) => path.join(workDir, "pages", `${key}.jpg`),
    textPath: (key) => path.join(workDir, "text", `${key}.json`),
  };
}

function readText(run, key) {
  const file = run.textPath(key);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

// Years 9 and 10 come first (Tom, November 2026): a file whose path names
// Year 9 or 10 or Stage 5, the Mathletics 09 and 10 folders, or the Cambridge
// Stage 5 books.
const PRIORITY_PATH = /\b(year|yr|y)\s*(9|10)(?!\d)|stage\s*5|\/Mathletics\/(09|10)\/|CMS_NSW_S5|Past Papers\/Year (9|10)\//i;

function isPriority(source) {
  return PRIORITY_PATH.test(source.path);
}

// Pending files not yet in this run's state, e.g. papers added to Drive and
// synced after the run began.
async function selectNewSources(db, existing) {
  const snapshot = await db.collection(SOURCES_COLLECTION).where("status", "==", "pending").get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((source) => source.extractedVersion !== source.version && !existing[source.id])
    .map(({ id, name, path: sourcePath, mimeType, version }) => ({ id, name, path: sourcePath, mimeType, version, prepared: false }));
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
  let pdf;
  try {
    const buffer = await fetchSourcePdf({ drive, source });
    fs.writeFileSync(run.pdfPath(source.id), buffer);
    pdf = await openPdf(buffer);
    source.pageCount = await pdf.pageCount();
    const all = Array.from({ length: source.pageCount }, (_, i) => i + 1);
    source.sampled = Boolean(options.pagesPerSource && options.pagesPerSource < all.length);
    const pages = source.sampled ? shuffled(all, randomSource(options.seed + source.pageCount)).slice(0, options.pagesPerSource).sort((a, b) => a - b) : all;
    const chosen = new Set(pages);
    let previousText = null;
    for (const pageNumber of pages) {
      const key = requestId("page", source.id, pageNumber);
      const page = await pdf.renderModelPage(pageNumber);
      fs.writeFileSync(run.imagePath(key), page.image);
      const previousPageText = pageNumber > 1 ? (chosen.has(pageNumber - 1) ? previousText : await pdf.pageText(pageNumber - 1)) : null;
      if (page.textLayer || previousPageText) {
        fs.writeFileSync(run.textPath(key), JSON.stringify({ textLayer: page.textLayer, previousPageText }));
      }
      state.pages[key] = { sourceId: source.id, pageNumber, width: page.width, height: page.height, stage: page.blank ? "blank" : "sort" };
      previousText = page.textLayer;
    }
  } catch (err) {
    source.error = err.message.slice(0, 300);
  } finally {
    if (pdf) await pdf.close();
  }
  source.prepared = true;
  run.save();
}

function buildRequest(run, key, page, stage) {
  const source = run.state.sources[page.sourceId];
  const image = fs.readFileSync(run.imagePath(key));
  const params = stage === "sort"
    ? buildSortParams({ image })
    : buildExtractParams({ image, sourcePath: source.path, pageNumber: page.pageNumber, width: page.width, height: page.height, targetTypes: page.targetTypes, ...readText(run, key) });
  return { custom_id: requestId(stage, page.sourceId, page.pageNumber), params };
}

// Builds and submits one batch at a time, so only one batch's page images are
// in memory. Returns false when the spending cap stopped it.
async function submitStage(run, client, stage, options) {
  const queued = new Set(run.state.batches.filter((b) => b.status === "submitted").flatMap((b) => b.keys));
  const pending = Object.entries(run.state.pages).filter(([key, page]) => page.stage === stage && !queued.has(key));
  let outstanding = run.state.batches.filter((b) => b.status === "submitted").reduce((sum, b) => sum + b.estimateUsd, 0);
  let chunk = [];
  let bytes = 0;

  const flush = async () => {
    if (!chunk.length) return true;
    const estimateUsd = chunk.length * ESTIMATE[stage];
    if (run.state.spentUsd + outstanding + estimateUsd > options.cap) {
      console.log(`Spending cap $${options.cap} reached: $${run.state.spentUsd.toFixed(2)} spent; ${stage} requests from here on are not submitted.`);
      return false;
    }
    const id = await submitBatch(client, chunk.map((entry) => entry.request));
    run.state.batches.push({ id, stage, keys: chunk.map((entry) => entry.key), estimateUsd, status: "submitted" });
    outstanding += estimateUsd;
    run.save({ force: true });
    console.log(`Submitted ${stage} batch ${id}: ${chunk.length} pages`);
    chunk = [];
    bytes = 0;
    return true;
  };

  for (const [key, page] of pending) {
    const request = buildRequest(run, key, page, stage);
    const size = Buffer.byteLength(JSON.stringify(request));
    if (chunk.length && bytes + size > (options.maxBatchBytes || MAX_BATCH_BYTES) && !(await flush())) return false;
    chunk.push({ key, request });
    bytes += size;
  }
  return flush();
}

async function writeSourceQuestions({ run, db, bucket, sourceId, entries }) {
  const source = run.state.sources[sourceId];
  const pdf = await openPdf(fs.readFileSync(run.pdfPath(sourceId)));
  try {
    for (const { page, units } of entries) {
      const docs = toQuestionDocs({ source, pageNumber: page.pageNumber, width: page.width, height: page.height, units, runId: run.state.runId, model: QUESTION_BANK_MODEL });
      if (docs.length) {
        const hiRes = await pdf.renderHiResPage(page.pageNumber);
        const batch = db.batch();
        // RES-104: a re-extracted question keeps an admin's hide and corrections.
        const merged = await withAdminChanges(db, docs.map((doc) => ({ collection: QUESTIONS_COLLECTION, ...doc })));
        for (const doc of merged) {
          for (const figure of doc.data.figures) {
            if (figure.sharedFrom) continue; // its parent's crop, cut above
            const png = await cropFigure(hiRes, figure.box, page.width);
            await bucket.file(figure.storagePath).save(png, { contentType: "image/png", resumable: false });
          }
          batch.set(db.collection(QUESTIONS_COLLECTION).doc(doc.id), { ...doc.data, extractedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        await batch.commit();
      }
      page.questionCount = docs.length;
      page.stage = "done";
    }
  } finally {
    await pdf.close();
  }
}

// A network change or a slow Firestore or Storage call failed 124 pages'
// writes in the November 2026 backfill. Writes overwrite by id, so retrying is
// safe.
const WRITE_RETRY_DELAYS_MS = [5000, 20000, 60000];

async function withRetries(fn, { delays = WRITE_RETRY_DELAYS_MS, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onRetry = () => {} } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delays.length) throw err;
      onRetry(err, attempt + 1);
      await sleep(delays[attempt]);
    }
  }
}

const WRITE_ERROR = /DEADLINE_EXCEEDED|UNAVAILABLE|RST_STREAM|EADDRNOTAVAIL|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|storage\.googleapis\.com/;

/**
 * Pages whose model answer came back but could not be saved, by the batch
 * that holds the answer. Batch results stay available for 29 days, so they are
 * saved again from there without paying for them twice.
 */
function rewriteTargets(run) {
  const byBatch = new Map();
  for (const batch of run.state.batches) {
    if (batch.stage !== "extract" || batch.status !== "collected") continue;
    const keys = batch.keys.filter((key) => {
      const page = run.state.pages[key];
      return page && page.stage === "failed" && (page.writeFailed || WRITE_ERROR.test(page.error || ""));
    });
    if (keys.length) byBatch.set(batch, keys);
  }
  return byBatch;
}

async function rewriteFailedPages(run, client, io) {
  for (const [batch, keys] of rewriteTargets(run)) {
    console.log(`Saving ${keys.length} pages again from extract batch ${batch.id} (their writes failed)`);
    await collectBatch(run, client, batch, io, { onlyKeys: new Set(keys) });
  }
}

async function collectBatch(run, client, batch, { db, bucket }, { onlyKeys = null } = {}) {
  await waitForBatch(client, batch.id, {
    onPoll: (b) => console.log(`${new Date().toLocaleTimeString()} Waiting on ${batch.stage} batch ${batch.id}: ${b.request_counts.succeeded + b.request_counts.errored} done, ${b.request_counts.processing} processing`),
  });
  // Extract results are grouped by file so each PDF is opened once for its
  // high-resolution crops.
  const extracted = new Map();
  for (const result of await collectResults(client, batch.id)) {
    const { stage, sourceId, pageNumber } = parseRequestId(result.customId);
    const key = requestId("page", sourceId, pageNumber);
    if (onlyKeys && !onlyKeys.has(key)) continue;
    const page = run.state.pages[key];
    if (result.type !== "succeeded") {
      Object.assign(page, { stage: "failed", error: `${result.type}${result.error ? `: ${JSON.stringify(result.error).slice(0, 200)}` : ""}` });
      continue;
    }
    try {
      const { parsed, usage } = readMessage(result.message, stage === "sort" ? SORT_MAX_TOKENS : EXTRACT_MAX_TOKENS);
      if (!onlyKeys) run.state.spentUsd += batchCostOf(usage, QUESTION_BANK_MODEL);
      if (stage === "sort") {
        page.targetTypes = [...new Set(parsed.types)];
        page.stage = page.targetTypes.length ? "extract" : "no_target";
      } else {
        if (!extracted.has(sourceId)) extracted.set(sourceId, []);
        extracted.get(sourceId).push({ page, units: parsed.units });
      }
    } catch (err) {
      Object.assign(page, { stage: "failed", error: err.message.slice(0, 300) });
    }
  }
  let written = 0;
  for (const [sourceId, entries] of extracted) {
    try {
      await withRetries(() => writeSourceQuestions({ run, db, bucket, sourceId, entries }), {
        onRetry: (err, attempt) => console.log(`  Retrying ${run.state.sources[sourceId].path} (attempt ${attempt + 1}): ${err.message.slice(0, 120)}`),
      });
    } catch (err) {
      for (const { page } of entries) if (page.stage !== "done") Object.assign(page, { stage: "failed", writeFailed: true, error: err.message.slice(0, 300) });
    }
    written += 1;
    const questions = entries.reduce((sum, { page }) => sum + (page.questionCount || 0), 0);
    console.log(`  Wrote ${questions} questions from ${run.state.sources[sourceId].path} (${written}/${extracted.size} files in this batch)`);
    run.save();
  }
  batch.status = "collected";
  run.save({ force: true });
  console.log(`Collected ${batch.stage} batch ${batch.id}. ${progressLine(run)}`);
}

// One line on where the whole run stands, printed after every batch.
function progressLine(run) {
  const pages = Object.values(run.state.pages);
  const count = (stage) => pages.filter((page) => page.stage === stage).length;
  const batches = run.state.batches;
  return `Run so far: ${pages.length} pages (${count("sort")} to sort, ${count("extract")} to extract, ` +
    `${count("done")} done, ${count("no_target")} no target, ${count("blank")} blank, ${count("failed")} failed), ` +
    `${pages.reduce((sum, page) => sum + (page.questionCount || 0), 0)} questions, ` +
    `${batches.filter((b) => b.status === "collected").length}/${batches.length} batches collected, $${run.state.spentUsd.toFixed(2)} spent.`;
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
  const pagesBySource = new Map();
  for (const page of Object.values(run.state.pages)) {
    if (!pagesBySource.has(page.sourceId)) pagesBySource.set(page.sourceId, []);
    pagesBySource.get(page.sourceId).push(page);
  }
  for (const source of Object.values(run.state.sources)) {
    if (!source.prepared || source.marked) continue;
    const own = pagesBySource.get(source.id) || [];
    if (source.error) {
      await db.collection(SOURCES_COLLECTION).doc(source.id).set({ extractionError: source.error, extractionRunId: run.state.runId }, { merge: true });
    } else if (!own.every((page) => TERMINAL_STAGES.has(page.stage))) {
      continue;
    } else {
      await fillYearLevels(db, source.id, run.state.runId);
      if (!source.sampled) {
        await db.collection(SOURCES_COLLECTION).doc(source.id).set({
          extractedVersion: source.version,
          extractedAt: admin.firestore.FieldValue.serverTimestamp(),
          extractionRunId: run.state.runId,
          questionCount: own.reduce((sum, page) => sum + (page.questionCount || 0), 0),
          failedPages: own.filter((page) => page.stage === "failed").map((page) => page.pageNumber),
          extractionError: null,
        }, { merge: true });
      }
    }
    source.marked = true;
    run.save();
  }
  run.save({ force: true });
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
  admin.initializeApp(adminAppOptions({ projectId: options.projectId, storageBucket: `${options.projectId}.firebasestorage.app` }));
  const db = admin.firestore();

  if (!run.state.sources) {
    run.state.sources = await selectSources(db, options);
  } else if (!Number.isFinite(options.limitSources)) {
    const added = await selectNewSources(db, run.state.sources);
    for (const source of added) run.state.sources[source.id] = source;
    if (added.length) console.log(`Added ${added.length} files synced since this run began`);
  }
  run.save({ force: true });
  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider() });
  const toPrepare = Object.values(run.state.sources)
    .filter((s) => !s.prepared && (!options.priorityOnly || isPriority(s)))
    .sort((a, b) => Number(isPriority(b)) - Number(isPriority(a)));
  if (options.priorityOnly) console.log(`Year 9-10 pass: ${toPrepare.length} files to prepare; the rest wait for a run without --priority-only`);
  const started = Date.now();
  let prepared = 0;
  await mapWithConcurrency(toPrepare, options.concurrency, async (source) => {
    // A download or render can stall without ever settling; on its own that
    // left nothing for Node to wait on, so the run exited quietly before
    // sending anything (RES-58, November 2026). The timer keeps the run alive
    // and moves on; the file stays unprepared and is retried next run.
    let timer;
    const outcome = await Promise.race([
      prepareSource(run, drive, source, options).then(() => "done"),
      new Promise((resolve) => { timer = setTimeout(() => resolve("timeout"), PREPARE_TIMEOUT_MS); }),
    ]);
    clearTimeout(timer);
    if (outcome === "timeout") {
      console.log(`Timed out preparing ${source.path} after ${PREPARE_TIMEOUT_MS / 60000} min; it will be retried next run`);
      return;
    }
    prepared += 1;
    const minutes = ((Date.now() - started) / 60000).toFixed(1);
    console.log(`Prepared ${prepared}/${toPrepare.length} (${minutes} min) ${source.path}: ${source.error || `${source.pageCount} pages`}`);
  });
  run.save({ force: true });
  const plan = summary(run);
  console.log(JSON.stringify(plan, null, 2));

  if (!(options.commit && options.yes)) {
    const toSort = plan.stages.sort || 0;
    console.log(`Dry run: ${toSort} pages to sort, about $${(toSort * (ESTIMATE.sort + 0.35 * ESTIMATE.extract)).toFixed(2)} in all. Pass --commit --yes to run.`);
    return;
  }

  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) {
    Object.assign(keys, await loadApiKeys(["ANTHROPIC_API_KEY"], { loadFirebaseSecrets }));
  }
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  const client = new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY });
  const io = { db, bucket: admin.storage().bucket() };

  // Batches left from an interrupted run first, then each stage in turn.
  await collectAll(run, client, io);
  await rewriteFailedPages(run, client, io);
  await submitStage(run, client, "sort", options);
  await collectAll(run, client, io);
  await submitStage(run, client, "extract", options);
  await collectAll(run, client, io);
  await markExtractedSources(run, db);
  console.log(JSON.stringify(summary(run), null, 2));
}

if (require.main === module) {
  let finished = false;
  // If Node runs out of things to wait on before main() settles, it exits
  // with code 0 and a chained command would carry on as if the run had
  // finished. Fail loudly instead.
  process.on("exit", (code) => {
    if (!finished && code === 0) {
      console.error("Stopped before finishing: something never completed. Rerun with the same --work-dir to resume.");
      process.exitCode = 1;
    }
  });
  main()
    .then(() => { finished = true; })
    .catch((err) => {
      finished = true;
      console.error(err);
      process.exitCode = 1;
    });
}

module.exports = { createRun, isPriority, parseArgs, randomSource, rewriteTargets, shuffled, submitStage, withRetries, writeSourceQuestions };
