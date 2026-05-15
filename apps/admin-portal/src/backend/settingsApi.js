import { listDocuments, limitQuery, orderBy } from "./firestoreReads";
import { normalizeTerm } from "./schemas";

export function listTerms() {
  return listDocuments("terms", {
    constraints: [orderBy("year", "desc"), orderBy("termNum", "desc")],
    normalize: normalizeTerm,
  });
}

export function listRecentAuditLogs(max = 50) {
  return listDocuments("adminAuditLogs", {
    constraints: [orderBy("createdAt", "desc"), limitQuery(max)],
  });
}

export function getClientFirebaseConfig() {
  return {
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || null,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || null,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || null,
  };
}
