"use strict";

const admin = require("firebase-admin");

const { createdMeta, updatedMeta } = require("../shared/timestamps");

/**
 * `referrals/{id}`: one referring parent bringing in one new parent.
 *
 * The id is the pair, not the enrolment, because a family enrolling siblings
 * submits one enrolment per child. Keyed by enrolment, two siblings would be
 * two referrals and the referrer would look owed twice; keyed by the pair,
 * the second acceptance just adds its enrolment to the same record.
 *
 * Nothing here applies a discount. Admins decide whether a referral counts
 * (`status`) and record that they applied the reward by hand on the invoice
 * (`rewardApplied`) — see AWP-25.
 */

const REFERRAL_STATUSES = ["pending", "successful", "rejected"];

function referralDocId(referrerParentId, newParentId) {
  return `${referrerParentId}_${newParentId}`;
}

/**
 * The referrer an enrolment claims, or null when it claims none or claims the
 * very parent being created — a family cannot refer itself. Whether the
 * referrer is a real parent is checked inside the acceptance transaction.
 */
function claimedReferrer(enrolment, newParentId) {
  const referrer = enrolment?.referrerParentId;
  if (typeof referrer !== "string" || !referrer.trim()) return null;
  if (referrer === newParentId) return null;
  return referrer;
}

function newReferralDoc({
  referrerParentId,
  newParentId,
  enrolmentId,
  referralCode,
  newParentExisted,
  actorUid,
  clock,
}) {
  return {
    referrerParentId,
    newParentId,
    enrolmentIds: [enrolmentId],
    referralCode: referralCode || null,
    // An existing Tenacity family enrolling another child through someone's
    // link is not obviously a new family. Recorded so the admin can judge;
    // the referral is still created rather than silently dropped.
    newParentExisted: Boolean(newParentExisted),
    status: "pending",
    rewardApplied: false,
    rewardAppliedAt: null,
    ...createdMeta(actorUid, clock),
  };
}

function addEnrolmentToReferral({ enrolmentId, actorUid, clock }) {
  return {
    enrolmentIds: admin.firestore.FieldValue.arrayUnion(enrolmentId),
    ...updatedMeta(actorUid, clock),
  };
}

module.exports = {
  REFERRAL_STATUSES,
  referralDocId,
  claimedReferrer,
  newReferralDoc,
  addEnrolmentToReferral,
};
