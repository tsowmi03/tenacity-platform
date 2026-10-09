"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_ISSUE_ATTEMPTS,
  getReferralLinkImpl,
} = require("../../src/referrals/getReferralLink");
const { REFERRAL_CODE_ALPHABET } = require("../../src/referrals/referralCodes");
const { getAdmin, clearCollection } = require("../helpers/emulator");

/** A random source that spells out `codes` one character at a time. */
function scripted(...codes) {
  const indexes = codes
    .join("")
    .split("")
    .map((ch) => REFERRAL_CODE_ALPHABET.indexOf(ch));
  let i = 0;
  return () => indexes[i++ % indexes.length];
}

describe("getReferralLinkImpl (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "referralCodes"),
    ]);
    await db.collection("users").doc("parent-1").set({
      role: "parent",
      firstName: "Pat",
      lastName: "Parent",
      students: [],
    });
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "referralCodes"),
    ]);
  });

  it("issues a code on first call and stores it in both places", async () => {
    const out = await getReferralLinkImpl({
      uid: "parent-1",
      deps: { db, randomInt: scripted("ABC234") },
    });

    assert.deepEqual(out, {
      code: "ABC234",
      link: "https://tenacitytutoring.com/r/ABC234",
    });
    const user = (await db.collection("users").doc("parent-1").get()).data();
    assert.equal(user.referralCode, "ABC234");
    const lookup = (await db.collection("referralCodes").doc("ABC234").get()).data();
    assert.equal(lookup.parentId, "parent-1");
    assert.ok(lookup.createdAt);
  });

  it("returns the same link on every later call", async () => {
    const first = await getReferralLinkImpl({ uid: "parent-1", deps: { db } });
    const second = await getReferralLinkImpl({ uid: "parent-1", deps: { db } });
    assert.deepEqual(second, first);
    const codes = await db.collection("referralCodes").get();
    assert.equal(codes.size, 1);
  });

  it("converges on one code when first calls race", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        getReferralLinkImpl({ uid: "parent-1", deps: { db } })
      )
    );
    const links = new Set(results.map((r) => r.link));
    assert.equal(links.size, 1);
    const codes = await db.collection("referralCodes").get();
    assert.equal(codes.size, 1);
  });

  it("skips a code that already belongs to someone else", async () => {
    await db.collection("referralCodes").doc("ABC234").set({ parentId: "other" });

    const out = await getReferralLinkImpl({
      uid: "parent-1",
      deps: { db, randomInt: scripted("ABC234", "XYZ789") },
    });

    assert.equal(out.code, "XYZ789");
    const taken = (await db.collection("referralCodes").doc("ABC234").get()).data();
    assert.equal(taken.parentId, "other", "existing owner untouched");
  });

  it("gives up after repeated collisions without writing anything", async () => {
    await db.collection("referralCodes").doc("ABC234").set({ parentId: "other" });

    await assert.rejects(
      getReferralLinkImpl({
        uid: "parent-1",
        deps: { db, randomInt: scripted("ABC234") },
      }),
      (err) => err.code === "resource-exhausted"
    );
    const user = (await db.collection("users").doc("parent-1").get()).data();
    assert.equal(user.referralCode, undefined);
    assert.ok(MAX_ISSUE_ATTEMPTS > 1);
  });

  it("refuses tutors, admins and unknown users", async () => {
    await db.collection("users").doc("tutor-1").set({ role: "tutor" });
    await db.collection("users").doc("admin-1").set({ role: "admin" });

    for (const uid of ["tutor-1", "admin-1", "nobody"]) {
      await assert.rejects(
        getReferralLinkImpl({ uid, deps: { db } }),
        (err) => err.code === "permission-denied",
        uid
      );
    }
    const codes = await db.collection("referralCodes").get();
    assert.equal(codes.size, 0);
  });
});
