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
  return getDownloadURL(ref(storage, path));
}
