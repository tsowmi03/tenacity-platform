"use strict";

// RES-113. Resource quality benchmark: generate a fixed set of maths and
// English requests with the real pipeline (scripts/replayResourceLocally.js),
// convert each DOCX to PDF with LibreOffice, and have a Claude grader score
// the PDF against the rubric in qualityBenchmark/rubric.js. Writes one
// summary.json and summary.md per run, optionally compared with an earlier
// run's summary.json.
//
//   npm run benchmark:resources -- --dry-run
//   npm run benchmark:resources -- --firebase-secrets [--only m01-...,e06-...] [--compare <summary.json>]
//   npm run benchmark:resources -- --grade-only <runDir> [--compare <summary.json>]
//   npm run benchmark:resources -- --firebase-secrets --resume <runDir>   (after an interrupted run)
//
// Production access is read-only, exactly as in the replay runner: Secret
// Manager (with --firebase-secrets), the maths and English banks, and
// public-domain text sources. Every write stays under the run directory.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { randomUUID } = require("node:crypto");

const rubric = require("./qualityBenchmark/rubric");
const REQUESTS_FILE = path.join(__dirname, "qualityBenchmark", "requests.json");
const DEFAULT_RUNS_DIR = path.join(__dirname, "..", ".benchmark-runs");
const SOFFICE_CANDIDATES = ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "/opt/homebrew/bin/soffice", "/usr/bin/soffice"];
const DEFAULT_MAX_CALLS = 200;
// Rough planning numbers, shown by --dry-run only. A Year 5 worksheet took
// 35s to generate and $0.07 to grade (2026-11-18); booklets and papers are
// several times longer.
const ESTIMATE_PER_REQUEST = Object.freeze({ minutes: 5, graderUsd: 0.2 });

function parseArgs(argv) {
  const options = { only: null, subject: null, compare: null, gradeOnly: null, resume: null, output: null, dryRun: false,
    firebaseSecrets: false, visualCheck: false, graderModel: rubric.GRADER_MODEL, maxCalls: DEFAULT_MAX_CALLS, help: false };
  const takesValue = { "--only": "only", "--subject": "subject", "--compare": "compare", "--grade-only": "gradeOnly", "--resume": "resume",
    "--output": "output", "--grader-model": "graderModel", "--max-calls": "maxCalls" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg === "--visual-check") options.visualCheck = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (takesValue[arg]) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      options[takesValue[arg]] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  options.only = options.only ? options.only.split(",").map((s) => s.trim()).filter(Boolean) : null;
  if (options.subject && !["maths", "english"].includes(options.subject)) throw new Error("--subject must be maths or english");
  options.maxCalls = Number(options.maxCalls);
  if (!Number.isInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > 300) throw new Error("--max-calls must be 1–300");
  if (options.gradeOnly && options.output) throw new Error("--grade-only writes into the run it grades; drop --output");
  if (options.resume && (options.output || options.gradeOnly)) throw new Error("--resume continues the run it names; drop --output and --grade-only");
  return options;
}

function loadRequests(file = REQUESTS_FILE) {
  const { requests } = JSON.parse(fs.readFileSync(file, "utf8"));
  const ids = new Set();
  for (const r of requests) {
    if (!/^[a-z0-9-]+$/.test(r.id || "")) throw new Error(`Bad request id: ${r.id}`);
    if (ids.has(r.id)) throw new Error(`Duplicate request id: ${r.id}`);
    ids.add(r.id);
    for (const key of ["subject", "year", "resourceType", "answerMode", "customPrompt"]) {
      if (r[key] === undefined || r[key] === "") throw new Error(`${r.id} is missing ${key}`);
    }
  }
  return requests;
}

function selectRequests(requests, { only, subject }) {
  if (only) {
    const unknown = only.filter((id) => !requests.some((r) => r.id === id));
    if (unknown.length) throw new Error(`Unknown request id(s): ${unknown.join(", ")}`);
  }
  return requests.filter((r) => (!only || only.includes(r.id)) && (!subject || r.subject === subject));
}

