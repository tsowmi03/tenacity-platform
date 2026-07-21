"use strict";

const logger = require("firebase-functions/logger");

/**
 * Get-or-create the Firebase Auth user for a given email.
 *
 * Mirrors the existing `ensureParentAuthUser` in `portal/overrides.js` so the
 * portal admin create flows behave the same way as enrolment acceptance. The
 * `admin` SDK is injected so tests can swap it for a stub.
 *
 * Returns `{ uid, created }`:
 *  - `uid`: the Firebase Auth uid
 *  - `created`: true if a new auth account was just provisioned (so the caller
 *    can decide whether to send a welcome email)
 *
 * The temporary password is random and ~10 chars — the user is expected to
 * reset their password via `sendCustomPasswordResetEmail`.
 */
async function ensureAuthUser(
  { email, firstName, lastName, temporaryPassword },
  { admin }
) {
  if (!admin) throw new TypeError("ensureAuthUser requires admin");
  const normalised = String(email || "").trim().toLowerCase();
  if (!normalised) throw new TypeError("ensureAuthUser requires email");

  try {
    const existing = await admin.auth().getUserByEmail(normalised);
    logger.info("[ensureAuthUser] reused existing auth user", {
      uid: existing.uid,
      email: normalised,
    });
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
  }

  const password =
    temporaryPassword ||
    `T${Math.random().toString(36).slice(-12)}${Math.floor(Math.random() * 1e4)}`;
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const created = await admin.auth().createUser({
    email: normalised,
    password,
    displayName: displayName || undefined,
  });
  logger.info("[ensureAuthUser] created new auth user", {
    uid: created.uid,
    email: normalised,
  });
  return { uid: created.uid, created: true };
}

module.exports = { ensureAuthUser };
