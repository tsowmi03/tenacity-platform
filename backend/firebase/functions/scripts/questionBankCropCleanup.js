"use strict";

/*
 * RES-107: cleans every question bank diagram crop so it is black, white and
 * grey with every label kept, and writes the result to the bank. The test
 * script (questionBankCropCleanupTest.js) runs the same clean-up on a sample.
 *
 *   select    list every crop a live question uses (reads Firestore only)
 *   classify  one Haiku batch call per crop: what is wrong with it
 *   clean     remove tints, re-render slides, erase stray marks, turn grey
 *   verify    one Haiku batch call per cleaned crop: compare with the original
 *   write     save passed crops as new files and point their questions at them;
 *             hide questions whose crop cannot be used
 *   report    counts, and a gallery of a sample of each outcome
 *   rollback  undo every write this clean-up made, from Firestore alone
 *   all       classify, clean, verify and write, one after another
 *
 * Usage:
 *   node scripts/questionBankCropCleanup.js --stage=select --work-dir=DIR [--projectId=ID]
 *   node scripts/questionBankCropCleanup.js --stage=all --work-dir=DIR --limit=2000 \
 *     --cap=5 --firebase-secrets --commit --yes
 *
 * classify, verify, write and rollback print what they would do and stop
 * unless given --commit --yes. --no-hides makes write skip the hides, so they
 * can be written later or not at all. --limit is how many more crops classify takes
 * on, in a fixed random order, so a run can go in waves. --cap (USD, default
 * 1) is the most the model calls may have cost so far, checked before a
 * batch is sent. Every stage resumes: a sent batch is awaited, not sent again,
 * and a finished crop is skipped.
 *
 * What a write changes: a crop that passed verify is saved beside the original
 * (x_1.png becomes x_1_bw1.png) and each figure that used it gets the new
 * path, with the old one in originalStoragePath. A crop that cannot be used
 * (handwriting, wrong symbols, unusable) hides its live questions with hiddenBy
 * res-107-crop-cleanup. A crop that failed verify is left as it is. Originals
 * are never touched. See src/questionBank/cropCleanupWrites.js.
 *
 * Auth: Application Default Credentials for Firestore and Storage, the Token
 * Creator role on the Drive account for slide sources, and ANTHROPIC_API_KEY
 * or, with --firebase-secrets, production Secret Manager.
 */

process.env.POSTHOG_PROJECT_TOKEN = "";

const fs = require("node:fs");
const path = require("node:path");

const { batchCostOf, collectResults, submitBatch, waitForBatch } = require("../src/questionBank/batches");
const {
  CLASSIFY_MAX_TOKENS,
  VERIFY_MAX_TOKENS,
  buildClassifyParams,
  buildVerifyParams,
  modelImage,
  verdict,
} = require("../src/questionBank/cropCleanup");
const { CLEANUP_ACTOR, cleanedPathOf, planQuestionWrite, planRollback } = require("../src/questionBank/cropCleanupWrites");
const { QUESTION_BANK_MODEL, readMessage } = require("../src/questionBank/prompts");
const {
  PRODUCTION_PROJECT,
  anthropicClient,
  cleanImage,
  firebase,
  mapWithConcurrency,
  planFor,
  slideSources,
  usageOf,
} = require("./lib/cropCleanupRun");

const QUESTIONS_COLLECTION = "questionBank";
const STAGES = ["select", "classify", "clean", "verify", "write", "report", "rollback", "all"];
// About twice the measured cost per call (RES-107 test runs), so the cap check
// errs on the safe side.
const ESTIMATE = { classify: 0.0003, verify: 0.0004 };
// Requests per batch: small enough to hold in memory with their images.
const BATCH_SIZE = 2000;
const DOWNLOAD_CONCURRENCY = 16;
const CLEAN_CONCURRENCY = 4;
const WRITE_CONCURRENCY = 8;
const SCAN_PAGE = 5000;
const GALLERY_PER_OUTCOME = 40;

