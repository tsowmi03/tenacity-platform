"use strict";

const { HttpsError, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { toHttpsError } = require("../shared/errors");
const { now } = require("../shared/timestamps");
const {
  generateReferralCode,
  referralLink,
} = require("./referralCodes");

/**
 * A parent's referral link, issuing their code the first time it is asked for.
 *
 * Codes are issued lazily rather than backfilled: most parents will never
 * share, and a code that exists only once someone asks for it never has to be
 * migrated. The code lives in two places, written together:
 *  - `users/{uid}.referralCode`, so the parent's own link is one read away;
 *  - `referralCodes/{code}` -> `{ parentId }`, so the website can resolve a
 *    code without querying users. Admin SDK only — clients never see it.
 *
 * Parents cannot write `referralCode` themselves (it is outside the users
 * rules allowlist), which is why this is a callable and not a client write.
 *
 * Role comes from the users doc, not the auth claim: older parent accounts
 * predate the `role` claim, and the users doc is what every other parent
 * check in this package trusts.
 */

const MAX_ISSUE_ATTEMPTS = 5;

async function getReferralLinkImpl({ uid, deps }) {
  const { db, clock, randomInt } = deps;
  if (!db) throw new TypeError("getReferralLinkImpl requires db");
  if (!uid) throw new TypeError("getReferralLinkImpl requires uid");

  const userRef = db.collection("users").doc(uid);

  // Each attempt is its own transaction that re-reads the user, so two
  // concurrent first calls converge on one code: the loser's transaction is
  // retried by Firestore, sees the winner's referralCode, and returns it.
  for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt += 1) {
    const code = await db.runTransaction(async (txn) => {
      const userSnap = await txn.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError("permission-denied", "Parent account required");
      }
      const user = userSnap.data() || {};
      if (user.role !== "parent") {
        throw new HttpsError("permission-denied", "Parent account required");
      }
      if (typeof user.referralCode === "string" && user.referralCode) {
        return user.referralCode;
      }

      const candidate = generateReferralCode(randomInt);
      const codeRef = db.collection("referralCodes").doc(candidate);
      const codeSnap = await txn.get(codeRef);
      if (codeSnap.exists) return null;

      const issuedAt = now(clock);
      txn.set(codeRef, { parentId: uid, createdAt: issuedAt });
      txn.update(userRef, { referralCode: candidate });
      return candidate;
    });
    if (code) return { code, link: referralLink(code) };
  }

  throw new HttpsError(
    "resource-exhausted",
    "Could not issue a referral code; please try again"
  );
}

const getReferralLink = onCall({ region: "us-central1" }, async (request) => {
  const uid = request?.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign-in required");
  }
  try {
    return await getReferralLinkImpl({
      uid,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    if (!(err instanceof HttpsError)) {
      logger.error("[getReferralLink] failed", {
        uid,
        errorMessage: err?.message,
      });
    }
    throw toHttpsError(err);
  }
});

module.exports = {
  MAX_ISSUE_ATTEMPTS,
  getReferralLinkImpl,
  getReferralLink,
};
