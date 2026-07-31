/*
 * One-off backfill script: derives `marks` for attendance documents whose roll
 * was marked before the marks map existed.
 *
 * Background: the roll used to overwrite a session's `attendance` array with
 * the students who turned up, conflating "who is booked" with "who was here".
 * The two are now separate — `attendance` is the booking list, `marks` records
 * the roll — and this reconstructs `marks` for the documents where the old
 * array genuinely was an attendance record.
 *
 * Only documents with `rollCompletedAt` set are touched. For a roll nobody
 * finished, absence from the array does not mean the student was away — it
 * means nobody had reached them yet — and guessing `away` would invent
 * absences that never happened.
 *
 * For each eligible document:
 *   - every id in `attendance`             -> here
 *   - every enrolled student not in it     -> away
 *
 * The roster comes from the class's current `enrolledStudents`, which is the
 * best available record; a student who has since left the class simply gets no
 * mark, which reads as unmarked rather than as a fabricated absence.
 *
 * Usage:
 *   node scripts/backfillRollMarks.js --dry-run
 *   node scripts/backfillRollMarks.js
 *   node scripts/backfillRollMarks.js --limit=200
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

/**
 * The marks implied by a completed roll, or null when the document should be
 * left alone.
 *
 * Exported shape kept simple and pure so the decision is readable on its own:
 * everything this script writes is decided here.
 */
function marksFor(data, enrolledStudents) {
  if (!data || !data.rollCompletedAt) return null;
  if (data.marks && Object.keys(data.marks).length > 0) return null;

  const present = Array.isArray(data.attendance) ? data.attendance : [];
  const marks = {};

  for (const id of present) {
    marks[id] = "here";
  }
  for (const id of enrolledStudents) {
    if (!marks[id]) marks[id] = "away";
  }

  return Object.keys(marks).length > 0 ? marks : null;
}

async function loadEnrolmentsByClass() {
  const snap = await db.collection("classes").get();
  const byClass = new Map();

  for (const doc of snap.docs) {
    const enrolled = doc.get("enrolledStudents");
    byClass.set(doc.id, Array.isArray(enrolled) ? enrolled : []);
  }

  return byClass;
}

/** `classes/<classId>/attendance/<docId>` -> classId. */
function classIdFor(doc) {
  const parts = doc.ref.path.split("/");
  return parts.length >= 2 ? parts[1] : null;
}

async function backfillRollMarks({ dryRun, limit }) {
  const enrolmentsByClass = await loadEnrolmentsByClass();

  let scanned = 0;
  let stamped = 0;
  let eligible = 0;
  let updated = 0;
  let hereWritten = 0;
  let awayWritten = 0;

  let lastDoc = null;

  console.log(
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        collectionGroup: "attendance",
        classesLoaded: enrolmentsByClass.size,
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

    const batch = db.batch();
    let batchOps = 0;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.rollCompletedAt) stamped += 1;

      const classId = classIdFor(doc);
      const enrolled = classId ? enrolmentsByClass.get(classId) || [] : [];
      const marks = marksFor(data, enrolled);
      if (!marks) continue;

      eligible += 1;
      for (const value of Object.values(marks)) {
        if (value === "here") hereWritten += 1;
        else awayWritten += 1;
      }

      if (!dryRun) {
        batch.update(doc.ref, { marks });
        batchOps += 1;
      }
    }

    if (!dryRun && batchOps > 0) {
      await batch.commit();
      updated += batchOps;
    }

    lastDoc = snap.docs[snap.docs.length - 1];

    console.log(
      `[page] scanned=${scanned} stamped=${stamped} eligible=${eligible} updated=${updated} last=${lastDoc.id} writesThisPage=${batchOps}`,
    );
  }

  console.log("\nDone.");
  console.log(
    JSON.stringify(
      {
        scanned,
        stamped,
        eligible,
        updated,
        hereWritten,
        awayWritten,
        dryRun,
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
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  // Use Application Default Credentials (recommended), or set
  // GOOGLE_APPLICATION_CREDENTIALS.
  admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();

  await backfillRollMarks({ dryRun, limit });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  });
}

module.exports = { marksFor };
