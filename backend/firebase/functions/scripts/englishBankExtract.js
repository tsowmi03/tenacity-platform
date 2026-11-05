"use strict";

/*
 * RES-66: builds the English bank from the pending files in englishBankSources
 * (RES-65), through the Message Batches API on Haiku 5.5.
 *
 *   1. prepare: download each file as a PDF (images and Word files are
 *      converted), render its pages and skip blank ones;
 *   2. extract: one call per page returns its stimuli, questions and marking
 *      guide entries (src/englishBank/schema.js);
 *   3. write: once all of a file's pages are back, its records are built
 *      (src/englishBank/records.js): passages split across pages are joined,
 *      each stimulus's page crops are cut, and guides point at their paper's
 *      questions.
 *
 * Usage:
 *   node scripts/englishBankExtract.js --projectId=tenacity-tutoring-b8eb2 \
 *     --work-dir=/tmp/eb-run [--limit-sources=40] [--pages-per-source=8] \
 *     [--seed=66] [--cap=100] [--concurrency=4] [--firebase-secrets] \
 *     [--local] [--commit --yes]
 *
 * Without --commit --yes it only prepares pages and prints the plan: no API
 * calls and no writes. --local makes the API calls but writes records and
 * crops into the work folder instead of Firestore and Storage, for the pilot
 * (RES-66) and for checking a run by eye. --pages-per-source takes a run of
 * consecutive pages from each file, so passages that cross pages are still
 * tested; a sampled file is never marked as extracted. Rerunning with the
 * same --work-dir resumes.
 *
 * Auth: as questionBankExtract.js.
 */

process.env.POSTHOG_PROJECT_TOKEN = "";

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");
const sharp = require("sharp");
const { adminAppOptions, loadApiKeys } = require("./lib/questionBankAuth");

const { MAX_BATCH_BYTES, batchCostOf, collectResults, submitBatch, waitForBatch } = require("../src/questionBank/batches");
const { createDriveClient, createImpersonatedTokenProvider } = require("../src/questionBank/driveSource");
const { openPdf } = require("../src/questionBank/pages");
const { fetchSourcePdf } = require("../src/questionBank/sourceFiles");
const { ENGLISH_BANK_MODEL, PAGE_MAX_TOKENS, buildPageParams, readMessage } = require("../src/englishBank/prompts");
const { GUIDES_COLLECTION, QUESTIONS_COLLECTION, STIMULI_COLLECTION, toGuideDocs, toPaperDocs } = require("../src/englishBank/records");
const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");

const SOURCES_COLLECTION = "englishBankSources";
// Per-page batch price with headroom (verbatim transcription makes English
// answers longer than maths ones), to check a batch fits under the cap.
const ESTIMATE_PER_PAGE = 0.004;
const TERMINAL_STAGES = new Set(["blank", "done", "failed"]);
const SAVE_EVERY_MS = 10 * 1000;
const PREPARE_TIMEOUT_MS = 20 * 60 * 1000;
const CROP_PADDING = 0.01;
const WRITE_RETRY_DELAYS_MS = [5000, 20000, 60000];

