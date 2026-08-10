import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the unsubscribe tokens minted by the weekly parent email.
 *
 * This mirrors `backend/firebase/functions/src/email/unsubscribeToken.js`; the
 * link is delivered by a Cloud Function but lands here, so both sides derive
 * the same HMAC from `EMAIL_BLAST_UNSUBSCRIBE_SECRET`. Keep the two in sync.
 */

const signUid = (uid: string, secret: string) =>
  createHmac("sha256", secret).update(uid).digest("hex");

export const unsubscribeSecret = () => {
  const secret = process.env.EMAIL_BLAST_UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error("EMAIL_BLAST_UNSUBSCRIBE_SECRET is not configured.");
  }
  return secret;
};

/** Returns the uid for an authentic token, otherwise null. Never throws. */
export const uidFromUnsubscribeToken = (
  token: unknown,
  secret: string
): string | null => {
  if (typeof token !== "string" || !secret) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const uid = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!uid || !signature) return null;

  const expected = signUid(uid, secret);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return uid;
};
