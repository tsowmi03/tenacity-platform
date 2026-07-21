import { listDocuments, limitQuery, orderBy, timestampToIso } from "./firestoreReads";

function normalizeAuditLog(id, data = {}) {
  return {
    id,
    ...data,
    createdAtIso: timestampToIso(data.createdAt),
  };
}

export function listRecentAuditLogs(max = 50) {
  return listDocuments("adminAuditLogs", {
    constraints: [orderBy("createdAt", "desc"), limitQuery(max)],
    normalize: normalizeAuditLog,
  });
}
