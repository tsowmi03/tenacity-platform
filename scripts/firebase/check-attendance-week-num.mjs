#!/usr/bin/env node
/**
 * Pre-flight for the mobile timetable's collection-group week query.
 *
 * That query filters on `weekNum`, so any attendance document written without
 * the field would be invisible to it and its session would silently vanish
 * from the timetable. This reports how many such documents exist.
 *
 * Running this the first time found 466 of 894 documents missing the field:
 * the scheduled `rolloverTermData` function wrote `weekNumber` while the
 * class-creation callable wrote `weekNum`. Both the function and the existing
 * data have since been fixed (see `functions/scripts/backfillAttendanceWeekNum.js`),
 * so the expected answer is now zero — this stays as a regression check, since
 * a re-introduced split is invisible in the console and in the app alike.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/firebase/check-attendance-week-num.mjs
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const snapshot = await db.collectionGroup("attendance").get();

const missing = [];
for (const doc of snapshot.docs) {
  const weekNum = doc.get("weekNum");
  if (typeof weekNum !== "number") {
    missing.push({ path: doc.ref.path, weekNum });
  }
}

console.log(`attendance documents scanned: ${snapshot.size}`);
console.log(`missing a numeric weekNum:    ${missing.length}`);

if (missing.length > 0) {
  console.log("\nAffected documents (first 25):");
  for (const entry of missing.slice(0, 25)) {
    console.log(`  ${entry.path}  weekNum=${JSON.stringify(entry.weekNum)}`);
  }
  console.log(
    "\nBackfill these before shipping the client change, or the timetable " +
      "will silently drop their sessions.",
  );
  process.exit(1);
}

console.log("\nAll attendance documents carry weekNum — safe to deploy.");