function parseArgs(argv) {
  const options = { stage: "", workDir: "", projectId: PRODUCTION_PROJECT, cap: 1, limit: 0, seed: 107, firebaseSecrets: false, hides: true, commit: false, yes: false };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg === "--no-hides") options.hides = false;
    else {
      const [flag, value] = arg.split(/=(.*)/s);
      const key = { "--stage": "stage", "--work-dir": "workDir", "--projectId": "projectId", "--cap": "cap", "--limit": "limit", "--seed": "seed" }[flag];
      if (!key || value === undefined) throw new Error(`Unknown argument: ${arg}`);
      options[key] = ["cap", "limit", "seed"].includes(key) ? Number(value) : value;
    }
  }
  if (!STAGES.includes(options.stage)) throw new Error(`--stage must be one of ${STAGES.join(", ")}`);
  if (!options.workDir && options.stage !== "rollback") throw new Error("--work-dir is required");
  for (const key of ["cap", "limit", "seed"]) if (!Number.isFinite(options[key]) || options[key] < 0) throw new Error(`--${key} must be a number of at least 0`);
  return options;
}

const confirmed = (options) => options.commit && options.yes;

function randomSource(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One entry per crop file a live question uses, from every bank record. A
 * crop shared by several parts (sharedFrom) is one entry listing all their
 * questions; its details come from the record that owns it. Hidden questions
 * are listed so their figures move with the rest, but a crop only hidden
 * questions use is left out.
 */
function cropsFromRecords(records) {
  const byPath = new Map();
  for (const { id, data } of records) {
    for (const figure of data.figures || []) {
      if (!figure.storagePath) continue;
      if (!byPath.has(figure.storagePath)) byPath.set(figure.storagePath, { storagePath: figure.storagePath, questionIds: [], live: false, owner: null });
      const entry = byPath.get(figure.storagePath);
      if (!entry.questionIds.includes(id)) entry.questionIds.push(id);
      if (data.status === "live") entry.live = true;
      if (!figure.sharedFrom && (!entry.owner || (data.status === "live" && entry.owner.status !== "live"))) {
        entry.owner = {
          status: data.status,
          questionId: id,
          box: figure.box || null,
          description: figure.description || "",
          diagramType: figure.type || data.diagramType || "",
          questionText: [data.stem, data.text].filter(Boolean).join(" "),
          sourceId: data.sourceId,
          sourcePath: data.sourcePath || "",
          pageNumber: data.pageNumber,
          pageWidth: data.pageSize?.width || null,
        };
      }
    }
  }
  return [...byPath.values()]
    .filter((entry) => entry.live && entry.owner)
    .sort((a, b) => a.storagePath.localeCompare(b.storagePath))
    .map(({ storagePath, questionIds, owner }) => {
      const { status, ...details } = owner;
      return { storagePath, questionIds, ...details };
    });
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The run's files: crops.jsonl (from select), results.jsonl (one line per
 * finished step, appended, so a crash loses at most the step in hand),
 * batches.json, and the original and cleaned images.
 */
function openRun(workDir) {
  for (const dir of ["originals", "cleaned", "sources"]) fs.mkdirSync(path.join(workDir, dir), { recursive: true });
  const cropsFile = path.join(workDir, "crops.jsonl");
  const resultsFile = path.join(workDir, "results.jsonl");
  const batchesFile = path.join(workDir, "batches.json");
  const readLines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
  const crops = readLines(cropsFile);
  const byId = new Map(crops.map((crop) => [crop.id, crop]));
  for (const { id, stage, ...result } of readLines(resultsFile)) {
    const crop = byId.get(id);
    if (crop) Object.assign(crop, result, { [`${stage}Done`]: true });
  }
  const batches = fs.existsSync(batchesFile) ? JSON.parse(fs.readFileSync(batchesFile, "utf8")) : { classify: [], verify: [], spentUsd: 0 };
  return {
    crops,
    byId,
    batches,
    setCrops(list) {
      fs.writeFileSync(cropsFile, list.map((crop) => JSON.stringify(crop)).join("\n") + "\n");
      crops.splice(0, crops.length, ...list);
      byId.clear();
      for (const crop of list) byId.set(crop.id, crop);
    },
    record(crop, stage, result) {
      Object.assign(crop, result, { [`${stage}Done`]: true });
      fs.appendFileSync(resultsFile, JSON.stringify({ id: crop.id, stage, ...result }) + "\n");
    },
    saveBatches() {
      fs.writeFileSync(`${batchesFile}.tmp`, JSON.stringify(batches));
      fs.renameSync(`${batchesFile}.tmp`, batchesFile);
    },
    originalFile: (crop) => path.join(workDir, "originals", `${crop.id}.png`),
    cleanedFile: (crop) => path.join(workDir, "cleaned", `${crop.id}.png`),
    sourcesDir: path.join(workDir, "sources"),
  };
}

/** Where a crop stands. */
function outcomeOf(crop) {
  if (crop.classifyError) return "classify_error";
  if (!crop.report) return "not_classified";
  if (crop.cleanError) return "clean_error";
  if (!crop.plan) return "not_cleaned";
  if (crop.plan.outcome !== "clean") return crop.plan.outcome;
  if (crop.verifyError) return "verify_error";
  if (!crop.check) return "not_verified";
  return verdict(crop.check, crop).pass ? "passed" : "failed";
}

async function scanRecords(db, admin) {
  const records = [];
  let last = null;
  for (;;) {
    let query = db.collection(QUESTIONS_COLLECTION)
      .orderBy(admin.firestore.FieldPath.documentId())
      .select("status", "figures", "diagramType", "stem", "text", "sourceId", "sourcePath", "pageNumber", "pageSize")
      .limit(SCAN_PAGE);
    if (last) query = query.startAfter(last);
    const snapshot = await query.get();
    if (snapshot.empty) return records;
    last = snapshot.docs[snapshot.docs.length - 1];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (["live", "hidden"].includes(data.status)) records.push({ id: doc.id, data });
    }
    process.stdout.write(`\rRead ${records.length} records`);
  }
}

