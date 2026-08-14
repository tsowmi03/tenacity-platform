import { httpsCallable } from "firebase/functions";
import { firebaseConfig, functions } from "../firebaseConfig";

export class BackendError extends Error {
  constructor({
    code = "unknown",
    message = "Backend request failed.",
    details = null,
    warnings = [],
    userMessage = "",
    serverMessage = "",
  }) {
    super(message);
    this.name = "BackendError";
    this.code = normalizeCode(code);
    this.details = details;
    this.warnings = Array.isArray(warnings) ? warnings : [];
    // A human-friendly, actionable message safe to show in the UI. Always set so
    // callers can rely on `error.userMessage` without falling back to raw text.
    this.userMessage = userMessage || message;
    // The original message from the server, preserved even when we replace the
    // primary message with friendlier copy (useful for logs / "show details").
    this.serverMessage = serverMessage || message;
  }
}

function normalizeCode(code) {
  return String(code || "unknown").replace(/^functions\//, "");
}

// Codes whose server-provided message is typically opaque or unsafe to show
// (raw stack-ish text, "INTERNAL", transport noise). For these we lead with a
// friendly message and keep the original on `serverMessage`.
const GENERIC_CODES = new Set([
  "internal",
  "unknown",
  "unavailable",
  "deadline-exceeded",
  "resource-exhausted",
  "cancelled",
  "aborted",
  "data-loss",
]);

const FRIENDLY_BY_CODE = {
  unauthenticated:
    "Your session has expired. Sign out and back in, then try again.",
  "permission-denied":
    "You don't have permission to do this. Ask an administrator if you think you should.",
  "not-found":
    "We couldn't find that item. It may have been deleted or moved — refresh and try again.",
  "already-exists": "That item already exists.",
  unavailable:
    "The service is temporarily unavailable. Check your connection and try again in a moment.",
  "deadline-exceeded":
    "The request timed out before it finished. Try again — if it keeps happening the service may be busy.",
  "resource-exhausted":
    "The service is busy right now (rate limit reached). Wait a moment and try again.",
  cancelled: "The request was cancelled before it finished.",
  aborted: "The request was interrupted. Try again.",
  internal:
    "Something went wrong on our end. Please try again. If it keeps happening, contact an administrator.",
  unknown:
    "Something went wrong. Please try again. If it keeps happening, contact an administrator.",
  "data-loss":
    "Something went wrong on our end. Please try again. If it keeps happening, contact an administrator.",
};

/**
 * Map a (normalized) error code to a clear, actionable message, or null when we
 * have no friendlier copy than the server already provides.
 */
export function friendlyMessageForCode(code) {
  return FRIENDLY_BY_CODE[normalizeCode(code)] || null;
}

export function normalizeBackendError(error, fallbackMessage = "Backend request failed.") {
  if (error instanceof BackendError) return error;

  const code = normalizeCode(error?.code);
  const details = error?.details ?? error?.customData ?? null;
  const warnings = Array.isArray(details?.warnings)
    ? details.warnings
    : Array.isArray(error?.warnings)
      ? error.warnings
      : [];

  const serverMessage = error?.message || "";
  const friendly = friendlyMessageForCode(code);

  // For opaque/transport-level codes lead with friendly copy; otherwise the
  // server message is specific (validation, precondition, not-found, …) so keep
  // it and use friendly copy only as a fallback.
  const message = GENERIC_CODES.has(code)
    ? friendly || serverMessage || fallbackMessage
    : serverMessage || friendly || fallbackMessage;

  return new BackendError({
    code,
    message,
    details,
    warnings,
    userMessage: friendly || message,
    serverMessage: serverMessage || message,
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
