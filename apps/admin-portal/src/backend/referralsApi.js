import { callFunction } from "./callable";
import { listDocuments, orderBy } from "./firestoreReads";
import { normalizeReferral } from "./schemas";

const COLLECTION = "referrals";

export const REFERRAL_STATUS_OPTIONS = [
  { code: "pending", label: "Pending", tone: "info" },
  { code: "successful", label: "Successful", tone: "success" },
  { code: "rejected", label: "Rejected", tone: "neutral" },
];

export function referralStatusLabel(code) {
  return REFERRAL_STATUS_OPTIONS.find((o) => o.code === code)?.label || "Pending";
}

export function referralStatusTone(code) {
  return REFERRAL_STATUS_OPTIONS.find((o) => o.code === code)?.tone || "neutral";
}

/**
 * Referrals recorded when an admin accepts an enrolment that came through a
 * parent's referral link (TP-33), newest first. One row per referrer and new
 * family; siblings share a row, so `enrolmentIds` can hold several.
 */
export function listReferrals() {
  return listDocuments(COLLECTION, {
    constraints: [orderBy("createdAt", "desc")],
    normalize: normalizeReferral,
  });
}

/**
 * Records the admin's decision. Goes through `adminUpdateReferral` so the
 * change is audited server-side.
 */
export function setReferralStatus(referralId, status) {
  return callFunction("adminUpdateReferral", { referralId, status });
}

/**
 * Records that the reward has (or has not) been applied by hand on the
 * invoices. Nothing here changes an invoice.
 */
export function setReferralRewardApplied(referralId, rewardApplied) {
  return callFunction("adminUpdateReferral", {
    referralId,
    rewardApplied: rewardApplied === true,
  });
}
