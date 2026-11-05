/*
 * RES-73 one-off: seeds the generation ETA's history (resourceTimingStats)
 * from completed runs still in Cloud Logging, so the ETA is accurate from day
 * one instead of learning from scratch.
 *
 * For each run whose `job.completed` lifecycle event is in the logs it takes:
 *   - active time            job.completed.activeElapsedMs
 *   - question count         plan.resolved.questionCount, else the questions in
 *                            the job's saved generatedJson
 *   - time per step          stage.completed durations, grouped into the five
 *                            steps the portal shows
 * and folds them in with the same addSample() the live worker uses.
 *
 * Usage (from backend/firebase/functions, with gcloud signed in):
 *   node scripts/backfillResourceTiming.js                 # dry run, prints the stats
 *   node scripts/backfillResourceTiming.js --write         # replaces the stats docs
 *   --project=tenacity-tutoring-staging   --freshness=30d
 *
 * --write replaces resourceTimingStats wholesale, so run it once, before live
 * completions have started adding to it (or accept that those are re-counted
 * only if their logs are in range — they are, so a rerun stays correct).
 */

const { execFileSync } = require("node:child_process");
const admin = require("firebase-admin");
const { addSample, countResourceQuestions, kindKey, phaseForStage, PHASE_KEYS, STATS_COLLECTION } = require("../src/resources/progressModel");

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const PROJECT_ID = args.project || "tenacity-tutoring-b8eb2";
const FRESHNESS = args.freshness || "30d";

function readLogs(filter) {
  const out = execFileSync("gcloud", ["logging", "read", `jsonPayload.message="resource_lifecycle" AND ${filter}`,
    `--project=${PROJECT_ID}`, `--freshness=${FRESHNESS}`, "--limit=100000", "--format=json(jsonPayload)"],
  { maxBuffer: 1024 * 1024 * 1024 });
  return JSON.parse(out.toString() || "[]").map((e) => e.jsonPayload);
}

// Pure: turns the three event lists and the job docs into stats documents.
function buildStats({ completed, plans, stages, jobs }) {
  const questionsByJob = new Map(plans.map((p) => [p.jobId, p.questionCount]));
  const phaseMsByRun = new Map();
  for (const s of stages) {
    // The question bank's and the diagram calls' own stages carry hashed ids
    // and sit inside diagrams.fill; counting them too would double the time.
    const phase = s.stageId === "diagrams.fill" ? "diagrams" : /^[0-9a-f]{64}$/.test(s.stageId || "") ? null : phaseForStage({ stageId: s.stageId });
    if (!phase || !(s.durationMs > 0)) continue;
    const key = s.runId || s.jobId;
    const row = phaseMsByRun.get(key) || Object.fromEntries(PHASE_KEYS.map((k) => [k, 0]));
    row[phase] += s.durationMs;
    phaseMsByRun.set(key, row);
  }
  const stats = {};
  const skipped = {};
  for (const run of completed) {
    const job = jobs.get(run.jobId);
    const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
    if (!job) { skip("job_deleted"); continue; }
    if (job.derivation === "revision" || job.revisionInstruction) { skip("revision"); continue; }
    if (!(run.activeElapsedMs > 0)) { skip("no_active_time"); continue; }
    const questions = questionsByJob.get(run.jobId) || job.questionCount;
    if (!(questions > 0)) { skip("no_question_count"); continue; }
    const sample = { questions, activeMs: run.activeElapsedMs, phaseMs: phaseMsByRun.get(run.runId || run.jobId) };
    stats[kindKey(job)] = addSample(stats[kindKey(job)], sample);
    stats.all = addSample(stats.all, sample);
  }
  return { stats, skipped };
}

function questionCountFromJson(raw) {
  try { return countResourceQuestions(JSON.parse(raw)); } catch { return 0; }
}

async function main() {
  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();
  console.log(`Reading ${FRESHNESS} of resource logs from ${PROJECT_ID}…`);
  const completed = readLogs('jsonPayload.event="job.completed"');
  const plans = readLogs('jsonPayload.event="plan.resolved"');
  const stages = readLogs('jsonPayload.event="stage.completed"');
  console.log(`${completed.length} completed runs, ${plans.length} plans, ${stages.length} stages`);
  const jobs = new Map();
  const ids = [...new Set(completed.map((r) => r.jobId))];
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await db.getAll(...ids.slice(i, i + 100).map((id) => db.collection("resourceJobs").doc(id)));
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = snap.data();
      jobs.set(snap.id, { resourceType: d.resourceType, subject: d.subject, answerMode: d.answerMode, derivation: d.derivation,
        revisionInstruction: d.revisionInstruction, questionCount: questionCountFromJson(d.generatedJson) });
    }
  }
  const { stats, skipped } = buildStats({ completed, plans, stages, jobs });
  for (const [key, s] of Object.entries(stats)) {
    console.log(key.padEnd(36), `n=${s.n}`.padEnd(6), `mean ${Math.round(s.st / s.n)}s for ${Math.round(s.sq / s.n)} questions`,
      s.shares ? Object.entries(s.shares).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" ") : "");
  }
  console.log("skipped", skipped);
  if (!args.write) { console.log("Dry run. Pass --write to save."); return; }
  const batch = db.batch();
  for (const [key, s] of Object.entries(stats)) batch.set(db.collection(STATS_COLLECTION).doc(key), { ...s, updatedAt: new Date(), seededBy: "RES-73 backfill" });
  await batch.commit();
  console.log(`Wrote ${Object.keys(stats).length} stats documents.`);
}

if (require.main === module) main().catch((err) => { console.error(err); process.exit(1); });
module.exports = { buildStats };
