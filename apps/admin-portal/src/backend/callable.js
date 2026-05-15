import { httpsCallable } from "firebase/functions";
import { firebaseConfig, functions } from "../firebaseConfig";

export class BackendError extends Error {
  constructor({ code = "unknown", message = "Backend request failed.", details = null, warnings = [] }) {
    super(message);
    this.name = "BackendError";
    this.code = normalizeCode(code);
    this.details = details;
    this.warnings = Array.isArray(warnings) ? warnings : [];
  }
}

function normalizeCode(code) {
  return String(code || "unknown").replace(/^functions\//, "");
}

export function normalizeBackendError(error, fallbackMessage = "Backend request failed.") {
  if (error instanceof BackendError) return error;

  const details = error?.details ?? error?.customData ?? null;
  const warnings = Array.isArray(details?.warnings)
    ? details.warnings
    : Array.isArray(error?.warnings)
      ? error.warnings
      : [];

  return new BackendError({
    code: error?.code || "unknown",
    message: error?.message || fallbackMessage,
    details,
    warnings,
  });
}

export function assertFunctionsConfigured() {
  if (!firebaseConfig?.projectId) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firebase is not configured. Check your VITE_FIREBASE_* env vars.",
    });
  }
  if (!functions) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firebase Functions is not configured.",
    });
  }
}

export async function callFunction(name, payload = {}) {
  assertFunctionsConfigured();
  try {
    const fn = httpsCallable(functions, name);
    const result = await fn(payload);
    return result?.data;
  } catch (error) {
    throw normalizeBackendError(error, `Failed to call ${name}.`);
  }
}
