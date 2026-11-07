"use strict";

// Real-provider replay with an in-memory queue and a local filesystem journal.
// Production access is limited to optional read-only Secret Manager lookups
// and, with --question-bank, read-only question bank searches and diagram
// downloads. With --pd-sourcing, English stimulus texts and images are fetched
// from Project Gutenberg, Wikisource and Wikimedia Commons, as in production.
// Inputs/references must already be local; every write stays local.
process.env.POSTHOG_PROJECT_TOKEN = "";
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const admin = require("firebase-admin");
const { runQueueForTutor } = require("../src/resources");
const { callAiForResource } = require("../src/resources/aiClient");
const { createMemoryDb, createSmokeJob, loadLocalSecrets, loadFirebaseSecrets } = require("./liveResourceSmoke");
const { modelForChoice } = require("../src/resources/modelRegistry");

function parseArgs(argv) {
  const options = { maxCalls: 60, firebaseSecrets: false, questionBank: false, pdSourcing: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--firebase-secrets") options.firebaseSecrets = true;
    else if (argv[i] === "--pd-sourcing") options.pdSourcing = true;
    else if (argv[i] === "--question-bank") options.questionBank = true;
    else if (["--input", "--reference", "--output", "--max-calls"].includes(argv[i])) {
      const key = { "--input": "input", "--reference": "reference", "--output": "output", "--max-calls": "maxCalls" }[argv[i]];
      options[key] = argv[++i];
    } else throw new Error(`Unknown option: ${argv[i]}`);
  }
  if (!options.input || !options.output) throw new Error("--input and --output are required");
  options.maxCalls = Number(options.maxCalls);
  // A topic booklet with ~30 diagram questions makes 100+ bank calls (RES-80).
  if (!Number.isInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > 300) throw new Error("--max-calls must be 1–300");
  return options;
}

// With --question-bank, textbook diagram crops are read from production
// Storage (read-only); everything the run writes stays local.
function localStorage(root, remoteBucket = null) {
  const objects = path.resolve(root, "objects");
  const resolve = (name) => {
    const target = path.resolve(objects, name);
    if (!target.startsWith(objects + path.sep)) throw new Error("Unsafe local object path");
    return target;
  };
  return { bucket: () => ({
    file: (name) => ({
      download: async () => {
        if (remoteBucket && name.startsWith("questionBank/")) return remoteBucket.file(name).download();
        try { return [await fs.promises.readFile(resolve(name))]; }
        catch (err) { if (err.code === "ENOENT") err.code = 404; throw err; } },
      save: async (bytes) => { const target = resolve(name); await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await fs.promises.writeFile(target, bytes, { mode: 0o600 }); },
      delete: async () => fs.promises.rm(resolve(name), { force: true }),
    }),
    deleteFiles: async ({ prefix }) => fs.promises.rm(resolve(prefix), { recursive: true, force: true }),
  }) };
}

