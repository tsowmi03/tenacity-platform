"use strict";

// RES-56. One Firestore doc per Drive file under Resources/Maths, keyed by its
// Drive file ID, saying whether the question bank extracts it. Extraction
// (RES-57) works through the "pending" docs whose `version` it has not yet
// extracted, so a changed file is picked up again without any reset here.

const SOURCES_COLLECTION = "questionBankSources";
const BATCH_LIMIT = 400;

// Fields the sync owns; anything else on the doc (extraction progress) is left
// alone.
const SYNCED_FIELDS = ["name", "path", "mimeType", "bytes", "md5", "modifiedTime", "version", "status", "skipReason", "duplicateOf"];

function versionOf(file) {
  return `${file.md5 || ""}:${file.modifiedTime || ""}`;
}

/**
 * The version to record for a file the sync has seen before. Renaming a file
 * in Drive changes its last-modified time but not its contents, and the
 * modified time is half of the version, so a rename looked like a changed
 * file and had it extracted again (RES-121: TP-47 renames every file). While
 * the checksum is the same the version stays what it was. Google-native files
 * have no checksum; for them the modified time is all there is.
 */
function versionFor(plan, current) {
  if (current?.version && current.md5 && current.md5 === plan.md5) return current.version;
  return versionOf(plan);
}

/**
 * Compares the planned sources with what Firestore holds and returns only the
 * docs that need writing. Pure, so it is unit testable.
 *
 * @param {Map<string, object>} existing Firestore data by Drive file ID
 * @param {Array<object>} plans output of planSources()
 * @param {{fields?: string[]}} [options] the fields the sync owns (the English
 *   bank adds its own)
 */
function planSourceWrites(existing, plans, { fields = SYNCED_FIELDS } = {}) {
  const writes = [];
  const seen = new Set();
  for (const plan of plans) {
    seen.add(plan.id);
    const current = existing.get(plan.id);
    const record = Object.fromEntries(fields.map((field) => [field, field === "version" ? versionFor(plan, current) : plan[field] ?? null]));
    if (!current) {
      writes.push({ id: plan.id, change: "new", data: record });
    } else if (fields.some((field) => (current[field] ?? null) !== record[field])) {
      writes.push({ id: plan.id, change: current.version === record.version ? "updated" : "changed", data: record });
    }
  }
  for (const [id, current] of existing) {
    if (!seen.has(id) && current.status !== "removed") {
      writes.push({ id, change: "removed", data: { status: "removed", skipReason: null } });
    }
  }
  return writes;
}

async function loadSources(db, { collection = SOURCES_COLLECTION } = {}) {
  const snapshot = await db.collection(collection).get();
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
}

async function applySourceWrites(db, writes, { now = new Date(), collection = SOURCES_COLLECTION } = {}) {
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(start, start + BATCH_LIMIT)) {
      batch.set(db.collection(collection).doc(write.id), { ...write.data, syncedAt: now }, { merge: true });
    }
    await batch.commit();
  }
}

module.exports = {
  SOURCES_COLLECTION,
  SYNCED_FIELDS,
  applySourceWrites,
  loadSources,
  planSourceWrites,
  versionFor,
  versionOf,
};
