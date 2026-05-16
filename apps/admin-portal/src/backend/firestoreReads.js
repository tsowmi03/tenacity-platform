import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db, firebaseConfig } from "../firebaseConfig";
import { BackendError } from "./callable";

export { limitQuery, orderBy, startAfter, where };

export function assertFirestoreConfigured() {
  if (!firebaseConfig?.projectId) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firebase is not configured. Check your VITE_FIREBASE_* env vars.",
    });
  }
  if (!db) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firestore is not configured.",
    });
  }
}

export function timestampToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function timestampToIso(value) {
  const date = timestampToDate(value);
  return date ? date.toISOString() : null;
}

export function normalizeDocument(id, data = {}) {
  return { id, ...data };
}

export async function getDocument(collectionPath, id, { normalize = normalizeDocument } = {}) {
  assertFirestoreConfigured();
  if (!id) {
    throw new BackendError({
      code: "invalid-argument",
      message: "Document id is required.",
    });
  }
  const snap = await getDoc(doc(db, collectionPath, id));
  if (!snap.exists()) return null;
  return normalize(snap.id, snap.data() || {});
}

export async function listDocuments(collectionPath, { constraints = [], normalize = normalizeDocument } = {}) {
  assertFirestoreConfigured();
  const source = constraints.length
    ? query(collection(db, collectionPath), ...constraints)
    : collection(db, collectionPath);
  const snap = await getDocs(source);
  return snap.docs.map((item) => normalize(item.id, item.data() || {}));
}
