/*
 * One-off backfill script: adds `archived: false` to enrolment documents.
 *
 * Usage:
 *   node scripts/backfillArchived.js --dry-run
 *   node scripts/backfillArchived.js
 *   node scripts/backfillArchived.js --force
 *
 * Flags:
 *   --dry-run   Logs what would change, writes nothing.
 *   --force     Sets archived=false for ALL docs (even if archived already exists).
 *   --limit=N   Page size (max 500). Default 450.
 */

const admin = require("firebase-admin");

const PROJECT_ID = "tenacity-tutoring-b8eb2";

// Use Application Default Credentials (recommended), or set GOOGLE_APPLICATION_CREDENTIALS.
admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    limit: 450,
  };

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

async function backfillArchivedField({ dryRun, force, limit }) {
  const collectionName = "enrolments";

  let scanned = 0;
  let eligible = 0;
  let updated = 0;

  let lastDoc = null;

  console.log(
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        collection: collectionName,
        dryRun,
        force,
        limit,
      },
      null,
      2,
    ),
  );

  while (true) {
    let query = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(limit);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    scanned += snap.size;

    const batch = db.batch();
    let batchOps = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};

      eligible += 1;

      if (!dryRun) {
        batch.update(doc.ref, { archived: true });
        batchOps += 1;
      }
    }

    if (!dryRun && batchOps > 0) {
      await batch.commit();
      updated += batchOps;
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    console.log(
      `[page] scanned=${scanned} eligible=${eligible} updated=${updated} last=${lastDoc.id} writesThisPage=${batchOps}`,
    );
  }

  console.log("\nDone.");
  console.log(
    JSON.stringify(
      {
        scanned,
        eligible,
        updated,
        dryRun,
        force,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log("Dry run only; no writes were performed.");
  }
}

async function main() {
  const { dryRun, force, limit } = parseArgs(process.argv.slice(2));
  await backfillArchivedField({ dryRun, force, limit });
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exitCode = 1;
});
