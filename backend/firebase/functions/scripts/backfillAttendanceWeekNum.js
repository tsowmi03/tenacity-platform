/*
 * One-off backfill script: gives every attendance document a numeric `weekNum`.
 *
 * Background: two write paths disagreed on the field name. The class-creation
 * callable (`src/classes/attendanceFactory.js`) has always written `weekNum`,
 * but the scheduled term rollover (`lib/timetable_functions.js`) wrote
 * `weekNumber`. A production scan found 466 of 894 documents carrying only
 * `weekNumber`, scattered through past, current and upcoming terms rather than
 * confined to old data.
 *
 * Nothing surfaced the split, because both readers fail quietly or loudly in
 * ways that looked like something else:
 *   - the mobile `Attendance` model reads `weekNum` and defaults to 0 when it
 *     is absent, so affected sessions silently carried week 0;
 *   - `src/classes/attendanceGeneration.js` throws `failed-precondition` when
 *     `weekNum` is not an integer, so the admin class-date propagation flow
 *     failed on exactly these documents.
 *
 * The rollover function now writes `weekNum`; this repairs what it already
 * wrote. `weekNumber` is deliberately left in place rather than deleted — the
 * admin portal still reads `data.weekNumber ?? data.weekNum` and removing a
 * field is the one part of this that could not be undone.
 *
 * The week is taken from `weekNumber` when it is a positive integer, and
 * otherwise parsed from the document id, which is `{termId}_W{week}` under
 * every write path without exception. A document that yields neither is
 * reported and skipped rather than guessed at.
 *
 * Usage:
 *   node scripts/backfillAttendanceWeekNum.js --dry-run
 *   node scripts/backfillAttendanceWeekNum.js
 *   node scripts/backfillAttendanceWeekNum.js --limit=200
 *
 * Flags:
 *   --dry-run   Logs what would change, writes nothing.
 *   --limit=N   Page size (max 500). Default 450.
 */

const admin = require("firebase-admin");

const PROJECT_ID = "tenacity-tutoring-b8eb2";

// Initialised in main() rather than at import, so the decision logic below can
// be unit tested without credentials or a live project.
let db = null;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: 450,
  };

  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
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

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** The trailing `_W<n>` of a `{termId}_W{week}` document id. */
function weekFromDocId(docId) {
  if (typeof docId !== "string") return null;
  const match = /_W(\d+)$/.exec(docId);
  if (!match) return null;
  return positiveInteger(Number(match[1]));
}

/**
 * The `weekNum` a document should be given, or null when it should be left
 * alone.
 *
 * Everything this script writes is decided here, so the rule stays readable on
 * its own: only documents genuinely missing a usable `weekNum` are touched,
 * and the value comes from the document's own `weekNumber` or id rather than
 * from anything inferred about ordering.
 */
function weekNumFor(data, docId) {
  if (!data) return null;

  // Already correct — including documents the fixed rollover writes from now
  // on, so a re-run is a no-op rather than a rewrite.
  if (positiveInteger(data.weekNum) !== null) return null;

  return positiveInteger(data.weekNumber) ?? weekFromDocId(docId);
}

async function backfillAttendanceWeekNum({ dryRun, limit }) {
  let scanned = 0;
  let alreadyCorrect = 0;
  let fromWeekNumber = 0;
  let fromDocId = 0;
  let updated = 0;
  const unresolved = [];

  let lastDoc = null;

  console.log(
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        collectionGroup: "attendance",
        dryRun,
        limit,
      },
      null,
      2,
    ),
  );

  while (true) {
    let query = db
      .collectionGroup("attendance")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(limit);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    scanned += snap.size;

    let batch = dryRun ? null : db.batch();
    let batchOps = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};

      if (positiveInteger(data.weekNum) !== null) {
        alreadyCorrect++;
        continue;
      }

      const weekNum = weekNumFor(data, doc.id);
      if (weekNum === null) {
        // Neither a usable `weekNumber` nor a parseable id. Reported rather
        // than guessed: a wrong week silently moves a session.
        unresolved.push(doc.ref.path);
        continue;
      }

      if (positiveInteger(data.weekNumber) !== null) fromWeekNumber++;
      else fromDocId++;

      console.log(
        `${dryRun ? "DRY_RUN" : "UPDATE"} ${doc.ref.path}: weekNum=${weekNum}` +
          `${positiveInteger(data.weekNumber) !== null ? " (from weekNumber)" : " (from doc id)"}`,
      );

      if (!dryRun) {
        batch.update(doc.ref, { weekNum });
        batchOps++;
      }
      updated++;
    }

    if (!dryRun && batchOps > 0) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    console.log(
      `[page] scanned=${scanned} alreadyCorrect=${alreadyCorrect} updated=${updated} last=${lastDoc.id} writesThisPage=${batchOps}`,
    );
  }

  console.log("\nDone.");
  console.log(
    JSON.stringify(
      {
        scanned,
        alreadyCorrect,
        updated,
        fromWeekNumber,
        fromDocId,
        unresolved: unresolved.length,
        dryRun,
      },
      null,
      2,
    ),
  );

  if (unresolved.length > 0) {
    console.log("\nCould not resolve a week for these documents:");
    for (const path of unresolved.slice(0, 50)) console.log(`  ${path}`);
    if (unresolved.length > 50) {
      console.log(`  ...and ${unresolved.length - 50} more`);
    }
  }

  if (dryRun) {
    console.log("Dry run only; no writes were performed.");
  }
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  // Use Application Default Credentials (recommended), or set
  // GOOGLE_APPLICATION_CREDENTIALS.
  admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();

  await backfillAttendanceWeekNum({ dryRun, limit });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  });
}

module.exports = { weekNumFor, weekFromDocId };
