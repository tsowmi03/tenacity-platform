import { listDocuments, limitQuery, orderBy, timestampToIso } from "./firestoreReads";
import { normalizeTerm } from "./schemas";

export function listTerms() {
  return listDocuments("terms", {
    constraints: [orderBy("year", "desc"), orderBy("termNum", "desc")],
    normalize: normalizeTerm,
  });
}

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

export function getClientFirebaseConfig() {
  return {
    projectId:     import.meta.env.VITE_FIREBASE_PROJECT_ID     || null,
    authDomain:    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN    || null,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || null,
    appId:         import.meta.env.VITE_FIREBASE_APP_ID         || null,
    apiKey:        import.meta.env.VITE_FIREBASE_API_KEY ? "configured" : null,
    region:        "us-central1",
  };
}