async function selectStage(run, options) {
  if (run.crops.length) {
    console.log(`Already selected: ${run.crops.length} crops.`);
    return;
  }
  const { admin, db } = firebase(options.projectId);
  const records = await scanRecords(db, admin);
  const crops = shuffled(cropsFromRecords(records), randomSource(options.seed)).map((crop, index) => ({ id: `k${index}`, ...crop }));
  run.setCrops(crops);
  console.log(`\n${crops.length} crops used by live questions, from ${records.length} live or hidden records.`);
}

async function download(run, bucket, crops) {
  await mapWithConcurrency(crops.filter((crop) => !fs.existsSync(run.originalFile(crop))), DOWNLOAD_CONCURRENCY, async (crop) => {
    const [png] = await bucket.file(crop.storagePath).download();
    fs.writeFileSync(`${run.originalFile(crop)}.tmp`, png);
    fs.renameSync(`${run.originalFile(crop)}.tmp`, run.originalFile(crop));
  });
}

/**
 * Sends a model stage in batches and records each result. Batches already
 * sent are awaited first; new crops are sent only once none are pending.
 */
async function runBatchStage(run, options, { name, todo, build, read, onBeforeBuild }) {
  const pending = run.batches[name].filter((batch) => !batch.collected);
  const estimate = todo.length * ESTIMATE[name];
  if (!confirmed(options)) {
    console.log(`Dry run: ${todo.length} ${name} calls, at most about $${estimate.toFixed(2)}; ${pending.length} batches pending. Spent so far: $${run.batches.spentUsd.toFixed(4)}. Pass --commit --yes to send.`);
    return;
  }
  if (!pending.length && run.batches.spentUsd + estimate > options.cap) {
    throw new Error(`${name} could cost $${estimate.toFixed(2)} with $${run.batches.spentUsd.toFixed(4)} spent, over the $${options.cap} cap`);
  }
  const client = await anthropicClient(options);
  if (!pending.length) {
    for (let start = 0; start < todo.length; start += BATCH_SIZE) {
      const chunk = todo.slice(start, start + BATCH_SIZE);
      if (onBeforeBuild) await onBeforeBuild(chunk);
      const requests = [];
      for (const crop of chunk) {
        try {
          requests.push({ custom_id: crop.id, params: await build(crop) });
        } catch (err) {
          run.record(crop, name, { [`${name}Error`]: `build: ${err.message}` });
        }
      }
      if (!requests.length) continue;
      const batch = { id: await submitBatch(client, requests), ids: requests.map((r) => r.custom_id), collected: false };
      run.batches[name].push(batch);
      run.saveBatches();
      pending.push(batch);
      console.log(`Sent ${name} batch ${batch.id}: ${requests.length} calls`);
    }
  }
  for (const batch of pending) {
    await waitForBatch(client, batch.id, { onPoll: (b) => console.log(`${batch.id}: ${JSON.stringify(b.request_counts)}`) });
    for (const result of await collectResults(client, batch.id)) {
      const crop = run.byId.get(result.customId);
      if (!crop) continue;
      if (result.type !== "succeeded") {
        run.record(crop, name, { [`${name}Error`]: result.type });
        continue;
      }
      // A truncated or refused reply is still billed; count it, then record it.
      run.batches.spentUsd += batchCostOf(usageOf(result.message), QUESTION_BANK_MODEL);
      let parsed;
      try {
        parsed = readMessage(result.message, name === "classify" ? CLASSIFY_MAX_TOKENS : VERIFY_MAX_TOKENS).parsed;
      } catch (err) {
        run.record(crop, name, { [`${name}Error`]: err.message });
        continue;
      }
      run.record(crop, name, read(crop, parsed));
    }
    batch.collected = true;
    run.saveBatches();
  }
  console.log(`${name} finished. Spent so far: $${run.batches.spentUsd.toFixed(4)}`);
}

