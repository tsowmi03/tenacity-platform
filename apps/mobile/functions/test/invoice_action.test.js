const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canCreateInvoice,
  invoiceCreatedNotificationBody,
  shouldSuppressInvoiceCreatedNotification,
} = require("../lib/notifications/invoice_action");

test("invoice creation is limited to admins or the invoice parent", () => {
  assert.equal(canCreateInvoice({
    actorId: "adminA",
    actorRole: "admin",
    parentId: "parentA",
  }), true);
  assert.equal(canCreateInvoice({
    actorId: "parentA",
    actorRole: "parent",
    parentId: "parentA",
  }), true);
  assert.equal(canCreateInvoice({
    actorId: "parentB",
    actorRole: "parent",
    parentId: "parentA",
  }), false);
  assert.equal(canCreateInvoice({
    actorId: "tutorA",
    actorRole: "tutor",
    parentId: "parentA",
  }), false);
});

test("invoice create action suppresses fallback trigger", () => {
  assert.equal(
    shouldSuppressInvoiceCreatedNotification({ type: "create_invoice" }),
    true,
  );
  assert.equal(
    shouldSuppressInvoiceCreatedNotification({ type: "other" }),
    false,
  );
  assert.equal(shouldSuppressInvoiceCreatedNotification(), false);
});

test("invoice created notification body preserves existing amount copy", () => {
  assert.equal(
    invoiceCreatedNotificationBody(123.4),
    "Invoice for amount $123.40",
  );
  assert.equal(
    invoiceCreatedNotificationBody(undefined),
    "Invoice for amount $0.00",
  );
});
