"use strict";

/*
 * RES-107: tries the diagram clean-up on a sample of bank crops and builds a
 * before-and-after gallery, so the output can be judged before the whole bank
 * is touched. It only ever reads Firestore, Storage and Drive; everything it
 * makes stays in --work-dir.
 *
 *   select    pick the test set and download its crops (no model calls)
 *   classify  one Haiku batch call per crop: what is wrong with it
 *   clean     remove tints, re-render slides, erase stray marks, turn grey (no model calls)
 *   verify    one Haiku batch call per cleaned crop: compare with the original
 *   report    write gallery.html (no model calls)
 *
 * Usage:
 *   node scripts/questionBankCropCleanupTest.js --stage=select --work-dir=/tmp/qb-clean
 *   node scripts/questionBankCropCleanupTest.js --stage=classify --work-dir=/tmp/qb-clean \
 *     [--cap=1] [--firebase-secrets] [--commit --yes]
 *
 * classify and verify print their plan and stop unless given --commit --yes.
 * --flagged-only limits select to the crops admins have flagged. Rerunning a
 * stage resumes it: a submitted batch is awaited, not sent again.
 *
 * Auth: Application Default Credentials for Firestore and Storage, the Token
 * Creator role on the Drive account for slide sources, and ANTHROPIC_API_KEY
 * or, with --firebase-secrets, production Secret Manager.
 */

process.env.POSTHOG_PROJECT_TOKEN = "";

const fs = require("node:fs");
const path = require("node:path");

const { batchCostOf, chunkRequests, collectResults, submitBatch, waitForBatch } = require("../src/questionBank/batches");
const {
  CLASSIFY_MAX_TOKENS,
  VERIFY_MAX_TOKENS,
  buildClassifyParams,
  buildVerifyParams,
  cropMetrics,
  modelImage,
  verdict,
} = require("../src/questionBank/cropCleanup");
const { QUESTION_BANK_MODEL, readMessage } = require("../src/questionBank/prompts");
const {
  PRODUCTION_PROJECT,
  SLIDE_EXTENSIONS,
  anthropicClient,
  cleanImage,
  extensionOfPath,
  firebase: firebaseFor,
  mapWithConcurrency,
  planFor,
  slideSources,
  usageOf,
} = require("./lib/cropCleanupRun");

const QUESTIONS_COLLECTION = "questionBank";
const FLAGS_COLLECTION = "questionBankFlags";
// Measured prices would be lower; these are deliberately high, to check a batch
// fits under the cap before it is sent.
const ESTIMATE = { classify: 0.0006, verify: 0.001 };
const QUOTAS = { slides: 150, colour: 250, stray: 50, control: 50 };
// PDF crops measured to fill the colour, stray and control groups.
const PDF_CANDIDATES = 2500;
const DOWNLOAD_CONCURRENCY = 12;

function parseArgs(argv) {
  const options = { stage: "", workDir: "", projectId: PRODUCTION_PROJECT, cap: 1, seed: 107, flaggedOnly: false, firebaseSecrets: false, commit: false, yes: false };
  for (const arg of argv) {
    if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--flagged-only") options.flaggedOnly = true;
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else {
      const [flag, value] = arg.split(/=(.*)/s);
      const key = { "--stage": "stage", "--work-dir": "workDir", "--projectId": "projectId", "--cap": "cap", "--seed": "seed" }[flag];
      if (!key || value === undefined) throw new Error(`Unknown argument: ${arg}`);
      options[key] = ["cap", "seed"].includes(key) ? Number(value) : value;
    }
  }
  if (!["select", "classify", "clean", "verify", "report"].includes(options.stage)) throw new Error("--stage must be select, classify, clean, verify or report");
  if (!options.workDir) throw new Error("--work-dir is required");
  return options;
}

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

/**
 * Splits measured candidates into the test set's groups. Flagged crops always
 * go in, on top of the quotas; each crop lands in one group only.
 */
