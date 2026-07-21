import { getDownloadURL, ref } from "firebase/storage";
import { firebaseConfig, storage } from "../firebaseConfig";
import { BackendError } from "./callable";

export function assertStorageConfigured() {
  if (!firebaseConfig?.projectId) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firebase is not configured. Check your VITE_FIREBASE_* env vars.",
    });
  }
  if (!storage) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firebase Storage is not configured.",
    });
  }
}

export async function getDownloadUrlForPath(path) {
  if (!path) {
    throw new BackendError({
      code: "invalid-argument",
      message: "Storage path is required.",
    });
  }
  if (/^https?:\/\//i.test(path)) return path;
  assertStorageConfigured();
  try {
    return await getDownloadURL(ref(storage, path));
  } catch (error) {
    throw normalizeStorageError(error, path);
  }
}

function normalizeStorageError(error, path) {
  const raw = String(error?.code || error?.message || "").toLowerCase();
  if (raw.includes("object-not-found") || raw.includes("not-found")) {
    return new BackendError({
      code: "not-found",
      message: `Stored PDF file is missing at "${path}". Ask Xero to regenerate or re-upload it.`,
    });
  }
  if (raw.includes("unauthorized") || raw.includes("permission")) {
    return new BackendError({
      code: "permission-denied",
      message: "You do not have permission to read this file from Firebase Storage.",
    });
  }
  if (raw.includes("retry-limit") || raw.includes("server-file-wrong-size") || raw.includes("network")) {
    return new BackendError({
      code: "unavailable",
      message: "Could not reach Firebase Storage to fetch the file. Check your connection and retry.",
    });
  }
  return new BackendError({
    code: error?.code || "unknown",
    message: error?.message || `Could not get a download URL for "${path}".`,
  });
}
