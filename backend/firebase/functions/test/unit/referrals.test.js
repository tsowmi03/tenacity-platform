"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  generateReferralCode,
  normaliseReferralCode,
  referralLink,
} = require("../../src/referrals/referralCodes");
const {
  claimedReferrer,
  newReferralDoc,
  referralDocId,
} = require("../../src/referrals/referralRecords");

describe("referral codes", () => {
  it("leaves out the characters people confuse", () => {
    for (const confusable of ["0", "O", "1", "I"]) {
      assert.equal(REFERRAL_CODE_ALPHABET.includes(confusable), false, confusable);
    }
    assert.equal(new Set(REFERRAL_CODE_ALPHABET).size, REFERRAL_CODE_ALPHABET.length);
  });

  it("generates codes of the right length from the alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateReferralCode();
      assert.equal(code.length, REFERRAL_CODE_LENGTH);
      assert.match(code, new RegExp(`^[${REFERRAL_CODE_ALPHABET}]+$`));
    }
  });

  it("uses the injected random source", () => {
    assert.equal(generateReferralCode(() => 0), "222222");
    assert.equal(
      generateReferralCode(() => REFERRAL_CODE_ALPHABET.length - 1),
      "ZZZZZZ"
    );
  });

  it("forgives case and whitespace when normalising", () => {
    assert.equal(normaliseReferralCode("  abc234 "), "ABC234");
  });

  it("rejects anything that cannot be one of our codes", () => {
    for (const bad of [
      undefined,
      null,
      42,
      "",
      "ABC23",
      "ABC2345",
      "ABC0DE",
      "ABCIDE",
      "ABC-23",
      "ABC 234",
    ]) {
      assert.equal(normaliseReferralCode(bad), null, String(bad));
    }
  });

  it("builds the public link", () => {
    assert.equal(referralLink("ABC234"), "https://tenacitytutoring.com/r/ABC234");
  });
});

describe("referral records", () => {
  it("keys a referral by the referrer and new parent pair", () => {
    assert.equal(referralDocId("p1", "p2"), "p1_p2");
  });

  it("reads the claimed referrer and refuses a self-referral", () => {
    assert.equal(claimedReferrer({ referrerParentId: "p1" }, "p2"), "p1");
    assert.equal(claimedReferrer({ referrerParentId: "p2" }, "p2"), null);
    assert.equal(claimedReferrer({ referrerParentId: "  " }, "p2"), null);
    assert.equal(claimedReferrer({ referrerParentId: 7 }, "p2"), null);
    assert.equal(claimedReferrer({}, "p2"), null);
    assert.equal(claimedReferrer(undefined, "p2"), null);
  });

  it("starts a referral pending with no reward applied", () => {
    const doc = newReferralDoc({
      referrerParentId: "p1",
      newParentId: "p2",
      enrolmentId: "e1",
      referralCode: "ABC234",
      newParentExisted: false,
      actorUid: "admin-1",
      clock: () => new Date("2026-10-09T00:00:00Z"),
    });
    assert.equal(doc.referrerParentId, "p1");
    assert.equal(doc.newParentId, "p2");
    assert.deepEqual(doc.enrolmentIds, ["e1"]);
    assert.equal(doc.referralCode, "ABC234");
    assert.equal(doc.newParentExisted, false);
    assert.equal(doc.status, "pending");
    assert.equal(doc.rewardApplied, false);
    assert.equal(doc.rewardAppliedAt, null);
    assert.equal(doc.createdBy, "admin-1");
    assert.equal(doc.createdAt.toDate().toISOString(), "2026-10-09T00:00:00.000Z");
  });
});
