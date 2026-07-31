"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { Timestamp } = require("firebase-admin/firestore");
const {
  fingerprintInvoiceCreatePayload,
  invoiceCreateRequestDocumentId,
} = require("../../../src/invoices/invoiceCreateIdempotency");

describe("invoice create idempotency helpers", () => {
  it("fingerprints object keys canonically", () => {
    const first = fingerprintInvoiceCreatePayload({
      parentId: "parent-1",
      lineItems: [{ description: "English", lineTotal: 60 }],
      amountDue: 60,
    });
    const reordered = fingerprintInvoiceCreatePayload({
      amountDue: 60,
      lineItems: [{ lineTotal: 60, description: "English" }],
      parentId: "parent-1",
    });

    assert.equal(reordered, first);
  });

  it("normalizes Date and Firestore Timestamp values to the same instant", () => {
    const date = new Date("2026-08-05T00:00:00.000Z");

    assert.equal(
      fingerprintInvoiceCreatePayload({ dueDate: date }),
      fingerprintInvoiceCreatePayload({
        dueDate: Timestamp.fromDate(date),
      })
    );
    assert.notEqual(
      fingerprintInvoiceCreatePayload({ dueDate: date }),
      fingerprintInvoiceCreatePayload({
        dueDate: new Date("2026-08-06T00:00:00.000Z"),
      })
    );
  });

  it("scopes request document ids to the requester", () => {
    const first = invoiceCreateRequestDocumentId("admin-1", "request-1");

    assert.equal(first.length, 64);
    assert.notEqual(
      first,
      invoiceCreateRequestDocumentId("admin-2", "request-1")
    );
  });
});
