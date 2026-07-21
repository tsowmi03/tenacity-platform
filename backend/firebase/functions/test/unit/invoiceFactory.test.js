"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ValidationError } = require("../../src/shared/validation");
const {
  validateCreateInvoiceInput,
  validateUpdateInvoiceInput,
  assertLineItem,
} = require("../../src/invoices/invoiceSchemas");
const {
  buildInvoiceDoc,
  buildInvoiceDraftDoc,
  lineItemsTotal,
} = require("../../src/invoices/invoiceFactory");
const {
  buildInvoicePatch,
  validateUpdateInvoicePayload,
  xeroWarningsForUpdate,
} = require("../../src/invoices/updateInvoice");
const {
  validateDeleteInvoicePayload,
} = require("../../src/invoices/deleteInvoice");

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
      () => validateCreateInvoiceInput({ ...validInput, dueDate: "nope" }),
      ValidationError
    );
  });

  it("accepts callable-friendly date values", () => {
    const fromString = validateCreateInvoiceInput({
      ...validInput,
      dueDate: "2026-06-13T00:00:00Z",
    });
    assert.equal(fromString.dueDate.toISOString(), "2026-06-13T00:00:00.000Z");

    const fromTimestampLike = validateCreateInvoiceInput({
      ...validInput,
      dueDate: { toDate: () => new Date("2026-06-14T00:00:00Z") },
    });
    assert.equal(
      fromTimestampLike.dueDate.toISOString(),
      "2026-06-14T00:00:00.000Z"
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
    assert.equal(doc.amountDueComputed, 200);
    assert.equal(doc.invoiceNumber, "INV-001");
    assert.equal(doc.xeroInvoiceId, null);
    assert.equal(doc.stripePaymentIntentId, null);
    assert.equal(doc.paidAt, null);
    assert.equal(doc.createdByAdminId, "admin-1");
    assert.equal(doc.dueDate.toDate().toISOString(), validInput.dueDate.toISOString());
    assert.equal(doc.createdAt.toMillis(), doc.updatedAt.toMillis());

    // Line items must be defensively copied.
    assert.notEqual(doc.lineItems[0], normalised.lineItems[0]);
  });

  it("omits optional fields when not provided", () => {
    const normalised = validateCreateInvoiceInput(validInput);
    const doc = buildInvoiceDoc(normalised, { actorUid: "admin-1", clock });
    assert.equal(doc.amountDueOverride, null);
    assert.equal(doc.adminNotes, null);
    assert.equal(doc.invoiceNumber, null);
  });

  it("includes optional fields when provided", () => {
    const normalised = validateCreateInvoiceInput({
      ...validInput,
      amountDueOverride: 200,
      amountDueComputed: 200,
      adminNotes: "discount applied",
    });
    const doc = buildInvoiceDoc(normalised, { actorUid: "admin-1", clock });
    assert.equal(doc.amountDueOverride, 200);
    assert.equal(doc.amountDueComputed, 200);
    assert.equal(doc.adminNotes, "discount applied");
  });

  it("rejects mismatched amountDue and lineItems total", () => {
    const normalised = validateCreateInvoiceInput({
      ...validInput,
      amountDue: 180,
    });
    assert.throws(
      () => buildInvoiceDoc(normalised, { actorUid: "admin-1", clock }),
      /amountDue must match lineItems total/
    );
  });

  it("rejects mismatched amountDue and override", () => {
    const normalised = validateCreateInvoiceInput({
      ...validInput,
      amountDueOverride: 180,
    });
    assert.throws(
      () => buildInvoiceDoc(normalised, { actorUid: "admin-1", clock }),
      /amountDue must match amountDueOverride/
    );
  });

  it("builds draft documents outside the live invoice status set", () => {
    const normalised = validateCreateInvoiceInput(validInput);
    const doc = buildInvoiceDraftDoc(normalised, { actorUid: "admin-1", clock });
    assert.equal(doc.status, "draft");
    assert.equal(doc.draftCreatedAt.toMillis(), doc.createdAt.toMillis());
  });
});

describe("lineItemsTotal", () => {
  it("rounds cents", () => {
    assert.equal(
      lineItemsTotal([
        { lineTotal: 10.115 },
        { lineTotal: -0.005 },
      ]),
      10.11
    );
  });
});

describe("validateUpdateInvoicePayload", () => {
  it("requires invoiceId plus at least one update", () => {
    assert.throws(
      () => validateUpdateInvoicePayload({ invoiceId: "inv1" }),
      /At least one invoice field/
    );
  });

  it("accepts status updates", () => {
    const out = validateUpdateInvoicePayload({ invoiceId: "inv1", status: "overdue" });
    assert.deepEqual(out, { invoiceId: "inv1", updates: { status: "overdue" } });
  });
});

describe("buildInvoicePatch", () => {
  it("recomputes amountDue from line items when no override exists", () => {
    const patch = buildInvoicePatch(
      { amountDue: 50 },
      {
        lineItems: [
          { description: "A", quantity: 1, unitAmount: 40, lineTotal: 40 },
          { description: "B", quantity: 1, unitAmount: 5, lineTotal: 5 },
        ],
      },
      "admin-1",
      clock
    );
    assert.equal(patch.amountDueComputed, 45);
    assert.equal(patch.amountDue, 45);
  });

  it("uses amountDueOverride as the payable amount", () => {
    const patch = buildInvoicePatch(
      {
        amountDue: 50,
        lineItems: [
          { description: "Tutoring", quantity: 1, unitAmount: 50, lineTotal: 50 },
          {
            description: "Admin adjustment",
            quantity: 1,
            unitAmount: -15,
            lineTotal: -15,
            isAdminAdjustment: true,
          },
        ],
      },
      { amountDueOverride: 35 },
      "admin-1",
      clock
    );
    assert.equal(patch.amountDueOverride, 35);
    assert.equal(patch.amountDue, 35);
  });

  it("rejects override updates that do not match line items", () => {
    assert.throws(
      () =>
        buildInvoicePatch(
          {
            amountDue: 50,
            lineItems: [
              {
                description: "Tutoring",
                quantity: 1,
                unitAmount: 50,
                lineTotal: 50,
              },
            ],
          },
          { amountDueOverride: 35 },
          "admin-1",
          clock
        ),
      /amountDueOverride must match lineItems total/
    );
  });
});

describe("xeroWarningsForUpdate", () => {
  it("warns on Xero-synced invoice edits", () => {
    const warnings = xeroWarningsForUpdate(
      { xeroInvoiceId: "xero-1", status: "unpaid" },
      { status: "paid" }
    );
    assert.equal(warnings.length, 2);
  });
});

describe("validateDeleteInvoicePayload", () => {
  it("defaults acknowledgeXeroWarning to false", () => {
    const out = validateDeleteInvoicePayload({
      invoiceId: "inv1",
      confirmInvoiceId: "inv1",
    });
    assert.equal(out.acknowledgeXeroWarning, false);
  });
});
