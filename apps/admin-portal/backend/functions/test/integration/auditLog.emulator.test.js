"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const { writeAuditLog } = require("../../src/shared/auditLog");
const { getAdmin, clearCollection } = require("../helpers/emulator");

describe("auditLog (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollection(db, "adminAuditLogs");
  });

  after(async () => {
    await clearCollection(db, "adminAuditLogs");
  });

  it("writes a doc to adminAuditLogs and round-trips fields", async () => {
    const { id } = await writeAuditLog(db, {
      actorUid: "admin-1",
      actorEmail: "a@b.com",
      action: "user.create",
      targetType: "user",
      targetId: "u-1",
      payloadSummary: { role: "parent" },
    });
    assert.ok(id);

    const snap = await db.collection("adminAuditLogs").doc(id).get();
    assert.equal(snap.exists, true);
    const data = snap.data();
    assert.equal(data.action, "user.create");
    assert.equal(data.targetType, "user");
    assert.equal(data.targetId, "u-1");
    assert.equal(data.actorEmail, "a@b.com");
    assert.equal(data.payloadSummary.role, "parent");
    assert.ok(data.createdAt); // Firestore Timestamp
  });

  it("preserves payloadSummary/before/after as nested objects", async () => {
    const { id } = await writeAuditLog(db, {
      actorUid: "admin-1",
      action: "user.update",
      targetType: "user",
      targetId: "u-1",
      before: { firstName: "Jane" },
      after: { firstName: "Janet" },
    });
    const data = (await db.collection("adminAuditLogs").doc(id).get()).data();
    assert.deepEqual(data.before, { firstName: "Jane" });
    assert.deepEqual(data.after, { firstName: "Janet" });
  });
});
