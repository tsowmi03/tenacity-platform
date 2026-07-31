"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  InvoiceCreateRequestConflictError,
  REQUEST_COLLECTION,
  createInvoiceOnce,
  fingerprintInvoiceCreatePayload,
} = require("../../src/invoices/invoiceCreateIdempotency");
const { getAdmin, clearCollection } = require("../helpers/emulator");

function create({
  db,
  createRequestId,
  requesterId = "admin-1",
  amountDue = 60,
  dueDate = new Date("2026-08-05T00:00:00.000Z"),
}) {
  const payloadFingerprint = fingerprintInvoiceCreatePayload({
    amountDue,
    dueDate,
    parentId: "parent-1",
  });
  return createInvoiceOnce({
    db,
    requesterId,
    createRequestId,
    payloadFingerprint,
    buildInvoice: (invoiceNumber) => ({
      parentId: "parent-1",
      invoiceNumber,
      amountDue,
      dueDate: admin.firestore.Timestamp.fromDate(dueDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
  });
}

describe("invoice create idempotency (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "invoices"),
      clearCollection(db, "counters"),
      clearCollection(db, REQUEST_COLLECTION),
    ]);
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "invoices"),
      clearCollection(db, "counters"),
      clearCollection(db, REQUEST_COLLECTION),
    ]);
  });

  it("returns the existing invoice when a request is retried", async () => {
    await db.collection("counters").doc("invoices").set({ current: 41 });

    const first = await create({
      db,
      createRequestId: "request-123",
    });
    const retry = await create({
      db,
      createRequestId: "request-123",
    });

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.invoiceId, first.invoiceId);
    assert.equal(retry.invoiceNumber, "42");

    const [invoices, requests, counter] = await Promise.all([
      db.collection("invoices").get(),
      db.collection(REQUEST_COLLECTION).get(),
      db.collection("counters").doc("invoices").get(),
    ]);
    assert.equal(invoices.size, 1);
    assert.equal(requests.size, 1);
    assert.equal(counter.data().current, 42);
  });

  it("deduplicates concurrent attempts before counter allocation", async () => {
    await db.collection("counters").doc("invoices").set({ current: 9 });

    const results = await Promise.all([
      create({ db, createRequestId: "concurrent-request" }),
      create({ db, createRequestId: "concurrent-request" }),
    ]);

    assert.equal(results[0].invoiceId, results[1].invoiceId);
    assert.equal(results[0].invoiceNumber, "10");
    assert.equal(results[1].invoiceNumber, "10");
    assert.deepEqual(
      results.map((result) => result.created).sort(),
      [false, true]
    );

    const [invoices, requests, counter] = await Promise.all([
      db.collection("invoices").get(),
      db.collection(REQUEST_COLLECTION).get(),
      db.collection("counters").doc("invoices").get(),
    ]);
    assert.equal(invoices.size, 1);
    assert.equal(requests.size, 1);
    assert.equal(counter.data().current, 10);
  });

  it("rejects reuse of a request id with different invoice details", async () => {
    await db.collection("counters").doc("invoices").set({ current: 4 });

    const first = await create({
      db,
      createRequestId: "request-with-immutable-payload",
      amountDue: 60,
    });

    await assert.rejects(
      () =>
        create({
          db,
          createRequestId: "request-with-immutable-payload",
          amountDue: 75,
        }),
      InvoiceCreateRequestConflictError
    );

    const [invoices, counter] = await Promise.all([
      db.collection("invoices").get(),
      db.collection("counters").doc("invoices").get(),
    ]);
    assert.equal(invoices.size, 1);
    assert.equal(invoices.docs[0].id, first.invoiceId);
    assert.equal(invoices.docs[0].data().amountDue, 60);
    assert.equal(counter.data().current, 5);
  });

  it("rejects a changed due date for an existing request id", async () => {
    await create({
      db,
      createRequestId: "request-with-due-date",
      dueDate: new Date("2026-08-05T00:00:00.000Z"),
    });

    await assert.rejects(
      () =>
        create({
          db,
          createRequestId: "request-with-due-date",
          dueDate: new Date("2026-08-06T00:00:00.000Z"),
        }),
      InvoiceCreateRequestConflictError
    );

    const [invoices, counter] = await Promise.all([
      db.collection("invoices").get(),
      db.collection("counters").doc("invoices").get(),
    ]);
    assert.equal(invoices.size, 1);
    assert.equal(invoices.docs[0].data().dueDate.toMillis(), 1785888000000);
    assert.equal(counter.data().current, 1);
  });
});
