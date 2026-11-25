"use strict";

/*
 * RES-93: how accurate was the generation ETA that tutors were shown?
 *
 * Every progress report is logged as `progress.reported` with the ETA it
 * showed. For each completed run still in Cloud Logging, this compares each
 * report's ETA with the time the run really had left, and prints the median
 * error for the first, middle and last third of a run. A run counts once,
 * however many reports it logged.
 *
 * Usage (from backend/firebase/functions, with gcloud signed in):
 *   node scripts/measureEtaAccuracy.js
 *   node scripts/measureEtaAccuracy.js --since=2026-11-26 --freshness=30d --project=tenacity-tutoring-b8eb2
 *
 * Read-only: Cloud Logging, and the jobs' subject and type from Firestore.
 */

const { execFileSync } = require("node:child_process");

const MIN_REPORTS = 5;
const MIN_RUN_SECONDS = 60;
// Reports in a run's last few seconds divide by almost nothing.
const MIN_REMAINING_SECONDS = 5;

function parseArgs(argv) {
  const args = Object.fromEntries(argv.map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }));
  return { project: args.project || "tenacity-tutoring-b8eb2", freshness: args.freshness || "30d", since: args.since || null };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Runs from lifecycle events: each with its reports as { position, etaSeconds, actualSeconds }. */
function runsFrom(events, { since = null } = {}) {
  const byRun = new Map();
  for (const event of events) {
    if (!event?.jobId) continue;
    const key = `${event.jobId}|${event.runId || ""}`;
    const run = byRun.get(key) || { jobId: event.jobId, reports: [], completedAt: null };
    if (event.event === "progress.reported") run.reports.push(event);
    else if (event.event === "job.completed") run.completedAt = event.timestamp;
    byRun.set(key, run);
  }
  const runs = [];
  for (const run of byRun.values()) {
    if (!run.completedAt || run.reports.length < MIN_REPORTS) continue;
    if (since && run.completedAt < since) continue;
    const end = Date.parse(run.completedAt);
    const times = run.reports.map((report) => Date.parse(report.timestamp)).sort((a, b) => a - b);
    const start = times[0];
    if ((end - start) / 1000 < MIN_RUN_SECONDS) continue;
    const reports = run.reports
      .map((report) => ({ at: Date.parse(report.timestamp), etaSeconds: report.etaMs / 1000 }))
      .filter((report) => Number.isFinite(report.etaSeconds) && (end - report.at) / 1000 >= MIN_REMAINING_SECONDS)
      .map((report) => ({ position: (report.at - start) / (end - start), etaSeconds: report.etaSeconds, actualSeconds: (end - report.at) / 1000 }));
    runs.push({ jobId: run.jobId, completedAt: run.completedAt, totalSeconds: (end - start) / 1000, reports });
  }
  return runs;
}

/** Median over runs of each run's median error, for each third of the run. */
function errorByThird(runs) {
  return [0, 1, 2].map((third) => {
    const perRun = runs
      .map((run) => median(run.reports
        .filter((report) => Math.min(2, Math.floor(report.position * 3)) === third)
        .map((report) => Math.abs(report.etaSeconds - report.actualSeconds) / report.actualSeconds)))
      .filter((value) => value !== null);
    return median(perRun);
  });
}

function formatRow(label, runs) {
  const thirds = errorByThird(runs).map((value) => (value === null ? "   -" : `${Math.round(value * 100)}%`.padStart(4)));
  return `${label.padEnd(28)} runs ${String(runs.length).padStart(3)}   first ${thirds[0]}   middle ${thirds[1]}   last ${thirds[2]}`;
}

function readLogs({ project, freshness }) {
  const filter = 'jsonPayload.message="resource_lifecycle" AND (jsonPayload.event="progress.reported" OR jsonPayload.event="job.completed")';
  const out = execFileSync("gcloud", ["logging", "read", filter, `--project=${project}`, `--freshness=${freshness}`, "--limit=200000", "--format=json(jsonPayload)"],
    { maxBuffer: 1024 * 1024 * 1024 });
  return JSON.parse(out.toString() || "[]").map((entry) => entry.jsonPayload);
}

async function subjectsOf(project, jobIds) {
  const admin = require("firebase-admin");
  if (!admin.apps.length) admin.initializeApp({ projectId: project });
  const db = admin.firestore();
  const found = new Map();
  for (let start = 0; start < jobIds.length; start += 300) {
    const docs = await db.getAll(...jobIds.slice(start, start + 300).map((id) => db.collection("resourceJobs").doc(id)), { fieldMask: ["subject", "resourceType"] });
    for (const doc of docs) if (doc.exists) found.set(doc.id, { subject: doc.get("subject") || "unknown", resourceType: doc.get("resourceType") || "unknown" });
  }
  return found;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = runsFrom(readLogs(options), options);
  const jobs = await subjectsOf(options.project, [...new Set(runs.map((run) => run.jobId))]);
  console.log(`Median ETA error by third of a run${options.since ? `, runs completed since ${options.since}` : ""}:`);
  console.log(formatRow("All", runs));
  for (const subject of ["maths", "english"]) console.log(formatRow(subject, runs.filter((run) => jobs.get(run.jobId)?.subject === subject)));
  const types = [...new Set(runs.map((run) => `${jobs.get(run.jobId)?.resourceType}.${jobs.get(run.jobId)?.subject}`))].sort();
  for (const type of types) console.log(formatRow(type, runs.filter((run) => `${jobs.get(run.jobId)?.resourceType}.${jobs.get(run.jobId)?.subject}` === type)));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { errorByThird, formatRow, median, parseArgs, runsFrom };