function chooseTestSet({ flagged, slides, measured, random, quotas = QUOTAS }) {
  const used = new Set(flagged.map((c) => c.storagePath));
  const take = (list, count, group) => {
    const picked = [];
    for (const crop of list) {
      if (picked.length >= count) break;
      if (used.has(crop.storagePath)) continue;
      used.add(crop.storagePath);
      picked.push({ ...crop, group });
    }
    return picked;
  };
  const inRandomOrder = shuffled(measured, random);
  const colour = take(inRandomOrder.filter((c) => c.metrics.white < 0.5 || c.metrics.colour > 0.1), quotas.colour, "colour");
  const byEdgeInk = [...inRandomOrder].sort((a, b) => b.metrics.edgeInk - a.metrics.edgeInk);
  const pastPapers = inRandomOrder.filter((c) => /past papers/i.test(c.sourcePath));
  const strayShare = Math.round(quotas.stray * 0.7);
  const stray = [...take(byEdgeInk, strayShare, "stray"), ...take(pastPapers, quotas.stray - strayShare, "stray")];
  const control = take(inRandomOrder.filter((c) => c.metrics.white > 0.9 && c.metrics.colour < 0.01 && c.metrics.edgeInk < 0.005), quotas.control, "control");
  const slideCrops = take(shuffled(slides, random), quotas.slides, "slides");
  return [...flagged.map((c) => ({ ...c, group: "flagged" })), ...slideCrops, ...colour, ...stray, ...control];
}

function openRun(workDir) {
  for (const dir of ["crops", "cleaned", "sources"]) fs.mkdirSync(path.join(workDir, dir), { recursive: true });
  const file = path.join(workDir, "state.json");
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { crops: [], batches: { classify: [], verify: [] }, spentUsd: 0 };
  const save = () => {
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 1));
    fs.renameSync(`${file}.tmp`, file);
  };
  return { state, save, cropFile: (crop) => path.join(workDir, "crops", `${crop.id}.png`), cleanedFile: (crop) => path.join(workDir, "cleaned", `${crop.id}.png`) };
}

function firebase(options) {
  return firebaseFor(options.projectId);
}

function cropsOf(id, data) {
  return (data.figures || [])
    .filter((figure) => figure.storagePath && !figure.sharedFrom)
    .map((figure) => ({
      questionId: id,
      storagePath: figure.storagePath,
      box: figure.box || null,
      description: figure.description || "",
      diagramType: figure.type || data.diagramType || "",
      questionText: [data.stem, data.text].filter(Boolean).join(" "),
      sourceId: data.sourceId,
      sourcePath: data.sourcePath || "",
      pageNumber: data.pageNumber,
      pageWidth: data.pageSize?.width || null,
    }));
}

async function flaggedCrops(db) {
  const flags = await db.collection(FLAGS_COLLECTION).where("status", "==", "open").get();
  const ids = [...new Set(flags.docs.map((d) => d.data()).filter((f) => ["crop", "text"].includes(f.reason)).map((f) => f.questionId))];
  const crops = [];
  for (const id of ids) {
    const doc = await db.collection(QUESTIONS_COLLECTION).doc(id).get();
    if (doc.exists && doc.data().status === "live") crops.push(...cropsOf(id, doc.data()));
  }
  return crops;
}

async function liveCrops(db, admin) {
  const crops = [];
  let last = null;
  for (;;) {
    let query = db.collection(QUESTIONS_COLLECTION)
      .orderBy(admin.firestore.FieldPath.documentId())
      .select("status", "figures", "diagramType", "stem", "text", "sourceId", "sourcePath", "pageNumber", "pageSize")
      .limit(5000);
    if (last) query = query.startAfter(last);
    const snapshot = await query.get();
    if (snapshot.empty) return crops;
    last = snapshot.docs[snapshot.docs.length - 1];
    for (const doc of snapshot.docs) if (doc.data().status === "live") crops.push(...cropsOf(doc.id, doc.data()));
  }
}

async function selectStage(ctx, options) {
  if (ctx.state.crops.length) {
    console.log(`Test set already chosen: ${ctx.state.crops.length} crops.`);
    return;
  }
  const { admin, db, bucket } = firebase(options);
  const flagged = await flaggedCrops(db);
  let chosen = flagged.map((c) => ({ ...c, group: "flagged" }));
  if (!options.flaggedOnly) {
    const random = randomSource(options.seed);
    const all = await liveCrops(db, admin);
    const slides = all.filter((c) => SLIDE_EXTENSIONS.has(extensionOfPath(c.sourcePath)));
    const candidates = shuffled(all.filter((c) => extensionOfPath(c.sourcePath) === "pdf"), random).slice(0, PDF_CANDIDATES);
    const measured = [];
    await mapWithConcurrency(candidates, DOWNLOAD_CONCURRENCY, async (crop) => {
      try {
        const [png] = await bucket.file(crop.storagePath).download();
        measured.push({ ...crop, metrics: await cropMetrics(png) });
      } catch (err) {
        console.log(`Skipped ${crop.storagePath}: ${err.message}`);
      }
    });
    measured.sort((a, b) => a.storagePath.localeCompare(b.storagePath));
    chosen = chooseTestSet({ flagged, slides, measured, random });
  }
  ctx.state.crops = chosen.map((crop, index) => ({ ...crop, id: `c${index}` }));
  await mapWithConcurrency(ctx.state.crops, DOWNLOAD_CONCURRENCY, async (crop) => {
    const [png] = await bucket.file(crop.storagePath).download();
    fs.writeFileSync(ctx.cropFile(crop), png);
  });
  ctx.save();
  const groups = {};
  for (const crop of ctx.state.crops) groups[crop.group] = (groups[crop.group] || 0) + 1;
  console.log(JSON.stringify({ crops: ctx.state.crops.length, groups }, null, 2));
}

