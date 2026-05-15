import { callFunction } from "./callable";
import { listDocuments, orderBy } from "./firestoreReads";
import { normalizeWaitlistEntry } from "./schemas";

export function listWaitlist(filters = {}) {
  return listDocuments("waitlistEntries", {
    constraints: [orderBy("createdAt", "desc")],
    normalize: normalizeWaitlistEntry,
  }).then((rows) => {
    return rows.filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      if (filters.classId && row.classId !== filters.classId) return false;
      return true;
    });
  });
}

export function promoteWaitlistEntry(entryId) {
  return callFunction("promoteWaitlistEntry", { entryId });
}

export function updateWaitlistEntryStatus(entryId, status, options = {}) {
  const payload = { entryId, status };
  if (options.offerExpiresAt) payload.offerExpiresAt = options.offerExpiresAt;
  return callFunction("updateWaitlistEntryStatus", payload);
}
