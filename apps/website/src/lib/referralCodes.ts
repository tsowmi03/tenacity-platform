import type { Firestore } from "firebase-admin/firestore";

// Mirrors backend/firebase/functions/src/referrals/referralCodes.js, which
// issues the codes. Six characters with 0/O and 1/I left out.
const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/**
 * The canonical form of a code from a link, or null when it cannot be one of
 * ours. Case and whitespace are forgiven; confusable characters are not
 * "corrected", since a guess could credit the wrong family.
 */
export const normaliseReferralCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
};

/**
 * The parent who owns `code`, or null if no one does. Reads the
 * `referralCodes` lookup that `getReferralLink` writes; clients can't read it,
 * so this only runs server-side.
 */
export const lookupReferrer = async (
  db: Firestore,
  code: string
): Promise<string | null> => {
  const snap = await db.collection("referralCodes").doc(code).get();
  const parentId = snap.exists ? snap.get("parentId") : null;
  return typeof parentId === "string" && parentId ? parentId : null;
};
