"use strict";

/*
 * Removes only what the seed script created.
 *
 * Scoping is by the `seed.tag` field stamped on every seeded document, never
 * "delete everything in the collection". That is what makes it safe to run
 * against a staging project that also holds hand-made test data.
 *
 * `seed.tag` is a nested map field, which Firestore single-field indexes
 * automatically, so these equality queries need no entry in
 * backend/firebase/indexes/firestore.indexes.json.
 *
 * counters/invoices is deliberately NOT reset. Rewinding a monotonic invoice
 * allocator is how you get duplicate invoice numbers.
 */

const SEEDED_COLLECTIONS = Object.freeze([
  "terms",
  "users",
  "userSettings",
  "students",
  "classes",
  "invoices",
  "chats",
  "announcements",
  "feedback",
  "waitlistEntries",
  "enrolments",
]);

// Subcollections are orphaned by a parent delete, so they are cleared through
// collection-group queries. Same reason test/helpers/emulator.js has
// clearCollectionGroup alongside clearCollection.
const SEEDED_COLLECTION_GROUPS = Object.freeze([
  "attendance",
  "payments",
  "messages",
]);

const DELETE_BATCH_SIZE = 450;

async function deleteMatching(db, query, { commit }) {
  let deleted = 0;

  for (;;) {
    const snap = await query.limit(DELETE_BATCH_SIZE).get();
    if (snap.empty) break;

    deleted += snap.size;
    if (!commit) break; // dry run: report the first page and stop

    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    if (snap.size < DELETE_BATCH_SIZE) break;
  }

  return deleted;
}

/**
 * @returns {Promise<{deletedDocs: Record<string,number>, deletedAuthUsers: number,
 *                    skipped: string[], total: number}>}
 */
async function resetSeededData({ db, auth, seedTag, emailPattern, commit, logger }) {
  const deletedDocs = {};
  const skipped = [];
  let total = 0;

  // Auth users are resolved from the seeded users docs BEFORE those docs are
  // deleted, and each candidate must satisfy two independent conditions
  // (seeded doc + matching email) because auth.deleteUser is unrecoverable.
  const seededUsers = await db
    .collection("users")
    .where("seed.tag", "==", seedTag)
    .get();

  const authCandidates = [];
  for (const doc of seededUsers.docs) {
    const email = doc.data()?.email;
    if (typeof email === "string" && emailPattern.test(email)) {
      authCandidates.push({ uid: doc.id, email });
    } else {
      skipped.push(`auth:${doc.id} (email "${email}" did not match the seed pattern)`);
    }
  }

  for (const collectionName of SEEDED_COLLECTIONS) {
    const count = await deleteMatching(
      db,
      db.collection(collectionName).where("seed.tag", "==", seedTag),
      { commit }
    );
    if (count > 0) deletedDocs[collectionName] = count;
    total += count;
  }

  for (const groupName of SEEDED_COLLECTION_GROUPS) {
    const count = await deleteMatching(
      db,
      db.collectionGroup(groupName).where("seed.tag", "==", seedTag),
      { commit }
    );
    if (count > 0) deletedDocs[`*/${groupName}`] = count;
    total += count;
  }

  let deletedAuthUsers = 0;
  for (const candidate of authCandidates) {
    if (!commit) {
      deletedAuthUsers += 1;
      continue;
    }
    try {
      await auth.deleteUser(candidate.uid);
      deletedAuthUsers += 1;
      logger?.(`  deleted auth user ${candidate.email}`);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        skipped.push(`auth:${candidate.uid} (already absent)`);
      } else {
        throw err;
      }
    }
  }

  return { deletedDocs, deletedAuthUsers, skipped, total };
}

module.exports = {
  SEEDED_COLLECTIONS,
  SEEDED_COLLECTION_GROUPS,
  resetSeededData,
};
