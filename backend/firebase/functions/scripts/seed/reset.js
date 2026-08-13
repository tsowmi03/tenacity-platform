"use strict";

/*
 * Removes only what the seed script created.
 *
 * Top-level collections are scoped by the `seed.tag` field stamped on every
 * seeded document, never "delete everything in the collection". That is what
 * makes it safe to run against a staging project that also holds hand-made
 * test data.
 *
 * Subcollections are the deliberate exception: EVERY document under a seeded
 * parent is deleted, tagged or not. A message you sent by hand while testing
 * lives under a seeded chat, and filtering it out would leave it orphaned and
 * unreachable once the parent goes. Expect the reset count to exceed the seed
 * count when you have been using the app.
 *
 * Subcollections are cleared by walking their seeded PARENT documents rather
 * than with a collection-group query. Firestore auto-indexes `seed.tag` for
 * ordinary collection queries, but a collection-group query additionally
 * requires an explicit COLLECTION_GROUP_ASC single-field exemption, which the
 * real project rejects the query without. Adding that exemption would mean
 * editing backend/firebase/indexes/firestore.indexes.json — a hash-pinned file
 * that also deploys to production — to support a seed-only field. Walking
 * parents avoids the index entirely and is more precise anyway.
 *
 * Note the emulator does NOT enforce index requirements, so the integration
 * test cannot catch a regression here. This was found against real staging.
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

// Subcollections are orphaned by a parent delete, so they must be cleared
// explicitly. Each entry is walked via its seeded parent documents — see the
// module comment for why this is not a collection-group query.
const SEEDED_SUBCOLLECTIONS = Object.freeze([
  { parent: "classes", sub: "attendance" },
  { parent: "invoices", sub: "payments" },
  { parent: "chats", sub: "messages" },
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

  // Subcollections BEFORE their parents: deleting a parent document does not
  // delete its subcollections, and once the parent is gone the seeded children
  // can no longer be reached by id.
  for (const { parent, sub } of SEEDED_SUBCOLLECTIONS) {
    const parents = await db
      .collection(parent)
      .where("seed.tag", "==", seedTag)
      .get();

    let count = 0;
    for (const parentDoc of parents.docs) {
      count += await deleteMatching(db, parentDoc.ref.collection(sub), {
        commit,
      });
    }
    if (count > 0) deletedDocs[`${parent}/*/${sub}`] = count;
    total += count;
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
  SEEDED_SUBCOLLECTIONS,
  resetSeededData,
};