async function runReplay(options) {
  const output = path.resolve(options.output);
  await fs.promises.mkdir(output, { recursive: true, mode: 0o700 });
  const stateFile = path.join(output, "job.json");
  if (fs.existsSync(stateFile)) throw new Error("Output already contains a replay; choose a new output directory");
  const input = JSON.parse(await fs.promises.readFile(options.input, "utf8"));
  const keys = loadLocalSecrets().values;
  if (options.firebaseSecrets) {
    const missing = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"].filter((key) => !keys[key]);
    Object.assign(keys, loadFirebaseSecrets({ secretNames: missing }));
  }
  if (!keys.OPENAI_API_KEY || !keys.ANTHROPIC_API_KEY) throw new Error("Provider credentials are missing; use local keys or --firebase-secrets");
  if (options.questionBank && !admin.apps.length) admin.initializeApp({ projectId: "tenacity-tutoring-b8eb2", storageBucket: "tenacity-tutoring-b8eb2.firebasestorage.app" });
  const storage = localStorage(output, options.questionBank ? admin.storage().bucket() : null);
  const uploadedFiles = input.uploadedFiles || [];
  if (uploadedFiles.length > 1) throw new Error("This replay runner accepts one original reference; supply a single-file input manifest");
  if (uploadedFiles.length && !options.reference) throw new Error("The original reference is required");
  if (uploadedFiles.length) await storage.bucket().file(uploadedFiles[0].path).save(await fs.promises.readFile(options.reference));
  const model = modelForChoice(input.modelChoice || "openai");
  const stamp = admin.firestore.Timestamp.now();
  const jobId = `local-res51-${randomUUID().slice(0, 8)}`;
  const job = { ...createSmokeJob(model), ...Object.fromEntries(Object.entries(input).filter(([key]) => ["customPrompt", "uploadedFiles", "uploadedFilePath", "uploadedFileName", "subject", "year", "answerMode", "showMarks", "resourceType", "modelChoice"].includes(key))),
    id: jobId, jobId, runId: randomUUID(), generationVersion: 1, questionBank: input.questionBank || "none", createdAt: stamp, runStartedAt: stamp,
    activeModel: model, requestedModel: model, model, studentName: "Local replay", createdByName: "Local replay", createdBy: "local-replay" };
  const db = createMemoryDb([job]);
  const eventsPath = path.join(output, "events.jsonl");
  const events = [];
  let calls = 0;
  let currentStage = null;
  const started = Date.now();
  const flushState = () => fs.writeFileSync(stateFile, JSON.stringify(db.jobs[0], null, 2), { mode: 0o600 });
  const sink = (_message, event) => {
    events.push(event);
    if (event.event === "provider.started") currentStage = event.stageId;
    fs.appendFileSync(eventsPath, JSON.stringify(event) + "\n", { mode: 0o600 });
    if (["provider.started", "provider.completed", "provider.failed", "recovery.decided", "content.verified", "job.completed", "job.failed"].includes(event.event)) console.log(JSON.stringify(event));
  };
  const deps = { db, storage, durableStages: true, questionBankDb: options.questionBank ? admin.firestore() : null, enableFailover: true, enablePdTextSourcing: options.pdSourcing,
    anthropicApiKey: keys.ANTHROPIC_API_KEY, openaiApiKey: keys.OPENAI_API_KEY, resourceLogSink: sink,
    callAi: async (request) => {
      if (calls >= options.maxCalls || Date.now() - started > 45 * 60_000) throw Object.assign(new Error("Local replay budget reached"), { code: "RESOURCE_LOCAL_BUDGET", resourceControl: true });
      calls++;
      flushState();
      const result = await callAiForResource(request);
      const responses = path.join(output, "provider-responses");
      fs.mkdirSync(responses, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(responses, `${calls}.json`), JSON.stringify({ stageId: currentStage, model: request.model, result }, null, 2), { mode: 0o600 });
      return result;
    } };
  for (let turn = 0; turn < 250 && db.jobs[0].status === "pending"; turn++) {
    await runQueueForTutor(job.createdBy, deps);
    flushState();
  }
  const final = db.jobs[0];
  if (final.outputPath) {
    const [bytes] = await storage.bucket().file(final.outputPath).download();
    fs.writeFileSync(path.join(output, "resource.docx"), bytes, { mode: 0o600 });
  }
  const summary = { status: final.status, errorCode: final.errorCode || null, error: final.error || null,
    warnings: final.warnings || [], sourceSelections: (final.sourceSelections || []).map((s) => s.title),
    questionBankUsage: final.questionBankUsage || null,
    jobId, providerCalls: calls, elapsedMs: Date.now() - started, progress: final.progress,
    contentVerification: events.filter((e) => e.event === "content.verified"),
    terminal: events.filter((e) => ["job.completed", "job.failed", "job.cancelled"].includes(e.event)),
    outputFile: final.outputPath ? path.join(output, "resource.docx") : null };
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
if (require.main === module) runReplay(parseArgs(process.argv.slice(2))).then((result) => { process.exitCode = result.status === "complete" ? 0 : 1; }).catch((err) => {
  console.error(JSON.stringify({ errorCode: err.code || "LOCAL_REPLAY_FAILED", error: err.code ? undefined : err.message })); process.exitCode = 1;
});
module.exports = { parseArgs, localStorage, runReplay };
