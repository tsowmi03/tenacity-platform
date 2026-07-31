import { listDocuments, orderBy } from "./firestoreReads";
import { serverTimestamp, updateDocument } from "./firestoreWrites";
import { normalizeYear11Interest } from "./schemas";

const COLLECTION = "year11Interest";

/**
 * Year 11 interest registrations, newest first.
 *
 * The whole collection is fetched and filtered in the page - these are
 * expressions of interest for a single cohort, so the row count stays small.
 */
export async function listYear11Interest() {
  const rows = await listDocuments(COLLECTION, {
    constraints: [orderBy("createdAt", "desc")],
    normalize: normalizeYear11Interest,
  });

  return rows.sort((a, b) => {
    const byDate = String(b.createdAtIso || "").localeCompare(
      String(a.createdAtIso || "")
    );
    if (byDate !== 0) return byDate;
    // Keep siblings in submission order within one family.
    const aIndex = Number.isInteger(a.registrationGroupIndex)
      ? a.registrationGroupIndex
      : 0;
    const bIndex = Number.isInteger(b.registrationGroupIndex)
      ? b.registrationGroupIndex
      : 0;
    return aIndex - bIndex || a.id.localeCompare(b.id);
  });
}

/** Marks a registration as new or contacted. */
export function setYear11InterestStatus(interestId, status) {
  return updateDocument(COLLECTION, interestId, {
    status,
    statusUpdatedAt: serverTimestamp(),
  });
}

/** Archives or restores a registration. */
export function setYear11InterestArchived(interestId, archived) {
  return updateDocument(COLLECTION, interestId, {
    archived: archived === true,
    statusUpdatedAt: serverTimestamp(),
  });
}
