/*
 * One-off backfill: populates `extractedTopics` on completed resourceJobs by
 * re-parsing each job's stored `generatedJson` and running the same topic
 * extraction the live pipeline uses. This lights up the resource suggestion
 * system for resources generated before the feature shipped.
 *
 * Usage:
 *   node scripts/backfillResourceTopics.js --dry-run
 *   node scripts/backfillResourceTopics.js
 *   node scripts/backfillResourceTopics.js --force
 *
 * Flags:
 *   --dry-run   Logs what would change, writes nothing.
 *   --force     Recompute extractedTopics even when the field already exists.
 *   --limit=N   Page size (max 500). Default 450.
 *
 * Auth: uses Application Default Credentials, or set
 * GOOGLE_APPLICATION_CREDENTIALS. Run --dry-run first.
 */

const admin = require("firebase-admin");

const { extractJobTopics } = require("../src/resources");
const { parseAiJsonResponse } = require("../src/resources/apiClient");

const PROJECT_ID = "tenacity-tutoring-b8eb2";
const COLLECTION = "resourceJobs";

/**
 * Pure decision for a single job document — no Firestore access, so it is unit
 * testable. Returns whether the job is eligible, the topics to write, and a
 * reason tag for reporting.
 */
function planJobTopicsBackfill(data, { force = false } = {}) {
  if (!data || data.status !== "complete") {
    return { eligible: false, reason: "not-complete" };
  }

  const hasField = Array.isArray(data.extractedTopics);
  if (hasField && !force) {
    return { eligible: false, reason: "already-set" };
  }

  const raw = data.generatedJson;
  if (typeof raw !== "string" || !raw.trim()) {
    return { eligible: true, extractedTopics: [], reason: "no-source" };
  }

  let parsed;
  try {
    parsed = parseAiJsonResponse(raw);
  } catch (err) {
    return { eligible: true, extractedTopics: [], reason: "parse-failed" };
  }

  return { eligible: true, extractedTopics: extractJobTopics(parsed), reason: "derived" };
}

function parseArgs(argv) {
  const args = { dryRun: false, force: false, limit: 450 };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--force") args.force = true;
    else if (raw.startsWith("--limit=")) {
      const n = Number(raw.split("=")[1]);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --limit value: ${raw}`);
      }
      args.limit = Math.min(500, Math.floor(n));
    }
  }
  return args;
}

async function backfillResourceTopics({ dryRun, force, limit }) {
  const db = admin.firestore();

  const stats = {
    scanned: 0,
    completed: 0,
    alreadySet: 0,
    derived: 0,
    withTopics: 0,
    noSource: 0,
    parseFailed: 0,
    updated: 0,
  };
  let lastDoc = null;

  console.log(JSON.stringify({ projectId: PROJECT_ID, collection: COLLECTION, dryRun, force, limit }, null, 2));

  while (true) {
    let query = db
      .collection(COLLECTION)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(limit);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    stats.scanned += snap.size;

    const batch = db.batch();
    let batchOps = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.status === "complete") stats.completed += 1;

      const plan = planJobTopicsBackfill(data, { force });
      if (!plan.eligible) {
        if (plan.reason === "already-set") stats.alreadySet += 1;
        continue;
      }

      if (plan.reason === "derived") {
        stats.derived += 1;
        if (plan.extractedTopics.length) stats.withTopics += 1;
      } else if (plan.reason === "no-source") {
        stats.noSource += 1;
      } else if (plan.reason === "parse-failed") {
        stats.parseFailed += 1;
      }

      if (!dryRun) {
        batch.update(doc.ref, { extractedTopics: plan.extractedTopics });
        batchOps += 1;
        stats.updated += 1;
      }
    }

    if (!dryRun && batchOps > 0) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(
      `[page] scanned=${stats.scanned} completed=${stats.completed} derived=${stats.derived} withTopics=${stats.withTopics} writes=${stats.updated} last=${lastDoc.id}`
    );
  }

  console.log("\nDone.");
  console.log(JSON.stringify(stats, null, 2));
  if (dryRun) console.log("Dry run only; no writes were performed.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  admin.initializeApp({ projectId: PROJECT_ID });
  await backfillResourceTopics(args);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  });
}

module.exports = { planJobTopicsBackfill };
