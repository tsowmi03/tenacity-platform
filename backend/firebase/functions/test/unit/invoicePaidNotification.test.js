"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldNotifyInvoicePaid,
  invoicePaidNotificationContent,
} = require("../../lib/notifications/invoice_action");

describe("shouldNotifyInvoicePaid", () => {
  it("fires when status transitions unpaid -> paid", () => {
    assert.equal(
      shouldNotifyInvoicePaid({ status: "unpaid" }, { status: "paid" }),
      true
    );
  });

  it("does not fire when already paid", () => {
    assert.equal(
      shouldNotifyInvoicePaid({ status: "paid" }, { status: "paid" }),
      false
    );
  });

  it("does not fire on unrelated field changes", () => {
    assert.equal(
      shouldNotifyInvoicePaid(
        { status: "unpaid", amountDue: 100 },
        { status: "unpaid", amountDue: 100, adminNotes: "x" }
      ),
      false
    );
  });

  it("does not fire when a paid invoice is reopened", () => {
    assert.equal(
      shouldNotifyInvoicePaid({ status: "paid" }, { status: "unpaid" }),
      false
    );
  });

  it("returns false for missing before/after", () => {
    assert.equal(shouldNotifyInvoicePaid(undefined, { status: "paid" }), false);
    assert.equal(shouldNotifyInvoicePaid({ status: "unpaid" }, undefined), false);
  });
});

describe("invoicePaidNotificationContent", () => {
  const base = {
    parentName: "Jane Doe",
    invoiceNumber: "42",
    amountPaid: 150,
    xeroInvoiceId: "xero-1",
  };

  it("prompts manual Xero entry when sync is off and invoice is synced", () => {
    const c = invoicePaidNotificationContent({ ...base, xeroSyncEnabled: false });
    assert.equal(c.needsManualXero, true);
    assert.match(c.title, /Xero/);
    assert.match(c.body, /manually/i);
    assert.match(c.subject, /42/);
    assert.match(c.subject, /\$150\.00/);
    assert.match(c.html, /Automatic Xero payment sync is off/);
  });

  it("omits the manual prompt when sync is on", () => {
    const c = invoicePaidNotificationContent({ ...base, xeroSyncEnabled: true });
    assert.equal(c.needsManualXero, false);
    assert.equal(c.title, "Invoice paid");
    assert.doesNotMatch(c.body, /manually/i);
    assert.doesNotMatch(c.html, /sync is off/);
  });

  it("does not prompt manual entry for an invoice that never synced to Xero", () => {
    const c = invoicePaidNotificationContent({
      ...base,
      xeroInvoiceId: null,
      xeroSyncEnabled: false,
    });
    assert.equal(c.needsManualXero, false);
    assert.match(c.html, /not synced to Xero/);
  });

  it("falls back gracefully on missing parent name, number, and amount", () => {
    const c = invoicePaidNotificationContent({ xeroSyncEnabled: true });
    assert.match(c.body, /A parent/);
    assert.match(c.body, /an invoice/);
    assert.match(c.subject, /\$0\.00/);
  });
});