const sentIds = (run, name) => new Set(run.batches[name].flatMap((batch) => batch.ids));

async function classifyStage(run, options) {
  const sent = sentIds(run, "classify");
  const waiting = run.crops.filter((crop) => !crop.classifyDone && !sent.has(crop.id));
  const todo = options.limit ? waiting.slice(0, options.limit) : waiting;
  const { bucket } = firebase(options.projectId);
  const modelSizes = new Map();
  await runBatchStage(run, options, {
    name: "classify",
    todo,
    onBeforeBuild: (chunk) => download(run, bucket, chunk),
    build: async (crop) => {
      const { image, width, height } = await modelImage(fs.readFileSync(run.originalFile(crop)));
      modelSizes.set(crop.id, { width, height });
      return buildClassifyParams({ image, width, height, description: crop.description, questionText: crop.questionText });
    },
    // modelSize is recomputed after a restart, from the same original.
    read: (crop, report) => ({ report, modelSize: modelSizes.get(crop.id) || null }),
  });
}

async function cleanStage(run, options) {
  const todo = run.crops.filter((crop) => crop.report && !crop.cleanDone);
  if (!todo.length) {
    console.log("Nothing to clean.");
    return;
  }
  const { bucket } = firebase(options.projectId);
  await download(run, bucket, todo);
  const cleanOne = async (crop, slides) => {
    try {
      const original = fs.readFileSync(run.originalFile(crop));
      if (!crop.modelSize) crop.modelSize = (({ width, height }) => ({ width, height }))(await modelImage(original));
      const result = await cleanImage(crop, original, slides);
      if (result.image) fs.writeFileSync(run.cleanedFile(crop), result.image);
      const { image, ...rest } = result;
      run.record(crop, "clean", { ...rest, modelSize: crop.modelSize });
    } catch (err) {
      run.record(crop, "clean", { cleanError: err.message });
      console.log(`${crop.id} (${crop.sourcePath} p${crop.pageNumber}): ${err.message}`);
    }
  };
  const rerender = todo.filter((crop) => planFor(crop).steps.includes("rerender"));
  const rest = todo.filter((crop) => !rerender.includes(crop));
  let done = 0;
  const started = Date.now();
  const progress = () => {
    done += 1;
    if (done % 500 === 0 || done === todo.length) {
      const perCrop = (Date.now() - started) / done;
      console.log(`Cleaned ${done}/${todo.length}, about ${Math.round(perCrop * (todo.length - done) / 60000)} min left`);
    }
  };
  await mapWithConcurrency(rest, CLEAN_CONCURRENCY, async (crop) => {
    await cleanOne(crop, null);
    progress();
  });
  // Slides one deck at a time: each deck goes through LibreOffice once, then is closed.
  if (rerender.length) {
    const slides = slideSources(run.sourcesDir);
    const bySource = new Map();
    for (const crop of rerender) bySource.set(crop.sourceId, [...(bySource.get(crop.sourceId) || []), crop]);
    for (const [sourceId, crops] of bySource) {
      for (const crop of crops) {
        await cleanOne(crop, slides);
        progress();
      }
      await slides.closeSource(sourceId);
    }
  }
  console.log(JSON.stringify(tally(todo), null, 2));
}