/** The replay input for one benchmark request. Model choice is the portal default. */
function replayInput(request) {
  return {
    subject: request.subject,
    year: request.year,
    resourceType: request.resourceType,
    answerMode: request.answerMode,
    showMarks: Boolean(request.showMarks),
    customPrompt: request.customPrompt,
    ...(request.modelChoice ? { modelChoice: request.modelChoice } : {}),
  };
}

/** Tokens and known dollar cost of a replay's provider calls, by model. */
function generationUsage(replayDir) {
  const dir = path.join(replayDir, "provider-responses");
  const byModel = {};
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const { model, result } = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const id = result?.model || model || "unknown";
      const u = result?.usage || {};
      const acc = byModel[id] || (byModel[id] = { calls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 });
      acc.calls++;
      for (const key of ["inputTokens", "cachedInputTokens", "cacheWriteTokens", "outputTokens"]) acc[key] += Number(u[key]) || 0;
    }
  }
  let known = 0;
  const unpricedModels = [];
  for (const [model, usage] of Object.entries(byModel)) {
    const cost = rubric.costOf(model, usage);
    if (cost === null) unpricedModels.push(model); else known += cost;
  }
  return { byModel, cost: { known: Math.round(known * 10000) / 10000, unpricedModels } };
}

function findSoffice() {
  return SOFFICE_CANDIDATES.find((p) => fs.existsSync(p)) || "soffice";
}

