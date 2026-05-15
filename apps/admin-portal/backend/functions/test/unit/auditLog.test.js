"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const { writeAuditLog } = require("../../src/shared/auditLog");

function fakeDb({ shouldFail = false } = {}) {
  const writes = [];
  return {
    writes,
    collection(name) {
      return {
        async add(data) {
          if (shouldFail) throw new Error("simulated firestore failure");
          writes.push({ collection: name, data });
          return { id: `auto-${writes.length}` };
        },
      };
    },
  };
}

const clock = () => new Date("2026-05-13T00:00:00Z");

describe("writeAuditLog", () => {
  it("writes to adminAuditLogs with all fields", async () => {
    const db = fakeDb();
    const { id, entry } = await writeAuditLog(
      db,
      {
        actorUid: "admin-1",
        actorEmail: "a@b.com",
        action: "user.create",
        targetType: "user",
        targetId: "u-1",
        payloadSummary: { role: "parent" },
        before: undefined,
        after: { firstName: "Jane" },
        requestId: "req-1",
      },
      { clock }
    );

    assert.equal(id, "auto-1");
    assert.equal(db.writes.length, 1);
    const written = db.writes[0];
    assert.equal(written.collection, "adminAuditLogs");
    assert.equal(written.data.actorUid, "admin-1");
    assert.equal(written.data.action, "user.create");
    assert.equal(written.data.targetType, "user");
    assert.equal(written.data.targetId, "u-1");
    assert.deepEqual(written.data.payloadSummary, { role: "parent" });
    assert.deepEqual(written.data.after, { firstName: "Jane" });
    assert.equal(written.data.requestId, "req-1");
    assert.ok(written.data.createdAt instanceof admin.firestore.Timestamp);
    assert.equal("before" in written.data, false);
    assert.equal(entry.actorEmail, "a@b.com");
  });

  it("defaults actorEmail to null", async () => {
    const db = fakeDb();
    await writeAuditLog(
      db,
      {
        actorUid: "u",
        action: "x.do",
        targetType: "x",
        targetId: "1",
      },
      { clock }
    );
    assert.equal(db.writes[0].data.actorEmail, null);
  });

  it("validates required inputs", async () => {
    const db = fakeDb();
    await assert.rejects(
      () => writeAuditLog(db, { actorUid: "u", action: "a", targetType: "t" }, { clock }),
      TypeError
    );
    await assert.rejects(() => writeAuditLog(null, {}), TypeError);
  });

  it("swallows write failures and logs a warning by default", async () => {
    const db = fakeDb({ shouldFail: true });
    const warnings = [];
    const logger = { warn: (msg, meta) => warnings.push({ msg, meta }) };

    const out = await writeAuditLog(
      db,
      {
        actorUid: "u",
        action: "x.do",
        targetType: "x",
        targetId: "1",
      },
      { clock, logger }
    );

    assert.equal(out.id, null);
    assert.ok(out.error instanceof Error);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].meta.targetType, "x");
  });

  it("rethrows write failures when throwOnError=true", async () => {
    const db = fakeDb({ shouldFail: true });
    await assert.rejects(
      () =>
        writeAuditLog(
          db,
          {
            actorUid: "u",
            action: "x.do",
            targetType: "x",
            targetId: "1",
          },
          { clock, throwOnError: true }
        ),
      /simulated firestore failure/
    );
  });
});
