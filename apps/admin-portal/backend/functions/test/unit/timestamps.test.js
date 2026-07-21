"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  now,
  fromDate,
  createdMeta,
  updatedMeta,
} = require("../../src/shared/timestamps");

describe("timestamps", () => {
  it("now() returns a Firestore Timestamp", () => {
    const t = now();
    assert.ok(t instanceof admin.firestore.Timestamp);
  });

  it("now() honours a provided clock for deterministic tests", () => {
    const fixed = new Date("2026-01-15T10:00:00Z");
    const t = now(() => fixed);
    assert.equal(t.toDate().toISOString(), fixed.toISOString());
  });

  it("fromDate rejects invalid Dates", () => {
    assert.throws(() => fromDate(null), TypeError);
    assert.throws(() => fromDate(new Date("not-a-date")), TypeError);
  });

  it("createdMeta uses the same instant for createdAt and updatedAt", () => {
    const fixed = new Date("2026-05-13T00:00:00Z");
    const meta = createdMeta("uid-1", () => fixed);
    assert.equal(meta.createdBy, "uid-1");
    assert.equal(meta.updatedBy, "uid-1");
    assert.equal(meta.createdAt.toMillis(), meta.updatedAt.toMillis());
    assert.equal(meta.createdAt.toDate().toISOString(), fixed.toISOString());
  });

  it("updatedMeta only sets updatedAt/updatedBy", () => {
    const meta = updatedMeta("uid-2", () => new Date("2026-05-13T00:00:00Z"));
    assert.deepEqual(Object.keys(meta).sort(), ["updatedAt", "updatedBy"]);
    assert.equal(meta.updatedBy, "uid-2");
  });
});
