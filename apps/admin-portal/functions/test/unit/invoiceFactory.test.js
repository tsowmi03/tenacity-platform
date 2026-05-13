"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ValidationError } = require("../../src/shared/validation");
const {
  validateCreateInvoiceInput,
  validateUpdateInvoiceInput,
  assertLineItem,
} = require("../../src/invoices/invoiceSchemas");
const { buildInvoiceDoc } = require("../../src/invoices/invoiceFactory");

const clock = () => new Date("2026-05-13T00:00:00Z");

const validInput = {
  parentId: "p1",
  parentName: "Jane Doe",
  parentEmail: "Jane@Example.com",
  studentIds: ["s1"],
  weeks: 4,
  amountDue: 200,
  dueDate: new Date("2026-06-13T00:00:00Z"),
  lineItems: [
    {
      studentName: "A",
      description: "Year 7 English",
      quantity: 4,
      unitAmount: 50,
      lineTotal: 200,
    },
  ],
};

describe("assertLineItem", () => {
  it("accepts a valid line item", () => {
    const out = assertLineItem(
      {
        description: "Tutoring",
        quantity: 1,
        unitAmount: 80,
        lineTotal: 80,
      },
      "lineItems[0]"
    );
    assert.equal(out.description, "Tutoring");
  });
  it("rejects missing description", () => {
    assert.throws(
      () =>
        assertLineItem(
          { quantity: 1, unitAmount: 80, lineTotal: 80 },
          "lineItems[0]"
        ),
      ValidationError
    );
  });
});

describe("validateCreateInvoiceInput", () => {
  it("normalises and lowercases parentEmail", () => {
    const out = validateCreateInvoiceInput(validInput);
    assert.equal(out.parentEmail, "jane@example.com");
    assert.deepEqual(out.studentIds, ["s1"]);
    assert.equal(out.lineItems.length, 1);
  });

  it("rejects empty studentIds", () => {
    assert.throws(
      () => validateCreateInvoiceInput({ ...validInput, studentIds: [] }),
      /at least 1/
    );
  });

  it("rejects empty lineItems", () => {
    assert.throws(
      () => validateCreateInvoiceInput({ ...validInput, lineItems: [] }),
      /at least 1/
    );
  });

  it("rejects non-Date dueDate", () => {
    assert.throws(
      () =>
        validateCreateInvoiceInput({
          ...validInput,
          dueDate: "2026-06-13",
        }),
      ValidationError
    );
  });
});

describe("validateUpdateInvoiceInput", () => {
  it("accepts a status change", () => {
    const out = validateUpdateInvoiceInput({ status: "paid" });
    assert.deepEqual(out, { status: "paid" });
  });
  it("rejects invalid status", () => {
    assert.throws(
      () => validateUpdateInvoiceInput({ status: "void" }),
      ValidationError
    );
  });
});

describe("buildInvoiceDoc", () => {
  it("produces the app-compatible shape with unpaid status", () => {
    const normalised = validateCreateInvoiceInput(validInput);
    const doc = buildInvoiceDoc(normalised, {
      actorUid: "admin-1",
      clock,
      invoiceNumber: "INV-001",
    });
    assert.equal(doc.status, "unpaid");
    assert.equal(doc.parentEmail, "jane@example.com");
    assert.deepEqual(doc.studentIds, ["s1"]);
    assert.equal(doc.weeks, 4);
    assert.equal(doc.amountDue, 200);
    assert.equal(doc.invoiceNumber, "INV-001");
    assert.equal(doc.createdByAdminId, "admin-1");
    assert.equal(doc.dueDate.toDate().toISOString(), validInput.dueDate.toISOString());
    assert.equal(doc.createdAt.toMillis(), doc.updatedAt.toMillis());

    // Line items must be defensively copied.
    assert.notEqual(doc.lineItems[0], normalised.lineItems[0]);
  });

  it("omits optional fields when not provided", () => {
    const normalised = validateCreateInvoiceInput(validInput);
    const doc = buildInvoiceDoc(normalised, { actorUid: "admin-1", clock });
    assert.equal("amountDueOverride" in doc, false);
    assert.equal("adminNotes" in doc, false);
    assert.equal("invoiceNumber" in doc, false);
  });

  it("includes optional fields when provided", () => {
    const normalised = validateCreateInvoiceInput({
      ...validInput,
      amountDueOverride: 180,
      adminNotes: "discount applied",
    });
    const doc = buildInvoiceDoc(normalised, { actorUid: "admin-1", clock });
    assert.equal(doc.amountDueOverride, 180);
    assert.equal(doc.adminNotes, "discount applied");
  });
});
