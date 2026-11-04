#!/usr/bin/env node
"use strict";

/**
 * RES-58. Saves again, from a run's stored batch results, every page where a
 * part shares an earlier part's diagram (2b and 2c under 2a's figure). Those
 * parts were dropped before extraction.sharedFigureParents existed. No model
 * calls: Anthropic keeps batch results for 29 days.
 *
 *   node scripts/questionBankSharedFigures.js --projectId=tenacity-tutoring-b8eb2 \
 *     --work-dir=/path/to/run [--firebase-secrets] [--commit --yes]
 *
 * Without --commit --yes it counts the pages and parts it would add. Resumable:
 * finished batches are recorded in the run state. Run it only while no
 * questionBankExtract.js is using the same work dir.
 */

const admin = require("firebase-admin");

const { loadFirebaseSecrets, loadLocalSecrets } = require("./liveResourceSmoke");
const { createRun, withRetries, writeSourceQuestions } = require("./questionBankExtract");
const { parseRequestId, requestId, sharedFigureParents } = require("../src/questionBank/extraction");
const { EXTRACT_MAX_TOKENS, readMessage } = require("../src/questionBank/prompts");

function parseArgs(argv) {
  const options = { projectId: "", workDir: "", firebaseSecrets: false, commit: false, yes: false };
  for (const arg of argv) {
    if (arg.startsWith("--projectId=")) options.projectId = arg.slice(12);
    else if (arg.startsWith("--work-dir=")) options.workDir = arg.slice(11);
    else if (arg === "--firebase-secrets") options.firebaseSecrets = true;
    else if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId || !options.workDir) throw new Error("--projectId and --work-dir are required");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const write = options.commit && options.yes;
  const run = createRun(options.workDir);
  const keys = loadLocalSecrets().values;
  if (!keys.ANTHROPIC_API_KEY && options.firebaseSecrets) Object.assign(keys, loadFirebaseSecrets({ secretNames: ["ANTHROPIC_API_KEY"] }));
  if (!keys.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing");
  const client = new (require("@anthropic-ai/sdk").default)({ apiKey: keys.ANTHROPIC_API_KEY });
  admin.initializeApp({ projectId: options.projectId, storageBucket: `${options.projectId}.firebasestorage.app` });
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  run.state.sharedFigures = run.state.sharedFigures || { batches: [], pages: 0, parts: 0 };
  const done = new Set(run.state.sharedFigures.batches);
  const batches = run.state.batches.filter((b) => b.stage === "extract" && b.status === "collected" && !done.has(b.id));
  console.log(`${batches.length} extract batches to read${done.size ? ` (${done.size} already done)` : ""}.`);
  let pages = 0;
  let parts = 0;
  const started = Date.now();

  for (const [batchIndex, batch] of batches.entries()) {
    const bySource = new Map();
    for await (const entry of await client.messages.batches.results(batch.id)) {
      if (entry.result.type !== "succeeded") continue;
      const { sourceId, pageNumber } = parseRequestId(entry.custom_id);
      const page = run.state.pages[requestId("page", sourceId, pageNumber)];
      if (!page || page.stage !== "done") continue;
      let units;
      try {
        units = readMessage(entry.result.message, EXTRACT_MAX_TOKENS).parsed.units || [];
      } catch {
        continue;
      }
      const added = sharedFigureParents(units).filter((parent) => parent !== null).length;
      if (!added) continue;
      pages += 1;
      parts += added;
      if (!bySource.has(sourceId)) bySource.set(sourceId, []);
      bySource.get(sourceId).push({ page, units });
    }
    if (write) {
      for (const [sourceId, entries] of bySource) {
        await withRetries(() => writeSourceQuestions({ run, db, bucket, sourceId, entries }), {
          onRetry: (err, attempt) => console.log(`  Retrying ${run.state.sources[sourceId]?.path} (attempt ${attempt + 1}): ${err.message.slice(0, 120)}`),
        });
      }
      run.state.sharedFigures.batches.push(batch.id);
      run.state.sharedFigures.pages += [...bySource.values()].reduce((n, e) => n + e.length, 0);
      run.state.sharedFigures.parts += [...bySource.values()].flat().reduce((n, e) => n + sharedFigureParents(e.units).filter((p) => p !== null).length, 0);
      run.save({ force: true });
    }
    const minutes = ((Date.now() - started) / 60000).toFixed(1);
    console.log(`Batch ${batchIndex + 1}/${batches.length} (${minutes} min): ${pages} pages, ${parts} shared parts so far${write ? " saved" : ""}.`);
  }
  const questions = Object.values(run.state.pages).reduce((n, p) => n + (p.questionCount || 0), 0);
  console.log(`${write ? "Saved" : "Dry run:"} ${parts} shared parts on ${pages} pages. The run now records ${questions} questions.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
