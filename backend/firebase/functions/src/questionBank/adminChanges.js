"use strict";

// RES-104. Extraction writes bank records whole, by a deterministic ID, so
// re-extracting a changed file would otherwise bring back a hidden record and
// undo an admin's corrections. Every writer passes its records through here.
// No heavy dependencies: the extraction scripts and the callable both use it.

// Who did what to a record, and the flag history. Extraction never sets these.
const ADMIN_FIELDS = Object.freeze([
  "hiddenBy", "hiddenAt", "hiddenWith", "restoredBy", "restoredAt", "editedBy", "editedAt", "adminEditedFields",
  "flagCount", "lastFlaggedAt",
]);

/**
 * A freshly extracted record with the admin's decisions kept: a hidden record
 * stays hidden, and each field an admin corrected keeps the admin's value.
 *
 * @param {object} fresh the record as extraction built it
 * @param {object|null} existing the record already in Firestore, if any
 */
function keepAdminChanges(fresh, existing) {
  if (!existing) return fresh;
  const kept = { ...fresh };
  for (const field of ADMIN_FIELDS) if (existing[field] !== undefined) kept[field] = existing[field];
  for (const field of existing.adminEditedFields || []) if (existing[field] !== undefined) kept[field] = existing[field];
  if (existing.status === "hidden") kept.status = "hidden";
  return kept;
}

/**
 * Applies keepAdminChanges to records about to be written.
 *
 * @param {object} db Firestore
 * @param {Array<{collection: string, id: string, data: object}>} records
 */
async function withAdminChanges(db, records) {
  if (!records.length) return records;
  const snapshots = await db.getAll(...records.map((record) => db.collection(record.collection).doc(record.id)));
  return records.map((record, index) => ({
    ...record,
    data: keepAdminChanges(record.data, snapshots[index].exists ? snapshots[index].data() : null),
  }));
}

module.exports = { ADMIN_FIELDS, keepAdminChanges, withAdminChanges };
