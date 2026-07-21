"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const {
  createInvoiceImpl,
  createInvoiceDraftImpl,
} = require("../../src/invoices/createInvoice");
const { updateInvoiceImpl } = require("../../src/invoices/updateInvoice");
const { deleteInvoiceImpl } = require("../../src/invoices/deleteInvoice");
const { getInvoicePdfImpl } = require("../../src/invoices/getInvoicePdf");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };
const clock = () => new Date("2026-05-13T00:00:00Z");

function ts(iso) {
  return admin.firestore.Timestamp.fromDate(new Date(iso));
}

function invoicePayload(extra = {}) {
  return {
    parentId: "parent-1",
    parentName: "Jane Doe",
    parentEmail: "jane@example.com",
    studentIds: ["student-1"],
    weeks: 4,
    amountDue: 200,
    dueDate: new Date("2026-06-13T00:00:00Z"),
    lineItems: [
      {
        studentName: "Alex",
        description: "Year 7 Maths",
        quantity: 4,
        unitAmount: 50,
        lineTotal: 200,
      },
    ],
    ...extra,
  };
}

async function seedParties(db) {
  await db.collection("users").doc("parent-1").set({
    role: "parent",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    students: ["student-1"],
  });
  await db.collection("students").doc("student-1").set({
    firstName: "Alex",
    lastName: "Doe",
    grade: "7",
    subjects: ["Maths"],
    parents: ["parent-1"],
  });
}

function storageStub(outcomes = []) {
  const calls = [];
  return {
    calls,
    bucket() {
      return {
        file(path) {
          return {
            async delete() {
              calls.push({ method: "delete", path });
              const next = outcomes.shift();
              if (next instanceof Error) throw next;
            },
            async save(buffer, options) {
              calls.push({ method: "save", path, buffer, options });
            },
          };
        },
      };
    },
  };
}

