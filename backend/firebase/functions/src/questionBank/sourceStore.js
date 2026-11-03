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
 * Compares the planned sources with what Firestore holds and returns only the
 * docs that need writing. Pure, so it is unit testable.
 *
 * @param {Map<string, object>} existing Firestore data by Drive file ID
 * @param {Array<object>} plans output of planSources()
 */
function planSourceWrites(existing, plans) {
  const writes = [];
  const seen = new Set();
  for (const plan of plans) {
    seen.add(plan.id);
    const record = Object.fromEntries(SYNCED_FIELDS.map((field) => [field, field === "version" ? versionOf(plan) : plan[field] ?? null]));
    const current = existing.get(plan.id);
    if (!current) {
      writes.push({ id: plan.id, change: "new", data: record });
    } else if (SYNCED_FIELDS.some((field) => (current[field] ?? null) !== record[field])) {
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

async function loadSources(db) {
  const snapshot = await db.collection(SOURCES_COLLECTION).get();
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
}

async function applySourceWrites(db, writes, { now = new Date() } = {}) {
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(start, start + BATCH_LIMIT)) {
      batch.set(db.collection(SOURCES_COLLECTION).doc(write.id), { ...write.data, syncedAt: now }, { merge: true });
    }
    await batch.commit();
  }
}

module.exports = {
  SOURCES_COLLECTION,
  applySourceWrites,
  loadSources,
  planSourceWrites,
  versionOf,
};
