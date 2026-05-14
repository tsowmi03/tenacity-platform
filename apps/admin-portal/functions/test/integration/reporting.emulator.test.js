"use strict";

const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");

const admin = require("firebase-admin");
const { incomeReportImpl } = require("../../src/reports/incomeReport");
const {
  invoiceAgingReportImpl,
} = require("../../src/reports/invoiceAgingReport");
const { exportReportImpl } = require("../../src/reports/exportReport");
const {
  validateIncomeReportInput,
  validateInvoiceAgingReportInput,
} = require("../../src/reports/reportSchemas");
const { getAdmin, clearCollection } = require("../helpers/emulator");

const actor = { uid: "admin-actor", email: "admin@tenacitytutoring.com" };
const clock = () => new Date("2026-05-20T00:00:00Z");

function ts(iso) {
  return admin.firestore.Timestamp.fromDate(new Date(iso));
}

async function seedInvoice(db, id, extra = {}) {
  await db.collection("invoices").doc(id).set({
    parentId: "parent-1",
    parentName: "Jane Doe",
    parentEmail: "jane@example.com",
    studentIds: ["student-1"],
    invoiceNumber: id,
    status: "unpaid",
    amountDue: 200,
    amountDueComputed: 200,
    dueDate: ts("2026-05-10T00:00:00Z"),
    createdAt: ts("2026-05-01T00:00:00Z"),
    lineItems: [{ description: "Tutoring", lineTotal: 200 }],
    ...extra,
  });
}

describe("reporting (firestore emulator)", () => {
  let db;

  before(() => {
    ({ db } = getAdmin());
  });

  beforeEach(async () => {
    await clearCollection(db, "invoices");
  });

  after(async () => {
    await clearCollection(db, "invoices");
  });

  it("builds an income report from invoice docs", async () => {
    await seedInvoice(db, "inv-paid", {
      status: "paid",
      amountDue: 0,
      paidAt: ts("2026-05-15T00:00:00Z"),
      xeroInvoiceId: "xero-1",
    });
    await seedInvoice(db, "inv-overdue", {
      parentId: "parent-2",
      status: "overdue",
      amountDue: 75,
      lineItems: [{ description: "Tutoring", lineTotal: 125 }],
      stripePaymentIntentId: "pi_1",
    });
    await seedInvoice(db, "inv-outside", {
      createdAt: ts("2026-04-01T00:00:00Z"),
    });

    const report = await incomeReportImpl({
      payload: validateIncomeReportInput({
        fromDate: "2026-05-01T00:00:00Z",
        toDate: "2026-05-31T23:59:59Z",
        groupBy: "parent",
      }),
      actor,
      deps: { db, clock },
    });

    assert.equal(report.summary.invoiceCount, 2);
    assert.equal(report.summary.totalInvoiced, 325);
    assert.equal(report.summary.totalPaid, 200);
    assert.equal(report.summary.totalUnpaid, 75);
    assert.equal(report.rows.length, 2);
  });

  it("builds an invoice aging report from unpaid invoice docs", async () => {
    await seedInvoice(db, "inv-old", {
      dueDate: ts("2026-04-01T00:00:00Z"),
      amountDue: 80,
      xeroInvoiceId: "xero-1",
    });
    await seedInvoice(db, "inv-current", {
      dueDate: ts("2026-05-25T00:00:00Z"),
      amountDue: 40,
      stripePaymentIntentId: "pi_1",
    });
    await seedInvoice(db, "inv-paid", {
      status: "paid",
      amountDue: 0,
    });

    const report = await invoiceAgingReportImpl({
      payload: validateInvoiceAgingReportInput({
        asOfDate: "2026-05-20T00:00:00Z",
      }),
      actor,
      deps: { db, clock },
    });

    assert.equal(report.summary.invoiceCount, 2);
    assert.equal(report.summary.totalOutstanding, 120);
    assert.equal(report.buckets.find((b) => b.bucket === "31-60").balance, 80);
    assert.equal(report.buckets.find((b) => b.bucket === "current").balance, 40);
    assert.equal(report.invoices[0].invoiceId, "inv-old");
  });

  it("exports an income report as CSV", async () => {
    await seedInvoice(db, "inv-csv", {
      parentName: "Jane, Doe",
    });

    const out = await exportReportImpl({
      payload: {
        reportType: "income",
        format: "csv",
        report: {
          fromDate: "2026-05-01T00:00:00Z",
          toDate: "2026-05-31T23:59:59Z",
          groupBy: "month",
        },
      },
      actor,
      deps: { db, clock },
    });

    assert.equal(out.contentType, "text/csv; charset=utf-8");
    assert.equal(out.fileName, "income-2026-05-20.csv");
    assert.match(out.csv, /Group,Invoices,Total invoiced/);
    assert.match(out.csv, /2026-05,1,200/);
    assert.equal(out.rowCount, 1);
  });
});
