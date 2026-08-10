"use strict";

const { createHmac, timingSafeEqual } = require("crypto");
const { defineSecret } = require("firebase-functions/params");

/**
 * Unsubscribe links in the weekly parent update.
 *
 * The link lands on the public website (`/unsubscribe`), not on a Function, so
 * the token has to be verifiable by both packages. Both sides derive the same
 * HMAC from `EMAIL_BLAST_UNSUBSCRIBE_SECRET`; keep the two implementations in
 * sync (website copy: `apps/website/src/lib/unsubscribeToken.ts`).
 *
 * The token intentionally carries no expiry: an unsubscribe link has to keep
 * working in an inbox months after the send.
 */

const unsubscribeSecret = defineSecret("EMAIL_BLAST_UNSUBSCRIBE_SECRET");

const DEFAULT_SITE_ORIGIN = "https://www.tenacitytutoring.com";

function signUid(uid, secret) {
  if (!uid) throw new TypeError("signUid requires uid");
  if (!secret) throw new TypeError("signUid requires a secret");
  return createHmac("sha256", secret).update(String(uid)).digest("hex");
}

function unsubscribeTokenFor(uid, secret) {
  return `${uid}.${signUid(uid, secret)}`;
}

/**
 * Returns the uid when the token is authentic, otherwise null. Never throws on
 * malformed input — callers treat every failure as "bad link".
 */
function uidFromUnsubscribeToken(token, secret) {
  if (typeof token !== "string" || !secret) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const uid = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  let expected;
  try {
    expected = signUid(uid, secret);
  } catch {
    return null;
  }
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return uid;
}

function urlFor(path, uid, secret, origin) {
  const token = unsubscribeTokenFor(uid, secret);
  return `${origin.replace(/\/+$/, "")}${path}?token=${encodeURIComponent(token)}`;
}

/** The link a parent clicks in the email; lands on a confirmation page. */
function unsubscribePageUrlFor(uid, secret, origin = DEFAULT_SITE_ORIGIN) {
  return urlFor("/unsubscribe", uid, secret, origin);
}

/**
 * The `List-Unsubscribe` target. RFC 8058 one-click POSTs to this URL, so it
 * has to be the API route rather than the page.
 */
function unsubscribeOneClickUrlFor(uid, secret, origin = DEFAULT_SITE_ORIGIN) {
  return urlFor("/api/unsubscribe", uid, secret, origin);
}

module.exports = {
  DEFAULT_SITE_ORIGIN,
  signUid,
  unsubscribeSecret,
  unsubscribeTokenFor,
  unsubscribeOneClickUrlFor,
  unsubscribePageUrlFor,
  uidFromUnsubscribeToken,
};