function parseArgs(argv) {
  const options = { projectId: "", workDir: "", limitSources: Infinity, pagesPerSource: null, seed: 66, cap: 100, concurrency: 4, firebaseSecrets: false, local: false, commit: false, yes: false };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--local") options.local = true;
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

// Seeded PRNG (mulberry32) so a sample can be drawn again exactly.
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

/** The pages to take from a file: all of them, or a seeded run of consecutive ones. */
function pagesToTake(pageCount, pagesPerSource, seed) {
  if (!pagesPerSource || pagesPerSource >= pageCount) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = 1 + Math.floor(randomSource(seed + pageCount)() * (pageCount - pagesPerSource + 1));
  return Array.from({ length: pagesPerSource }, (_, i) => start + i);
}

async function mapWithConcurrency(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

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

function pageKey(sourceId, pageNumber) {
  return `page_${sourceId}_p${pageNumber}`;
}

function parsePageKey(id) {
  const match = /^page_(.+)_p(\d+)$/.exec(id);
  if (!match) throw new Error(`Unrecognised request id: ${id}`);
  return { sourceId: match[1], pageNumber: Number(match[2]) };
}

function createRun(workDir) {
  const statePath = path.join(workDir, "state.json");
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { runId: `eb-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`, spentUsd: 0, sources: null, pages: {}, batches: [] };
  let lastSaved = 0;
  const save = ({ force = false } = {}) => {
    if (!force && Date.now() - lastSaved < SAVE_EVERY_MS) return;
    fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state));
    fs.renameSync(`${statePath}.tmp`, statePath);
    lastSaved = Date.now();
  };
  for (const dir of ["pdf", "pages", "text", "results", "local"]) fs.mkdirSync(path.join(workDir, dir), { recursive: true });
  return {
    state,
    save,
    workDir,
    pdfPath: (id) => path.join(workDir, "pdf", `${id}.pdf`),
    imagePath: (key) => path.join(workDir, "pages", `${key}.jpg`),
    textPath: (key) => path.join(workDir, "text", `${key}.json`),
    resultPath: (key) => path.join(workDir, "results", `${key}.json`),
  };
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

async function selectSources(db, options, existing = null) {
  const snapshot = await db.collection(SOURCES_COLLECTION).where("status", "==", "pending").get();
  const pending = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((source) => source.extractedVersion !== source.version && !(existing && existing[source.id]))
    .sort((a, b) => a.path.localeCompare(b.path));
  const chosen = Number.isFinite(options.limitSources) && !existing ? shuffled(pending, randomSource(options.seed)).slice(0, options.limitSources) : pending;
  return Object.fromEntries(chosen.map(({ id, name, path: sourcePath, mimeType, version, role, pairedWith }) => [id, { id, name, path: sourcePath, mimeType, version, role, pairedWith, prepared: false }]));
}

async function prepareSource(run, drive, source, options) {
  const { state } = run;
  let pdf;
  try {
    const buffer = await fetchSourcePdf({ drive, source });
    fs.writeFileSync(run.pdfPath(source.id), buffer);
    pdf = await openPdf(buffer);
    source.pageCount = await pdf.pageCount();
    const pages = pagesToTake(source.pageCount, options.pagesPerSource, options.seed);
    source.sampled = pages.length < source.pageCount;
    let previousText = null;
    for (const pageNumber of pages) {
      const key = pageKey(source.id, pageNumber);
      const page = await pdf.renderModelPage(pageNumber);
      fs.writeFileSync(run.imagePath(key), page.image);
      const previousPageText = pageNumber > 1 ? (previousText ?? await pdf.pageText(pageNumber - 1)) : null;
      if (page.textLayer || previousPageText) fs.writeFileSync(run.textPath(key), JSON.stringify({ textLayer: page.textLayer, previousPageText }));
      // A picture file is never blank, however little ink it has.
      const blank = page.blank && source.role !== "image";
      state.pages[key] = { sourceId: source.id, pageNumber, width: page.width, height: page.height, stage: blank ? "blank" : "extract" };
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

function buildRequest(run, key, page) {
  const source = run.state.sources[page.sourceId];
  const params = buildPageParams({
    image: fs.readFileSync(run.imagePath(key)),
    sourcePath: source.path,
    role: source.role,
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    ...(readJson(run.textPath(key)) || {}),
  });
  return { custom_id: key, params };
}

// Builds and submits one batch at a time, so only one batch's page images are
// in memory. Returns false when the spending cap stopped it.
async function submitPages(run, client, options) {
  const queued = new Set(run.state.batches.filter((b) => b.status === "submitted").flatMap((b) => b.keys));
  const pending = Object.entries(run.state.pages).filter(([key, page]) => page.stage === "extract" && !queued.has(key));
  let outstanding = run.state.batches.filter((b) => b.status === "submitted").reduce((sum, b) => sum + b.estimateUsd, 0);
  let chunk = [];
  let bytes = 0;
  const flush = async () => {
    if (!chunk.length) return true;
    const estimateUsd = chunk.length * ESTIMATE_PER_PAGE;
    if (run.state.spentUsd + outstanding + estimateUsd > options.cap) {
      console.log(`Spending cap $${options.cap} reached: $${run.state.spentUsd.toFixed(2)} spent; pages from here on are not submitted.`);
      return false;
    }
    const id = await submitBatch(client, chunk.map((entry) => entry.request));
    run.state.batches.push({ id, keys: chunk.map((entry) => entry.key), estimateUsd, status: "submitted" });
    outstanding += estimateUsd;
    run.save({ force: true });
    console.log(`Submitted batch ${id}: ${chunk.length} pages`);
    chunk = [];
    bytes = 0;
    return true;
  };
  for (const [key, page] of pending) {
    const request = buildRequest(run, key, page);
    const size = Buffer.byteLength(JSON.stringify(request));
    if (chunk.length && bytes + size > MAX_BATCH_BYTES && !(await flush())) return false;
    chunk.push({ key, request });
    bytes += size;
  }
  return flush();
}

async function collectBatch(run, client, batch) {
  await waitForBatch(client, batch.id, {
    onPoll: (b) => console.log(`${new Date().toLocaleTimeString()} Waiting on batch ${batch.id}: ${b.request_counts.succeeded + b.request_counts.errored} done, ${b.request_counts.processing} processing`),
  });
  for (const result of await collectResults(client, batch.id)) {
    const key = result.customId;
    const page = run.state.pages[key];
    if (!page) continue;
    if (result.type !== "succeeded") {
      Object.assign(page, { stage: "failed", error: `${result.type}${result.error ? `: ${JSON.stringify(result.error).slice(0, 200)}` : ""}` });
      continue;
    }
    try {
      const { parsed, usage } = readMessage(result.message, PAGE_MAX_TOKENS);
      run.state.spentUsd += batchCostOf(usage, ENGLISH_BANK_MODEL);
      fs.writeFileSync(run.resultPath(key), JSON.stringify(parsed));
      Object.assign(page, { stage: "done", pageKind: parsed.pageKind, stimuli: parsed.stimuli.length, questions: parsed.questions.length, guideEntries: parsed.guideEntries.length });
    } catch (err) {
      Object.assign(page, { stage: "failed", error: err.message.slice(0, 300) });
    }
  }
  batch.status = "collected";
  run.save({ force: true });
  console.log(`Collected batch ${batch.id}. ${progressLine(run)}`);
}

function progressLine(run) {
  const pages = Object.values(run.state.pages);
  const count = (stage) => pages.filter((page) => page.stage === stage).length;
  const sum = (field) => pages.reduce((total, page) => total + (page[field] || 0), 0);
  return `Run so far: ${pages.length} pages (${count("extract")} to extract, ${count("done")} done, ${count("blank")} blank, ${count("failed")} failed), ` +
    `${sum("stimuli")} stimulus pieces, ${sum("questions")} questions, ${sum("guideEntries")} guide entries, $${run.state.spentUsd.toFixed(2)} spent.`;
}

/** A stimulus crop from a high-resolution page render: plain, padded, never cleaned (text may touch its edges). */
async function cropRegion(hiRes, box, modelWidth) {
  const meta = await sharp(hiRes).metadata();
  const scale = meta.width / modelWidth;
  const pad = Math.round(meta.width * CROP_PADDING);
  const left = Math.max(0, Math.round(box.x0 * scale) - pad);
  const top = Math.max(0, Math.round(box.y0 * scale) - pad);
  const width = Math.min(meta.width - left, Math.round((box.x1 - box.x0) * scale) + 2 * pad);
  const height = Math.min(meta.height - top, Math.round((box.y1 - box.y0) * scale) + 2 * pad);
  return sharp(hiRes).extract({ left, top, width, height }).png().toBuffer();
}

function sourcePages(run, sourceId) {
  return Object.entries(run.state.pages)
    .filter(([, page]) => page.sourceId === sourceId)
    .map(([key, page]) => ({ key, ...page }));
}

/** Builds a finished file's records and writes them, with its stimulus crops. */
async function writeSource(run, source, { db, bucket, local }) {
  const pages = sourcePages(run, source.id)
    .filter((page) => page.stage === "done")
    .map((page) => ({ pageNumber: page.pageNumber, width: page.width, height: page.height, result: readJson(run.resultPath(page.key)) }));
  const meta = { runId: run.state.runId, model: ENGLISH_BANK_MODEL };
  const isGuide = source.role === "guide";
  const paper = isGuide ? { stimuli: [], questions: [], droppedTechniques: 0, withheldVisuals: 0 } : toPaperDocs({ source, pages, ...meta });
  // A guide's entries point at its paper's questions; a paper that carries its
  // own marking guide is linked to itself.
  const guides = toGuideDocs({ source, paperSourceId: isGuide ? source.pairedWith : source.id, pages, ...meta });

  const crops = [];
  if (paper.stimuli.length) {
    const pdf = await openPdf(fs.readFileSync(run.pdfPath(source.id)));
    try {
      const hiResByPage = new Map();
      for (const doc of paper.stimuli) {
        for (const crop of doc.data.pageCrops) {
          if (!hiResByPage.has(crop.pageNumber)) hiResByPage.set(crop.pageNumber, await pdf.renderHiResPage(crop.pageNumber));
          crops.push({ storagePath: crop.storagePath, png: await cropRegion(hiResByPage.get(crop.pageNumber), crop.box, crop.pageSize.width) });
        }
      }
    } finally {
      await pdf.close();
    }
  }

  const records = [
    ...paper.stimuli.map((doc) => ({ collection: STIMULI_COLLECTION, ...doc })),
    ...paper.questions.map((doc) => ({ collection: QUESTIONS_COLLECTION, ...doc })),
    ...guides.map((doc) => ({ collection: GUIDES_COLLECTION, ...doc })),
  ];
  if (local) {
    const dir = path.join(run.workDir, "local", source.id);
    fs.mkdirSync(path.join(dir, "crops"), { recursive: true });
    fs.writeFileSync(path.join(dir, "records.json"), JSON.stringify({ source, records }, null, 2));
    for (const crop of crops) fs.writeFileSync(path.join(dir, "crops", path.basename(crop.storagePath)), crop.png);
  } else {
    for (const crop of crops) await bucket.file(crop.storagePath).save(crop.png, { contentType: "image/png", resumable: false });
    for (let start = 0; start < records.length; start += 400) {
      const batch = db.batch();
      for (const record of records.slice(start, start + 400)) {
        batch.set(db.collection(record.collection).doc(record.id), { ...record.data, extractedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      await batch.commit();
    }
  }
  return { stimuli: paper.stimuli.length, questions: paper.questions.length, guideEntries: guides.length, droppedTechniques: paper.droppedTechniques, withheldVisuals: paper.withheldVisuals };
}

// A file is written once every one of its pages has finished. A sampled file
// is written (for checking) but never marked as extracted, so the full run
// still covers it.
async function writeFinishedSources(run, io) {
  for (const source of Object.values(run.state.sources)) {
    if (!source.prepared || source.written) continue;
    const own = sourcePages(run, source.id);
    if (source.error) {
      if (!io.local) await io.db.collection(SOURCES_COLLECTION).doc(source.id).set({ extractionError: source.error, extractionRunId: run.state.runId }, { merge: true });
      source.written = true;
      continue;
    }
    if (!own.every((page) => TERMINAL_STAGES.has(page.stage))) continue;
    try {
      const counts = await withRetries(() => writeSource(run, source, io), {
        onRetry: (err, attempt) => console.log(`  Retrying ${source.path} (attempt ${attempt + 1}): ${err.message.slice(0, 120)}`),
      });
      Object.assign(source, counts, { written: true });
      if (!io.local && !source.sampled) {
        await io.db.collection(SOURCES_COLLECTION).doc(source.id).set({
          extractedVersion: source.version,
          extractedAt: admin.firestore.FieldValue.serverTimestamp(),
          extractionRunId: run.state.runId,
          ...counts,
          failedPages: own.filter((page) => page.stage === "failed").map((page) => page.pageNumber),
          extractionError: null,
        }, { merge: true });
      }
      console.log(`  Wrote ${source.path}: ${counts.stimuli} stimuli, ${counts.questions} questions, ${counts.guideEntries} guide entries`);
    } catch (err) {
      source.writeError = err.message.slice(0, 300);
      console.log(`  FAILED writing ${source.path}: ${source.writeError}`);
    }
    run.save();
  }
  run.save({ force: true });
}

function summary(run) {
  const pages = Object.values(run.state.pages);
  const sources = Object.values(run.state.sources);
  const sum = (field) => sources.reduce((total, source) => total + (source[field] || 0), 0);
  return {
    runId: run.state.runId,
    sources: sources.length,
    sourceErrors: sources.filter((s) => s.error || s.writeError).map((s) => `${s.path}: ${s.error || s.writeError}`),
    pages: pages.length,
    stages: pages.reduce((counts, page) => ({ ...counts, [page.stage]: (counts[page.stage] || 0) + 1 }), {}),
    failedPages: pages.filter((page) => page.stage === "failed").map((page) => `${run.state.sources[page.sourceId]?.path} p${page.pageNumber}: ${page.error}`),
    stimuli: sum("stimuli"),
    questions: sum("questions"),
    guideEntries: sum("guideEntries"),
    droppedTechniques: sum("droppedTechniques"),
    withheldVisuals: sum("withheldVisuals"),
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
    const added = await selectSources(db, options, run.state.sources);
    Object.assign(run.state.sources, added);
    if (Object.keys(added).length) console.log(`Added ${Object.keys(added).length} files synced since this run began`);
  }
  run.save({ force: true });

  const drive = createDriveClient({ getAccessToken: createImpersonatedTokenProvider() });
  const toPrepare = Object.values(run.state.sources).filter((s) => !s.prepared);
  const started = Date.now();
  let prepared = 0;
  await mapWithConcurrency(toPrepare, options.concurrency, async (source) => {
    let timer;
    const outcome = await Promise.race([
      prepareSource(run, drive, source, options).then(() => "done"),
      new Promise((resolve) => { timer = setTimeout(() => resolve("timeout"), PREPARE_TIMEOUT_MS); }),
    ]);
    clearTimeout(timer);
    if (outcome === "timeout") {
      console.log(`Timed out preparing ${source.path}; it will be retried next run`);
      return;
    }
    prepared += 1;
    console.log(`Prepared ${prepared}/${toPrepare.length} (${((Date.now() - started) / 60000).toFixed(1)} min) ${source.path}: ${source.error || `${source.pageCount} pages`}`);
  });
  run.save({ force: true });
  const plan = summary(run);
  console.log(JSON.stringify({ ...plan, failedPages: plan.failedPages.length }, null, 2));

  if (!(options.commit && options.yes)) {
    const toExtract = plan.stages.extract || 0;
    console.log(`Dry run: ${toExtract} pages to extract, at most about $${(toExtract * ESTIMATE_PER_PAGE).toFixed(2)}. Pass --commit --yes to run.`);
    return;
  }

  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) Object.assign(keys, await loadApiKeys(["ANTHROPIC_API_KEY"], { loadFirebaseSecrets }));
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing; set it locally or pass --firebase-secrets");
  const client = new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY });
  const io = { db, bucket: admin.storage().bucket(), local: options.local };

  for (const batch of run.state.batches.filter((b) => b.status === "submitted")) await collectBatch(run, client, batch);
  await submitPages(run, client, options);
  for (const batch of run.state.batches.filter((b) => b.status === "submitted")) await collectBatch(run, client, batch);
  await writeFinishedSources(run, io);
  console.log(JSON.stringify(summary(run), null, 2));
}

if (require.main === module) {
  let finished = false;
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

module.exports = { pageKey, pagesToTake, parseArgs, parsePageKey, randomSource, summary, withRetries };
