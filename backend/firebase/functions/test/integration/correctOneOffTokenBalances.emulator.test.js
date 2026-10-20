"use strict";

const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  CORRECTION_REASON,
  applyTokenCorrection,
} = require("../../src/users/correctOneOffTokenBalances");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const PARENT_ID = "parent-1";

describe("applyTokenCorrection (emulator)", () => {
  let db;
  const tokens = async () =>
    (await db.collection("users").doc(PARENT_ID).get()).data().lessonTokens;
  const audits = async () =>
    (await db.collection("adminAuditLogs").get()).docs.map((d) => d.data());

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    for (const name of ["users", "adminAuditLogs"]) await clearCollection(db, name);
    await db.collection("users").doc(PARENT_ID).set({
      role: "parent",
      firstName: "Pat",
      lastName: "Parent",
      lessonTokens: 4,
    });
  });

  const correction = (tokenBookings) => ({ parentId: PARENT_ID, tokenBookings });

  it("takes the tokens and records it", async () => {
    const result = await applyTokenCorrection({ db, correction: correction(3) });

    assert.deepEqual(result, { skipped: false, before: 4, after: 1 });
    assert.equal(await tokens(), 1);
    const [entry] = await audits();
    assert.equal(entry.payloadSummary.reason, CORRECTION_REASON);
    assert.equal(entry.payloadSummary.value, -3);
  });

  it("corrects a parent only once, however often it runs", async () => {
    await applyTokenCorrection({ db, correction: correction(3) });
    const again = await applyTokenCorrection({ db, correction: correction(3) });

    assert.deepEqual(again, { skipped: true });
    assert.equal(await tokens(), 1);
    assert.equal((await audits()).length, 1);
  });

  it("floors at zero and records what it wrote off", async () => {
    await applyTokenCorrection({ db, correction: correction(7) });

    assert.equal(await tokens(), 0);
    const [entry] = await audits();
    assert.equal(entry.payloadSummary.writtenOff, 3);
  });
});
