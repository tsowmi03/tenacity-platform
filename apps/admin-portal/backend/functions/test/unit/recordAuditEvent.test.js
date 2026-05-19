"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  compactValue,
  validateAuditPayload,
} = require("../../src/audit/recordAuditEvent");

describe("recordAuditEvent payload validation", () => {
  it("accepts allowlisted app audit events", () => {
    const payload = validateAuditPayload({
      action: "attendance.mark",
      targetType: "attendance",
      targetId: "att-1",
      targetName: "Maths · Monday · 4:00 PM",
      payloadSummary: { addedStudentIds: ["s1"] },
      requestId: "req-1",
    });

    assert.equal(payload.action, "attendance.mark");
    assert.equal(payload.targetType, "attendance");
    assert.deepEqual(payload.payloadSummary, { addedStudentIds: ["s1"] });
    assert.equal(payload.requestId, "req-1");
  });

  it("rejects unknown actions and targets", () => {
    assert.throws(
      () => validateAuditPayload({ action: "chat.message.send", targetType: "chat", targetId: "c1" }),
      /Unsupported audit action/
    );
    assert.throws(
      () => validateAuditPayload({ action: "attendance.mark", targetType: "chat", targetId: "c1" }),
      /Unsupported audit target type/
    );
  });

  it("keeps nested values compact", () => {
    const compacted = compactValue({
      text: "x".repeat(700),
      list: Array.from({ length: 50 }, (_, i) => i),
    });

    assert.equal(compacted.text.length, 500);
    assert.equal(compacted.list.length, 40);
  });
});
