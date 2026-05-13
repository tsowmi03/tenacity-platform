"use strict";

const { fromDate, now } = require("../shared/timestamps");

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

  const createdAt = now(clock);

  const doc = {
    parentId: input.parentId,
    parentName: input.parentName,
    parentEmail: input.parentEmail,
    studentIds: [...input.studentIds],
    weeks: input.weeks,
    amountDue: input.amountDue,
    lineItems: input.lineItems.map((li) => ({ ...li })),
    status: "unpaid",
    dueDate: fromDate(input.dueDate),
    createdAt,
    updatedAt: createdAt,
    createdByAdminId: actorUid,
  };

  if (input.amountDueOverride !== undefined) {
    doc.amountDueOverride = input.amountDueOverride;
  }
  if (input.adminNotes) {
    doc.adminNotes = input.adminNotes;
  }
  if (invoiceNumber) {
    doc.invoiceNumber = invoiceNumber;
  } else if (input.invoiceNumber) {
    doc.invoiceNumber = input.invoiceNumber;
  }

  return doc;
}

module.exports = { buildInvoiceDoc };