async function verifyStage(run, options) {
  const sent = sentIds(run, "verify");
  const todo = run.crops.filter((crop) => crop.plan?.outcome === "clean" && !crop.cleanError && !crop.verifyDone && !sent.has(crop.id) && fs.existsSync(run.cleanedFile(crop)));
  await runBatchStage(run, options, {
    name: "verify",
    todo,
    build: async (crop) => buildVerifyParams({
      before: (await modelImage(fs.readFileSync(run.originalFile(crop)))).image,
      after: (await modelImage(fs.readFileSync(run.cleanedFile(crop)))).image,
      description: crop.description,
      removed: crop.erased,
    }),
    read: (crop, check) => ({ check }),
  });
}

/** Applies one crop's change to each question that uses it, in a transaction per question. */
async function writeQuestions(db, crop, change, at) {
  const counts = { updated: 0, unchanged: 0, missing: 0 };
  for (const questionId of crop.questionIds) {
    const ref = db.collection(QUESTIONS_COLLECTION).doc(questionId);
    const result = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) return "missing";
      const update = planQuestionWrite(snapshot.data(), { ...change, at });
      if (!update) return "unchanged";
      tx.update(ref, update);
      return "updated";
    });
    counts[result] += 1;
  }
  return counts;
}

async function writeStage(run, options) {
  const todo = run.crops.filter((crop) => !crop.writeDone && (outcomeOf(crop) === "passed" || (options.hides && outcomeOf(crop) === "hide")));
  const passed = todo.filter((crop) => outcomeOf(crop) === "passed");
  const hidden = todo.filter((crop) => outcomeOf(crop) === "hide");
  const questions = (crops) => new Set(crops.flatMap((crop) => crop.questionIds)).size;
  console.log(`To write: ${passed.length} cleaned crops (${questions(passed)} questions), ${hidden.length} unusable crops (up to ${questions(hidden)} questions hidden).`);
  if (!confirmed(options)) {
    console.log("Dry run: nothing written. Pass --commit --yes to write.");
    return;
  }
  const { admin, db, bucket } = firebase(options.projectId);
  const at = admin.firestore.Timestamp.now();
  let done = 0;
  await mapWithConcurrency(todo, WRITE_CONCURRENCY, async (crop) => {
    try {
      if (outcomeOf(crop) === "passed") {
        const cleanedPath = cleanedPathOf(crop.storagePath);
        await bucket.file(cleanedPath).save(fs.readFileSync(run.cleanedFile(crop)), { contentType: "image/png", resumable: false });
        const counts = await writeQuestions(db, crop, { replacements: new Map([[crop.storagePath, cleanedPath]]) }, at);
        run.record(crop, "write", { written: "cleaned", cleanedPath, writeError: null, ...counts });
      } else {
        const counts = await writeQuestions(db, crop, { hides: new Map([[crop.storagePath, crop.plan.reason]]) }, at);
        run.record(crop, "write", { written: "hidden", writeError: null, ...counts });
      }
    } catch (err) {
      console.log(`${crop.id} (${crop.storagePath}): ${err.message}`);
      // Not marked done, so the next write retries it; every step is safe to repeat.
      run.record(crop, "writeFailed", { writeError: err.message });
    }
    done += 1;
    if (done % 500 === 0 || done === todo.length) console.log(`Wrote ${done}/${todo.length}`);
  });
}