/**
 * Sends one model stage as batches and stores each result on its crop. Prints
 * the plan and stops unless --commit --yes, and refuses to pass the cap.
 */
async function runBatchStage(ctx, options, { name, field, todo, build, maxTokens }) {
  const batches = ctx.state.batches[name];
  const estimate = todo.length * ESTIMATE[name];
  if (!(options.commit && options.yes)) {
    console.log(`Dry run: ${todo.length} ${name} calls, at most about $${estimate.toFixed(2)}. ${batches.length} batches already sent. Spent so far: $${ctx.state.spentUsd.toFixed(4)}. Pass --commit --yes to send.`);
    return;
  }
  if (!batches.length && ctx.state.spentUsd + estimate > options.cap) {
    throw new Error(`${name} could cost $${estimate.toFixed(2)} with $${ctx.state.spentUsd.toFixed(4)} spent, over the $${options.cap} cap`);
  }
  const client = await anthropicClient(options);
  if (!batches.length && todo.length) {
    const requests = [];
    for (const crop of todo) requests.push({ custom_id: crop.id, params: await build(crop) });
    for (const chunk of chunkRequests(requests)) {
      batches.push({ id: await submitBatch(client, chunk), collected: false });
      ctx.save();
    }
  }
  const byId = new Map(ctx.state.crops.map((crop) => [crop.id, crop]));
  for (const batch of batches.filter((b) => !b.collected)) {
    await waitForBatch(client, batch.id, { onPoll: (b) => console.log(`${batch.id}: ${JSON.stringify(b.request_counts)}`) });
    for (const result of await collectResults(client, batch.id)) {
      const crop = byId.get(result.customId);
      if (result.type !== "succeeded") {
        crop[`${field}Error`] = result.type;
        continue;
      }
      // A truncated or refused reply is still billed; count it, then record it.
      ctx.state.spentUsd += batchCostOf(usageOf(result.message), QUESTION_BANK_MODEL);
      try {
        crop[field] = readMessage(result.message, maxTokens).parsed;
      } catch (err) {
        crop[`${field}Error`] = err.message;
      }
    }
    batch.collected = true;
    ctx.save();
  }
  console.log(`${name} finished. Spent so far: $${ctx.state.spentUsd.toFixed(4)}`);
}

async function classifyStage(ctx, options) {
  const todo = ctx.state.crops.filter((crop) => !crop.report);
  await runBatchStage(ctx, options, {
    name: "classify",
    field: "report",
    todo,
    maxTokens: CLASSIFY_MAX_TOKENS,
    build: async (crop) => {
      const { image, width, height } = await modelImage(fs.readFileSync(ctx.cropFile(crop)));
      crop.modelSize = { width, height };
      return buildClassifyParams({ image, width, height, description: crop.description, questionText: crop.questionText });
    },
  });
  ctx.save();
}

async function cleanOne(ctx, crop, slides) {
  const result = await cleanImage(crop, fs.readFileSync(ctx.cropFile(crop)), slides);
  crop.plan = result.plan;
  if (!result.image) return;
  for (const field of ["applied", "erased", "eraseRejected", "tintLeft"]) if (result[field] !== undefined) crop[field] = result[field];
  fs.writeFileSync(ctx.cleanedFile(crop), result.image);
}

async function cleanStage(ctx, options) {
  const ready = ctx.state.crops.filter((crop) => crop.report);
  if (!ready.length) throw new Error("No classified crops yet; run --stage=classify first");
  const needsSlides = ready.filter((crop) => planFor(crop).steps.includes("rerender"));
  const slides = needsSlides.length ? slideSources(path.join(options.workDir, "sources")) : null;
  // One at a time: re-renders share a single LibreOffice and PDF per deck.
  for (const crop of ready) {
    try {
      await cleanOne(ctx, crop, slides);
    } catch (err) {
      crop.cleanError = err.message;
      console.log(`${crop.id} (${crop.sourcePath} p${crop.pageNumber}): ${err.message}`);
    }
  }
  if (slides) await slides.close();
  ctx.save();
  const outcomes = {};
  for (const crop of ready) outcomes[crop.cleanError ? "error" : crop.plan.outcome] = (outcomes[crop.cleanError ? "error" : crop.plan.outcome] || 0) + 1;
  console.log(JSON.stringify({ classified: ready.length, outcomes }, null, 2));
}