async function docxToPdf(docxPath, outDir, { soffice = findSoffice(), run = promisify(execFile) } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "res113-soffice-"));
  try {
    await run(soffice, [`-env:UserInstallation=file://${profile}`, "--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath], { timeout: 180_000 });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
  const pdf = path.join(outDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
  if (!fs.existsSync(pdf)) throw new Error("LibreOffice did not produce a PDF");
  return pdf;
}

// RES-49. With --visual-check the replays get a DOCX→PDF converter, as
// production has, so the visual check runs and its fixes reach the graded PDF.
// LibreOffice stands in for the production converter (also LibreOffice).
function localPdfConverter({ soffice } = {}) {
  return {
    async convert({ docxBuffer, fileName }) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "res49-convert-"));
      try {
        const docx = path.join(dir, /\.docx$/i.test(fileName || "") ? path.basename(fileName) : "resource.docx");
        fs.writeFileSync(docx, docxBuffer);
        return fs.readFileSync(await docxToPdf(docx, dir, soffice ? { soffice } : {}));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

async function gradePdf({ request, pdfPath, client, model }) {
  const params = rubric.buildGraderParams({ request, pdfBase64: fs.readFileSync(pdfPath).toString("base64"), model });
  const message = await client.messages.stream(params).finalMessage();
  const usage = rubric.anthropicUsage(message.usage);
  return { grade: rubric.readGradeMessage(message), usage, cost: rubric.costOf(model, usage) };
}

async function loadKeys({ firebaseSecrets }) {
  const { loadLocalSecrets, loadFirebaseSecrets } = require("./liveResourceSmoke");
  // With --firebase-secrets both keys come from Secret Manager, so the run
  // uses the same provider accounts as production rather than whatever a
  // local shell happens to export.
  if (firebaseSecrets) return loadFirebaseSecrets({ secretNames: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] });
  return loadLocalSecrets().values;
}

function createGraderClient(apiKey) {
  const Anthropic = require("@anthropic-ai/sdk").default;
  return new Anthropic({ apiKey, maxRetries: 3 });
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });

/** What the replay in replayDir recorded about generating the resource. */
function generationInfo(replayDir) {
  const file = path.join(replayDir, "summary.json");
  const replaySummary = fs.existsSync(file) ? readJson(file) : null;
  return {
    status: replaySummary?.status || "missing",
    errorCode: replaySummary?.errorCode || null,
    warnings: (replaySummary?.warnings || []).length,
    providerCalls: replaySummary?.providerCalls ?? null,
    elapsedMs: replaySummary?.elapsedMs ?? null,
    ...generationUsage(replayDir),
  };
}

/**
 * What --resume does with one request already in the run folder:
 * "reuse" a grade made with the same rubric and grader, "grade" a finished
 * resource that has no usable grade, or "generate" from scratch.
 */
function resumeAction(request, runDir, { graderModel }) {
  const dir = path.join(runDir, request.id);
  const gradeFile = path.join(dir, "grade.json");
  if (fs.existsSync(gradeFile)) {
    try {
      const saved = readJson(gradeFile);
      if (saved.rubricVersion === rubric.RUBRIC_VERSION && saved.graderModel === graderModel && saved.grade) return "reuse";
    } catch { /* unreadable grade: fall through and redo it */ }
  }
  if (fs.existsSync(path.join(dir, "replay", "resource.docx"))) return "grade";
  return "generate";
}

/** The result for a request whose saved grade is being reused. */
function savedResult(request, runDir) {
  const dir = path.join(runDir, request.id);
  const saved = readJson(path.join(dir, "grade.json"));
  return { id: request.id, subject: request.subject, status: "graded", grade: rubric.validateGrade(saved.grade),
    graderCost: saved.cost || 0, generation: generationInfo(path.join(dir, "replay")) };
}

// One benchmark process per run folder: a resumed run must not overlap one
// that is still going (say, after a laptop wakes from sleep).
function acquireLock(runDir) {
  const lock = path.join(runDir, ".lock");
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    let alive = false;
    try { if (pid) { process.kill(pid, 0); alive = true; } } catch { /* not running */ }
    if (alive && pid !== process.pid) throw new Error(`Run ${runDir} is in use by process ${pid}`);
  }
  fs.writeFileSync(lock, String(process.pid), { mode: 0o600 });
  return () => fs.rmSync(lock, { force: true });
}

/** Generate (unless grade-only), convert and grade one request. Never throws. */
async function runOne(request, { runDir, gradeOnly, keys, client, graderModel, maxCalls, replay, soffice, visualCheck = false }) {
  const dir = path.join(runDir, request.id);
  const replayDir = path.join(dir, "replay");
  const result = { id: request.id, subject: request.subject, status: "pending" };
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!gradeOnly) {
      const inputFile = path.join(dir, "input.json");
      writeJson(inputFile, replayInput(request));
      await replay({ input: inputFile, output: replayDir, keys, maxCalls, questionBank: true, pdSourcing: true,
        ...(visualCheck ? { pdfConverter: localPdfConverter({ soffice }) } : {}) });
    }
    result.generation = generationInfo(replayDir);
    const docx = path.join(replayDir, "resource.docx");
    if (!fs.existsSync(docx)) {
      result.status = "generation_failed";
      result.error = result.generation.errorCode || "no resource produced";
      return result;
    }
    const pdf = await docxToPdf(docx, dir, soffice ? { soffice } : {});
    const graded = await gradePdf({ request, pdfPath: pdf, client, model: graderModel });
    writeJson(path.join(dir, "grade.json"), { request, graderModel, rubricVersion: rubric.RUBRIC_VERSION, ...graded });
    result.grade = graded.grade;
    result.graderCost = graded.cost || 0;
    result.status = "graded";
  } catch (err) {
    result.status = result.generation ? "grading_failed" : "generation_failed";
    result.error = String(err.code || err.message).slice(0, 200);
  }
  return result;
}

