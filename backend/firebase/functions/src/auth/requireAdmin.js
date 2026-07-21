"use strict";

const { HttpsError } = require("firebase-functions/v2/https");

/**
 * Auth guards for portal admin operations.
 *
 * Two surfaces are supported:
 *   - `requireAdminCallable(request)` for `onCall` functions: reads `request.auth`
 *     and throws `HttpsError`.
 *   - `requireAdminOnRequest(req, admin)` for `onRequest` functions: verifies the
 *     `Authorization: Bearer <idToken>` header against Firebase Auth and throws
 *     `HttpsError` so callers can map to status codes consistently.
 *
 * `acceptPendingEnrolment` (portal override) currently re-implements bearer
 * verification inline. New admin onRequest endpoints should use this helper.
 */

function isAdminClaim(token) {
  return Boolean(token) && token.role === "admin";
}

/**
 * For callable (v2) functions.
 *   const actor = requireAdminCallable(request);
 *   // actor = { uid, email, claims }
 */
function requireAdminCallable(request) {
  const auth = request?.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Sign-in required");
  }
  if (!isAdminClaim(auth.token)) {
    throw new HttpsError("permission-denied", "Admin role required");
  }
  return {
    uid: auth.uid,
    email: auth.token?.email || null,
    claims: auth.token || {},
  };
}

/**
 * For onRequest (v2) functions. Requires a real `admin` SDK instance so the
 * helper can verify the bearer token. Throws HttpsError instead of writing
 * a response — the caller decides how to render the error.
 */
async function requireAdminOnRequest(req, admin) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new HttpsError("unauthenticated", "Missing bearer token");
  }
  const idToken = authHeader.slice("Bearer ".length).trim();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (_) {
    throw new HttpsError("unauthenticated", "Invalid or expired token");
  }
  if (!isAdminClaim(decoded)) {
    throw new HttpsError("permission-denied", "Admin role required");
  }
  return {
    uid: decoded.uid,
    email: decoded.email || null,
    claims: decoded,
  };
}

module.exports = {
  isAdminClaim,
  requireAdminCallable,
  requireAdminOnRequest,
};