async function rollbackStage(options) {
  const { admin, db } = firebase(options.projectId);
  const changes = [];
  let last = null;
  for (;;) {
    let query = db.collection(QUESTIONS_COLLECTION).orderBy(admin.firestore.FieldPath.documentId()).select("status", "figures", "hiddenBy").limit(SCAN_PAGE);
    if (last) query = query.startAfter(last);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    last = snapshot.docs[snapshot.docs.length - 1];
    for (const doc of snapshot.docs) if (planRollback(doc.data())) changes.push(doc.ref);
  }
  console.log(`${changes.length} records to restore (cleaned figures back to originals, questions hidden by ${CLEANUP_ACTOR} back to live).`);
  if (!confirmed(options)) {
    console.log("Dry run: nothing written. Pass --commit --yes to restore.");
    return;
  }
  let restored = 0;
  await mapWithConcurrency(changes, WRITE_CONCURRENCY, async (ref) => {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const update = snapshot.exists && planRollback(snapshot.data());
      if (update) tx.update(ref, update);
    });
    restored += 1;
    if (restored % 1000 === 0) console.log(`Restored ${restored}/${changes.length}`);
  });
  console.log(`Restored ${restored} records. Cleaned files stay in Storage, unused.`);
}

function tally(crops) {
  const counts = {};
  for (const crop of crops) counts[outcomeOf(crop)] = (counts[outcomeOf(crop)] || 0) + 1;
  return counts;
}

const escapeHtml = (text) => String(text ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" })[c]);

function reportStage(run, options) {
  const counts = tally(run.crops);
  const written = run.crops.filter((crop) => crop.writeDone);
  const summary = {
    crops: run.crops.length,
    outcomes: counts,
    written: { cleaned: written.filter((c) => c.written === "cleaned").length, hidden: written.filter((c) => c.written === "hidden").length, failed: run.crops.filter((c) => c.writeError).length },
    spentUsd: Number(run.batches.spentUsd.toFixed(4)),
  };
  const random = randomSource(options.seed);
  const sections = Object.keys(counts).filter((outcome) => !outcome.startsWith("not_")).map((outcome) => {
    const sample = shuffled(run.crops.filter((crop) => outcomeOf(crop) === outcome), random).slice(0, GALLERY_PER_OUTCOME);
    const tiles = sample.map((crop) => {
      const details = [crop.diagramType, crop.plan?.reason, ...(crop.applied || []), crop.check ? verdict(crop.check, crop).failed.join(", ") : "", crop.cleanError, crop.classifyError, crop.verifyError].filter(Boolean).join(" · ");
      const after = fs.existsSync(run.cleanedFile(crop)) ? `<img loading="lazy" src="cleaned/${crop.id}.png" alt="After">` : "";
      return `<figure><div class="pair"><img loading="lazy" src="originals/${crop.id}.png" alt="Before">${after}</div><figcaption><b>${escapeHtml(crop.id)}</b> ${escapeHtml(crop.sourcePath.split("/").pop())} p${escapeHtml(crop.pageNumber)}<br>${escapeHtml(details)}</figcaption></figure>`;
    });
    return `<h2>${escapeHtml(outcome)} (${counts[outcome]}, showing ${sample.length})</h2><div class="grid">${tiles.join("")}</div>`;
  });
  const file = path.join(options.workDir, "report.html");
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Crop clean-up run</title><style>
body{font:14px system-ui;margin:24px;background:#f4f4f4;color:#222}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}
figure{margin:0;background:#fff;padding:8px;border:1px solid #ccc}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center}
.pair img{width:100%;max-height:260px;object-fit:contain;border:1px solid #ddd}figcaption{margin-top:6px;font-size:12px}
</style><h1>Crop clean-up run</h1><pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre>${sections.join("")}`);
  console.log(JSON.stringify({ report: file, ...summary }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.stage === "rollback") return rollbackStage(options);
  const run = openRun(options.workDir);
  if (options.stage === "select") return selectStage(run, options);
  if (!run.crops.length) throw new Error("No crops selected yet; run --stage=select first");
  if (["classify", "all"].includes(options.stage)) await classifyStage(run, options);
  if (["clean", "all"].includes(options.stage)) await cleanStage(run, options);
  if (["verify", "all"].includes(options.stage)) await verifyStage(run, options);
  if (["write", "all"].includes(options.stage)) await writeStage(run, options);
  if (["report", "all"].includes(options.stage)) reportStage(run, options);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { cropsFromRecords, openRun, outcomeOf, parseArgs };
