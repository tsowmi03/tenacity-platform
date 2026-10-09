"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  updateReferralImpl,
  validateUpdateReferralPayload,
} = require("../../src/referrals/updateReferral");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-1", email: "admin@tenacitytutoring.com" };

describe("validateUpdateReferralPayload", () => {
  it("accepts a status, a reward flag, or both", () => {
    assert.deepEqual(
      validateUpdateReferralPayload({ referralId: "p1_p2", status: "successful" }),
      { referralId: "p1_p2", status: "successful" }
    );
    assert.deepEqual(
      validateUpdateReferralPayload({ referralId: "p1_p2", rewardApplied: true }),
      { referralId: "p1_p2", rewardApplied: true }
    );
  });

  it("rejects unknown statuses, non-boolean rewards and empty updates", () => {
    for (const bad of [
      { referralId: "p1_p2", status: "paid" },
      { referralId: "p1_p2", rewardApplied: "yes" },
      { referralId: "p1_p2" },
      { status: "successful" },
      null,
    ]) {
      assert.throws(() => validateUpdateReferralPayload(bad), JSON.stringify(bad));
    }
  });
});

describe("updateReferralImpl (firestore emulator)", () => {
  let db;
  let deps;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    deps = { db, clock: () => new Date("2026-10-09T05:00:00Z") };
    await Promise.all([
      clearCollection(db, "referrals"),
      clearCollection(db, "users"),
      clearCollection(db, "adminAuditLogs"),
    ]);
    await db.collection("users").doc("p1").set({ role: "parent", firstName: "Rae", lastName: "Referrer" });
    await db.collection("users").doc("p2").set({ role: "parent", firstName: "Nina", lastName: "New" });
    await db.collection("referrals").doc("p1_p2").set({
      referrerParentId: "p1",
      newParentId: "p2",
      enrolmentIds: ["e1"],
      status: "pending",
      rewardApplied: false,
      rewardAppliedAt: null,
    });
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "referrals"),
      clearCollection(db, "users"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  it("records the decision and audits it with before and after", async () => {
    const out = await updateReferralImpl({
      payload: { referralId: "p1_p2", status: "successful" },
      actor,
      deps,
    });

    assert.deepEqual(out.before, { status: "pending", rewardApplied: false });
    assert.deepEqual(out.after, { status: "successful", rewardApplied: false });
    const referral = (await db.collection("referrals").doc("p1_p2").get()).data();
    assert.equal(referral.status, "successful");
    assert.equal(referral.updatedBy, "admin-1");
    assert.equal(referral.referrerParentId, "p1", "who referred whom is untouched");

    const logs = (await db.collection("adminAuditLogs").get()).docs.map((d) => d.data());
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, "referral.update");
    assert.equal(logs[0].targetType, "referral");
    assert.equal(logs[0].targetId, "p1_p2");
    assert.equal(logs[0].targetName, "Rae Referrer → Nina New");
    assert.deepEqual(logs[0].after, { status: "successful", rewardApplied: false });
  });

  it("stamps rewardAppliedAt when the reward goes on and clears it when taken back", async () => {
    await updateReferralImpl({
      payload: { referralId: "p1_p2", rewardApplied: true },
      actor,
      deps,
    });
    let referral = (await db.collection("referrals").doc("p1_p2").get()).data();
    assert.equal(referral.rewardApplied, true);
    assert.equal(
      referral.rewardAppliedAt.toDate().toISOString(),
      "2026-10-09T05:00:00.000Z"
    );

    // Re-sending the same value keeps the original date.
    await updateReferralImpl({
      payload: { referralId: "p1_p2", rewardApplied: true },
      actor,
      deps: { ...deps, clock: () => new Date("2026-11-01T00:00:00Z") },
    });
    referral = (await db.collection("referrals").doc("p1_p2").get()).data();
    assert.equal(
      referral.rewardAppliedAt.toDate().toISOString(),
      "2026-10-09T05:00:00.000Z"
    );

    await updateReferralImpl({
      payload: { referralId: "p1_p2", rewardApplied: false },
      actor,
      deps,
    });
    referral = (await db.collection("referrals").doc("p1_p2").get()).data();
    assert.equal(referral.rewardApplied, false);
    assert.equal(referral.rewardAppliedAt, null);
  });

  it("returns not-found for a referral that doesn't exist, without auditing", async () => {
    await assert.rejects(
      updateReferralImpl({
        payload: { referralId: "nope", status: "rejected" },
        actor,
        deps,
      }),
      (err) => err.code === "not-found"
    );
    assert.equal((await db.collection("adminAuditLogs").get()).size, 0);
  });
});