async function runBenchmark(options, deps = {}) {
  let requests = selectRequests(loadRequests(), options);
  // Grade-only re-grades what the run actually holds, not the whole set.
  if (options.gradeOnly) requests = requests.filter((r) => fs.existsSync(path.join(path.resolve(options.gradeOnly), r.id, "replay")));
  if (options.resume && !fs.existsSync(path.resolve(options.resume))) throw new Error(`No run at ${path.resolve(options.resume)}`);
  if (!requests.length) throw new Error("No requests selected");
  if (options.dryRun) {
    const plan = {
      requests: requests.map((r) => `${r.id} (${r.subject} Y${r.year} ${r.resourceType})`),
      graderModel: options.graderModel,
      estimate: { minutes: requests.length * ESTIMATE_PER_REQUEST.minutes, graderUsd: Math.round(requests.length * ESTIMATE_PER_REQUEST.graderUsd * 100) / 100,
        note: "Generation cost is on top: the real pipeline runs once per request, as for a tutor's job." },
    };
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }
  const runDir = path.resolve(options.gradeOnly || options.resume || options.output || path.join(DEFAULT_RUNS_DIR, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${randomUUID().slice(0, 4)}`));
  if (options.gradeOnly && !fs.existsSync(runDir)) throw new Error(`No run at ${runDir}`);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  const keys = deps.keys || await loadKeys(options);
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is needed for the grader");
  if (!options.gradeOnly && !keys.OPENAI_API_KEY) throw new Error("Provider credentials are missing; use local keys or --firebase-secrets");
  const client = deps.client || createGraderClient(keys.ANTHROPIC_API_KEY);
  const replay = deps.replay || require("./replayResourceLocally").runReplay;
  const started = Date.now();
  const results = [];
  // The lock comes first: a second process must be turned away before it can
  // read or overwrite this run's request list.
  const releaseLock = acquireLock(runDir);
  try {
    // The run's request list is saved when it starts, so --resume finishes
    // the same set rather than the whole benchmark.
    const manifestFile = path.join(runDir, "run.json");
    if (options.resume && !options.only && !options.subject && fs.existsSync(manifestFile)) {
      const ids = readJson(manifestFile).requestIds || [];
      requests = selectRequests(loadRequests(), { only: ids });
    } else if (!options.resume && !options.gradeOnly) {
      writeJson(manifestFile, { requestIds: requests.map((r) => r.id), startedAt: new Date().toISOString() });
    }
    for (const [index, request] of requests.entries()) {
      const action = options.resume ? resumeAction(request, runDir, options) : (options.gradeOnly ? "grade" : "generate");
      console.log(`[${index + 1}/${requests.length}] ${request.id}${options.resume ? ` (${action})` : ""}`);
      let result;
      if (action === "reuse") result = savedResult(request, runDir);
      else {
        // A half-finished generation can't be continued: start that request again.
        if (options.resume && action === "generate") fs.rmSync(path.join(runDir, request.id), { recursive: true, force: true });
        result = await runOne(request, { runDir, gradeOnly: action === "grade", keys, client, graderModel: options.graderModel, maxCalls: options.maxCalls, replay, soffice: deps.soffice, visualCheck: options.visualCheck });
      }
      console.log(`  ${result.status}${result.grade ? ` · ${rubric.overallScore(result.grade)}` : ""}${result.error ? ` · ${result.error}` : ""}`);
      results.push(result);
      // Written after every request so an interrupted run still has a summary.
      const summary = rubric.summariseRun(results, {
        previous: options.compare ? readJson(options.compare) : null,
        meta: { runId: path.basename(runDir), graderModel: options.graderModel, startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started, gradeOnly: Boolean(options.gradeOnly), resumed: Boolean(options.resume) },
      });
      writeJson(path.join(runDir, "summary.json"), summary);
      fs.writeFileSync(path.join(runDir, "summary.md"), rubric.renderMarkdown(summary), { mode: 0o600 });
    }
  } finally { releaseLock(); }
  console.log(`\n${fs.readFileSync(path.join(runDir, "summary.md"), "utf8")}\nRun saved in ${runDir}`);
  return readJson(path.join(runDir, "summary.json"));
}

const USAGE = `Usage: npm run benchmark:resources -- [--dry-run] [--firebase-secrets] [--visual-check] [--only id,id] [--subject maths|english]
         [--compare <summary.json>] [--grade-only <runDir>] [--resume <runDir>] [--output <dir>] [--grader-model <id>] [--max-calls N]`;

if (require.main === module) {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (err) { console.error(`${err.message}\n${USAGE}`); process.exit(2); }
  if (options.help) { console.log(USAGE); process.exit(0); }
  runBenchmark(options).then((summary) => {
    process.exitCode = summary?.counts && summary.counts.failed ? 1 : 0;
  }).catch((err) => { console.error(err.message); process.exitCode = 1; });
}

module.exports = { acquireLock, docxToPdf, localPdfConverter, generationUsage, resumeAction, loadRequests, parseArgs, replayInput, runBenchmark, runOne, selectRequests };