describe("invoice management (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "invoices"),
      clearCollection(db, "invoiceDrafts"),
      clearCollection(db, "counters"),
      clearCollection(db, "xeroTokens"),
      clearCollection(db, "adminAuditLogs"),
    ]);
    await seedParties(db);
  });

  after(async () => {
    await Promise.all([
      clearCollection(db, "users"),
      clearCollection(db, "students"),
      clearCollection(db, "invoices"),
      clearCollection(db, "invoiceDrafts"),
      clearCollection(db, "counters"),
      clearCollection(db, "xeroTokens"),
      clearCollection(db, "adminAuditLogs"),
    ]);
  });

  it("creates an invoice and increments counters/invoices.current", async () => {
    await db.collection("counters").doc("invoices").set({ current: 41 });

    const out = await createInvoiceImpl({
      payload: invoicePayload(),
      actor,
      deps: { db, clock },
    });

    assert.equal(out.invoiceNumber, "42");
    assert.match(out.warnings[0], /Xero/);

    const invoice = (await db.collection("invoices").doc(out.invoiceId).get()).data();
    assert.equal(invoice.status, "unpaid");
    assert.equal(invoice.invoiceNumber, "42");
    assert.equal(invoice.createdByAdminId, actor.uid);
    assert.equal(invoice.amountDueComputed, 200);
    assert.equal(invoice.xeroInvoiceId, null);

    const counter = (await db.collection("counters").doc("invoices").get()).data();
    assert.equal(counter.current, 42);
  });

  it("saves invoice drafts outside the live invoices collection", async () => {
    const out = await createInvoiceDraftImpl({
      payload: invoicePayload(),
      actor,
      deps: { db, clock },
    });

    const draft = (await db.collection("invoiceDrafts").doc(out.draftId).get()).data();
    const invoices = await db.collection("invoices").get();
    const counter = await db.collection("counters").doc("invoices").get();

    assert.equal(draft.status, "draft");
    assert.equal(invoices.empty, true);
    assert.equal(counter.exists, false);
  });

  it("rejects invoices for students not linked to the parent", async () => {
    await db.collection("users").doc("parent-1").update({ students: [] });
    await db.collection("students").doc("student-1").update({ parents: ["other"] });
    await assert.rejects(
      () =>
        createInvoiceImpl({
          payload: invoicePayload(),
          actor,
          deps: { db, clock },
        }),
      /not linked/
    );
  });

  it("updates invoice fields and returns a Xero warning", async () => {
    const ref = db.collection("invoices").doc("inv-update");
    await ref.set({
      ...invoicePayload(),
      dueDate: ts("2026-06-13T00:00:00Z"),
      createdAt: ts("2026-05-01T00:00:00Z"),
      status: "unpaid",
      amountDueOverride: null,
      xeroInvoiceId: "xero-1",
    });

    const out = await updateInvoiceImpl({
      payload: {
        invoiceId: "inv-update",
        updates: {
          lineItems: [
            {
              description: "Adjusted",
              quantity: 1,
              unitAmount: 125,
              lineTotal: 125,
            },
            {
              description: "Admin adjustment",
              quantity: 1,
              unitAmount: -15,
              lineTotal: -15,
              isAdminAdjustment: true,
            },
          ],
          amountDueOverride: 110,
          status: "overdue",
        },
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.warnings.length, 1);
    const updated = (await ref.get()).data();
    assert.equal(updated.amountDue, 110);
    assert.equal(updated.amountDueComputed, 110);
    assert.equal(updated.status, "overdue");
    assert.equal(updated.updatedBy, actor.uid);
  });

  it("hard-deletes Xero-synced invoices only after warning acknowledgement", async () => {
    await db.collection("invoices").doc("inv-delete").set({
      ...invoicePayload(),
      dueDate: ts("2026-06-13T00:00:00Z"),
      createdAt: ts("2026-05-01T00:00:00Z"),
      status: "unpaid",
      xeroInvoiceId: "xero-1",
      xeroInvoicePdfPath: "invoices-pdfs/inv-delete.pdf",
    });

    await assert.rejects(
      () =>
        deleteInvoiceImpl({
          payload: {
            invoiceId: "inv-delete",
            confirmInvoiceId: "inv-delete",
            acknowledgeXeroWarning: false,
          },
          actor,
          deps: { db, storage: storageStub(), clock },
        }),
      /acknowledgeXeroWarning/
    );

    const storage = storageStub();
    const out = await deleteInvoiceImpl({
      payload: {
        invoiceId: "inv-delete",
        confirmInvoiceId: "inv-delete",
        acknowledgeXeroWarning: true,
      },
      actor,
      deps: { db, storage, clock },
    });

    assert.equal(out.hardDeleted, true);
    assert.equal(out.pdfDelete.deleted, true);
    assert.equal(out.warnings.length, 1);
    assert.deepEqual(storage.calls, [
      { method: "delete", path: "invoices-pdfs/inv-delete.pdf" },
    ]);
    assert.equal((await db.collection("invoices").doc("inv-delete").get()).exists, false);
  });

  it("returns cached invoice PDF paths without calling Xero", async () => {
    await db.collection("invoices").doc("inv-pdf").set({
      ...invoicePayload(),
      dueDate: ts("2026-06-13T00:00:00Z"),
      createdAt: ts("2026-05-01T00:00:00Z"),
      status: "unpaid",
      xeroInvoiceId: "xero-1",
      xeroInvoicePdfPath: "invoices-pdfs/inv-pdf.pdf",
    });

    const out = await getInvoicePdfImpl({
      payload: { invoiceId: "inv-pdf" },
      actor,
      deps: {
        db,
        storage: storageStub(),
        secrets: { clientId: "client", clientSecret: "secret" },
        fetchPdf: async () => {
          throw new Error("should not fetch");
        },
      },
    });

    assert.equal(out.pdfPath, "invoices-pdfs/inv-pdf.pdf");
    assert.equal(out.source, "cache");
  });

  it("fetches and stores invoice PDFs when no cached path exists", async () => {
    await db.collection("invoices").doc("inv-pdf-fetch").set({
      ...invoicePayload(),
      dueDate: ts("2026-06-13T00:00:00Z"),
      createdAt: ts("2026-05-01T00:00:00Z"),
      status: "unpaid",
      xeroInvoiceId: "xero-1",
    });

    const out = await getInvoicePdfImpl({
      payload: { invoiceId: "inv-pdf-fetch" },
      actor,
      deps: {
        db,
        storage: storageStub(),
        secrets: { clientId: "client", clientSecret: "secret" },
        fetchPdf: async () => "invoices-pdfs/inv-pdf-fetch.pdf",
      },
    });

    assert.equal(out.pdfPath, "invoices-pdfs/inv-pdf-fetch.pdf");
    assert.equal(out.source, "xero");
    const invoice = (await db.collection("invoices").doc("inv-pdf-fetch").get()).data();
    assert.equal(invoice.xeroInvoicePdfPath, "invoices-pdfs/inv-pdf-fetch.pdf");
  });
});
