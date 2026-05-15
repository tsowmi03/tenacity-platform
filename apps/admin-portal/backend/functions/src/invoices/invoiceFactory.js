"use strict";

const { fromDate, now } = require("../shared/timestamps");
const { ValidationError } = require("../shared/validation");

function lineItemsTotal(lineItems) {
  return Math.round(
    lineItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0) * 100
  ) / 100;
}

function roundToCents(value) {
  return Math.round(Number(value) * 100) / 100;
}

function assertTotalsMatchLineItems(input) {
  const lineTotal = lineItemsTotal(input.lineItems);
  const amountDue = roundToCents(input.amountDue);
  const override =
    input.amountDueOverride === undefined
      ? undefined
      : roundToCents(input.amountDueOverride);
  if (override !== undefined && Math.abs(amountDue - override) >= 0.01) {
    throw new ValidationError(
      "amountDue must match amountDueOverride when an override is provided",
      { field: "amountDue" }
    );
  }
  if (Math.abs(lineTotal - amountDue) >= 0.01) {
    throw new ValidationError(
      "amountDue must match lineItems total; add an Admin adjustment line for overrides",
      { field: "amountDue" }
    );
  }
}

/**
 * Build an app-compatible `invoices/{invoiceId}` document.
 *
 * Side-effect-free: the caller is responsible for transactionally
 * incrementing `counters/invoices.current` and writing the invoice doc.
 * Per PLAN.md, the portal must NOT mutate Xero from this path — Xero side
 * effects come from existing app-deployed Firestore triggers (e.g.,
 * `onInvoiceCreated`).
 *
 * `input` is the normalised output from `validateCreateInvoiceInput`.
 *
 * Optional: pass `invoiceNumber` in opts when the caller has just allocated
 * it from the counter (so the factory writes it onto the doc).
 */
function buildInvoiceDoc(input, { actorUid, invoiceNumber, clock } = {}) {
  if (!input || typeof input !== "object") {
    throw new TypeError("buildInvoiceDoc requires a normalised input object");
  }
  if (!actorUid) {
    throw new TypeError("buildInvoiceDoc requires actorUid for audit metadata");
  }
  assertTotalsMatchLineItems(input);

  const createdAt = now(clock);
  const amountDueComputed =
    input.amountDueComputed !== undefined
      ? input.amountDueComputed
      : lineItemsTotal(input.lineItems);

  const doc = {
    parentId: input.parentId,
    parentName: input.parentName,
    parentEmail: input.parentEmail,
    studentIds: [...input.studentIds],
    weeks: input.weeks,
    amountDue: input.amountDue,
    amountDueComputed,
    amountDueOverride: input.amountDueOverride ?? null,
    lineItems: input.lineItems.map((li) => ({ ...li })),
    status: "unpaid",
    dueDate: fromDate(input.dueDate),
    createdAt,
    updatedAt: createdAt,
    createdByAdminId: actorUid,
    invoiceNumber: invoiceNumber || input.invoiceNumber || null,
    xeroInvoiceId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    adminNotes: input.adminNotes ?? null,
  };

  return doc;
}

function buildInvoiceDraftDoc(input, { actorUid, clock } = {}) {
  const doc = buildInvoiceDoc(input, { actorUid, clock });
  return {
    ...doc,
    status: "draft",
    draftCreatedAt: doc.createdAt,
  };
}

module.exports = {
  assertTotalsMatchLineItems,
  buildInvoiceDoc,
  buildInvoiceDraftDoc,
  lineItemsTotal,
  roundToCents,
};
