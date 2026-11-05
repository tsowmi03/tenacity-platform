#!/usr/bin/env node
"use strict";

/**
 * RES-62. The weekly question bank update, run by
 * .github/workflows/question-bank-weekly.yml:
 *
 *   1. sync: record new, changed and removed Maths files in Drive;
 *   2. retire: hide the questions of every removed file, and of every changed
 *      file before it is extracted again (its new version replaces them);
 *   3. extract: run new and changed files through the same skip rules and
 *      extraction as the backfill, under this run's own spending cap;
 *   4. embed and merge copies, so the new questions are searchable.
 *
 *   node scripts/questionBankWeekly.js --projectId=tenacity-tutoring-b8eb2 \
 *     --work-dir=/tmp/qb-weekly [--cap=10] [--commit --yes]
 *
 * Without --commit --yes every step is a dry run. Writes a summary to
 * $GITHUB_STEP_SUMMARY when it is set.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const admin = require("firebase-admin");
const { adminAppOptions } = require("./lib/questionBankAuth");

const { QUESTIONS_COLLECTION } = require("../src/questionBank/extraction");

const SOURCES_COLLECTION = "questionBankSources";
const SCRIPTS = __dirname;

function parseArgs(argv) {
  const options = { projectId: "", workDir: "", cap: 10, commit: false, yes: false };
  for (const arg of argv) {
    if (arg.startsWith("--projectId=")) options.projectId = arg.slice(12);
    else if (arg.startsWith("--work-dir=")) options.workDir = arg.slice(11);
    else if (arg.startsWith("--cap=")) options.cap = Number(arg.slice(6));
    else if (arg === "--commit") options.commit = true;
    else if (arg === "--yes") options.yes = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId || !options.workDir) throw new Error("--projectId and --work-dir are required");
  if (!(options.cap > 0 && options.cap <= 100)) throw new Error("--cap must be between 0 and 100 dollars");
  return options;
}

/**
 * Which sources' questions to hide: removed files, and files whose current
 * version has not been extracted although an earlier one was.
 */
function sourcesToRetire(sources) {
  return sources
    .filter((source) => source.status === "removed" || (source.status === "pending" && source.extractedVersion && source.extractedVersion !== source.version))
    .map((source) => ({ id: source.id, path: source.path, reason: source.status === "removed" ? "source_removed" : "source_changed" }));
}

async function retireQuestions(db, retiring, write) {
  let hidden = 0;
  for (const source of retiring) {
    const snapshot = await db.collection(QUESTIONS_COLLECTION).where("sourceId", "==", source.id).select("status").get();
    const live = snapshot.docs.filter((doc) => doc.get("status") !== "hidden" && doc.get("status") !== "retired");
    hidden += live.length;
    if (!write || !live.length) continue;
    const writer = db.bulkWriter();
    for (const doc of live) writer.update(doc.ref, { status: "retired", retiredReason: source.reason, retiredAt: admin.firestore.FieldValue.serverTimestamp() });
    await writer.close();
  }
  return hidden;
}

function runScript(name, args) {
  console.log(`\n=== ${name} ${args.join(" ")}`);
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(result.stdout || "");
  if (result.status !== 0) throw new Error(`${name} exited with ${result.status}`);
  return result.stdout || "";
}

function lastJson(output) {
  const start = output.lastIndexOf("\n{");
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start + 1));
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const write = options.commit && options.yes;
  const flags = write ? ["--commit", "--yes"] : [];
  const project = `--projectId=${options.projectId}`;
  fs.mkdirSync(options.workDir, { recursive: true });
  admin.initializeApp(adminAppOptions({ projectId: options.projectId }));
  const db = admin.firestore();

  runScript("questionBankSync.js", [project, ...flags]);

  const sources = (await db.collection(SOURCES_COLLECTION).select("status", "path", "version", "extractedVersion").get())
    .docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const retiring = sourcesToRetire(sources);
  const retired = await retireQuestions(db, retiring, write);
  console.log(`\n=== retire: ${retiring.length} removed or changed files, ${retired} questions ${write ? "retired" : "to retire"}`);

  const extract = lastJson(runScript("questionBankExtract.js", [project, `--work-dir=${options.workDir}`, `--cap=${options.cap}`, "--firebase-secrets", ...flags]));
  runScript("questionBankEmbed.js", [project, "--firebase-secrets", ...flags]);
  runScript("questionBankDedupe.js", [project, "--show=0", ...flags]);

  const summary = [
    "## Question bank weekly update",
    "",
    `| | |`,
    `|---|---|`,
    `| Files removed or changed | ${retiring.length} (${retired} questions retired) |`,
    `| Pages processed | ${extract?.pages ?? "—"} |`,
    `| Questions added | ${extract?.questions ?? "—"} |`,
    `| Cost | $${(extract?.spentUsd ?? 0).toFixed(2)} of a $${options.cap} cap |`,
    write ? "" : "\nDry run: nothing was written.",
  ].join("\n");
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { lastJson, parseArgs, sourcesToRetire };