async function verifyStage(ctx, options) {
  const todo = ctx.state.crops.filter((crop) => crop.plan?.outcome === "clean" && !crop.cleanError && !crop.check);
  await runBatchStage(ctx, options, {
    name: "verify",
    field: "check",
    todo,
    maxTokens: VERIFY_MAX_TOKENS,
    build: async (crop) => buildVerifyParams({
      before: (await modelImage(fs.readFileSync(ctx.cropFile(crop)))).image,
      after: (await modelImage(fs.readFileSync(ctx.cleanedFile(crop)))).image,
      description: crop.description,
      removed: crop.erased,
    }),
  });
  ctx.save();
}

const escapeHtml = (text) => String(text ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" })[c]);

/** Where a crop ended up, for grouping the gallery. */
function finalOutcome(crop) {
  if (crop.cleanError) return "error";
  if (!crop.plan) return "not_classified";
  if (crop.plan.outcome !== "clean") return crop.plan.outcome;
  if (!crop.check) return "cleaned_unchecked";
  return verdict(crop.check, crop).pass ? "cleaned_passed" : "cleaned_failed";
}

function galleryHtml(crops, spentUsd) {
  const order = ["cleaned_failed", "cleaned_passed", "cleaned_unchecked", "hide", "keep", "error", "not_classified"];
  const groups = new Map(order.map((name) => [name, []]));
  for (const crop of crops) groups.get(finalOutcome(crop)).push(crop);
  const tile = (crop) => {
    const details = [crop.group, crop.diagramType, crop.plan?.reason, ...(crop.applied || []), crop.check ? verdict(crop.check, crop).failed.join(", ") : "", ...(crop.check?.missingLabels || []), ...(crop.check?.missingShapes || []), ...(crop.check?.wronglyFilled || []), ...(crop.check?.mergedRegions || []), crop.report?.note, crop.cleanError].filter(Boolean).join(" · ");
    const after = fs.existsSync(crop.cleanedPath) ? `<img loading="lazy" src="cleaned/${crop.id}.png" alt="After">` : "";
    return `<figure><div class="pair"><img loading="lazy" src="crops/${crop.id}.png" alt="Before">${after}</div><figcaption><b>${escapeHtml(crop.id)}</b> ${escapeHtml(crop.sourcePath.split("/").pop())} p${escapeHtml(crop.pageNumber)}<br>${escapeHtml(details)}</figcaption></figure>`;
  };
  const sections = order.filter((name) => groups.get(name).length).map((name) => `<h2>${name.replace(/_/g, " ")} (${groups.get(name).length})</h2><div class="grid">${groups.get(name).map(tile).join("")}</div>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>Crop clean-up test</title><style>
body{font:14px system-ui;margin:24px;background:#f4f4f4;color:#222}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px}
figure{margin:0;background:#fff;padding:8px;border:1px solid #ccc}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center}
.pair img{width:100%;max-height:260px;object-fit:contain;border:1px solid #ddd;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px}figcaption{margin-top:6px;font-size:12px}
</style><h1>Crop clean-up test</h1><p>${crops.length} crops. Model cost $${spentUsd.toFixed(4)}. Before on the left, after on the right.</p>${sections}`;
}

function reportStage(ctx, options) {
  const crops = ctx.state.crops.map((crop) => ({ ...crop, cleanedPath: ctx.cleanedFile(crop) }));
  const file = path.join(options.workDir, "gallery.html");
  fs.writeFileSync(file, galleryHtml(crops, ctx.state.spentUsd));
  const outcomes = {};
  for (const crop of crops) outcomes[finalOutcome(crop)] = (outcomes[finalOutcome(crop)] || 0) + 1;
  console.log(JSON.stringify({ gallery: file, outcomes, spentUsd: ctx.state.spentUsd }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ctx = openRun(options.workDir);
  if (options.stage === "select") await selectStage(ctx, options);
  if (options.stage === "classify") await classifyStage(ctx, options);
  if (options.stage === "clean") await cleanStage(ctx, options);
  if (options.stage === "verify") await verifyStage(ctx, options);
  if (options.stage === "report") reportStage(ctx, options);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { chooseTestSet, finalOutcome, parseArgs, randomSource };
