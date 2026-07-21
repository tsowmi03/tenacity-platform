"use strict";

/**
 * Initialise the Admin SDK against the local Firebase emulators.
 *
 * Run via:
 *   npm run test:emulator
 * which is:
 *   firebase emulators:exec --only auth,firestore --project <project>
 *     "node --test test/integration/**\/*.test.js"
 *
 * The emulators:exec command exports FIRESTORE_EMULATOR_HOST and
 * FIREBASE_AUTH_EMULATOR_HOST so the Admin SDK auto-connects.
 */

const admin = require("firebase-admin");

let cached = null;

function getAdmin(projectId = process.env.GCLOUD_PROJECT || "tenacity-tutoring-b8eb2") {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST not set — run integration tests via `npm run test:emulator`."
    );
  }
  if (!cached) {
    if (admin.apps.length === 0) {
      admin.initializeApp({ projectId });
    }
    cached = { admin, db: admin.firestore(), auth: admin.auth() };
  }
  return cached;
}

/**
 * Delete every doc in a collection. Convenience for tests — production code
 * should never recursively delete.
 */
async function clearCollection(db, name) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

/**
 * Delete every doc matching a collection group query. Used to clean up
 * subcollections (e.g. `attendance`) that `clearCollection` leaves behind
 * when only the parent doc is deleted.
 */
async function clearCollectionGroup(db, name) {
  const snap = await db.collectionGroup(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

module.exports = { getAdmin, clearCollection, clearCollectionGroup };
