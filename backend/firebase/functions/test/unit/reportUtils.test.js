"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateExportReportInput,
  validateIncomeReportInput,
  validateInvoiceAgingReportInput,
} = require("../../src/reports/reportSchemas");
const { buildIncomeReport } = require("../../src/reports/incomeReport");
const {
  agingBucket,
  buildInvoiceAgingReport,
  daysOverdue,
} = require("../../src/reports/invoiceAgingReport");
const { csvForReport } = require("../../src/reports/exportReport");
const { rowsToCsv } = require("../../src/reports/reportUtils");

function invoice(extra = {}) {
  return {
    id: "inv1",
    parentId: "parent-1",
    parentName: "Jane Doe",
    parentEmail: "jane@example.com",
    studentIds: ["student-1"],
    status: "unpaid",
    amountDue: 200,
    amountDueComputed: 200,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    dueDate: new Date("2026-05-20T00:00:00Z"),
    lineItems: [{ description: "Tutoring", lineTotal: 200 }],
    ...extra,
  };
}

describe("report schemas", () => {
  it("normalises income report defaults", () => {
    const out = validateIncomeReportInput({
      fromDate: "2026-05-01T00:00:00Z",
      toDate: "2026-05-31T23:59:59Z",
    });
    assert.equal(out.basis, "created");
    assert.equal(out.status, "all");
    assert.equal(out.groupBy, "month");
  });

  it("rejects invalid date ranges", () => {
    assert.throws(
      () =>
        validateIncomeReportInput({
          fromDate: "2026-06-01T00:00:00Z",
          toDate: "2026-05-01T00:00:00Z",
        }),
      /fromDate/
    );
  });

  it("defaults invoice aging asOfDate", () => {
    const out = validateInvoiceAgingReportInput({});
    assert.ok(out.asOfDate instanceof Date);
  });

  it("defaults exports to CSV and accepts PDF/XLSX formats", () => {
    assert.deepEqual(validateExportReportInput({ reportType: "income" }), {
      reportType: "income",
      format: "csv",
    });
    assert.equal(
      validateExportReportInput({ reportType: "income", format: "pdf" }).format,
      "pdf"
    );
    assert.equal(
      validateExportReportInput({ reportType: "income", format: "xlsx" }).format,
      "xlsx"
    );
    assert.throws(
      () => validateExportReportInput({ reportType: "income", format: "docx" }),
      /format/
    );
  });
});

describe("buildIncomeReport", () => {
  it("groups by parent and calculates invoice metrics", () => {
    const report = buildIncomeReport({
      invoices: [
        invoice({ id: "paid", status: "paid", xeroInvoiceId: "xero-1" }),
        invoice({
          id: "open",
          parentId: "parent-2",
          status: "overdue",
          amountDue: 50,
          lineItems: [{ description: "Tutoring", lineTotal: 100 }],
          stripePaymentIntentId: "pi_1",
        }),
      ],
      payload: validateIncomeReportInput({
        fromDate: "2026-05-01T00:00:00Z",
        toDate: "2026-05-31T23:59:59Z",
        groupBy: "parent",
      }),
      generatedAt: new Date("2026-06-01T00:00:00Z"),
    });

    assert.equal(report.summary.invoiceCount, 2);
    assert.equal(report.summary.totalInvoiced, 300);
    assert.equal(report.summary.totalPaid, 200);
    assert.equal(report.summary.totalUnpaid, 50);
    assert.equal(report.summary.totalOverdue, 50);
    assert.deepEqual(
      report.rows.map((row) => row.key),
      ["parent-1", "parent-2"]
    );
  });

  it("splits student grouping across invoice studentIds", () => {
    const report = buildIncomeReport({
      invoices: [invoice({ studentIds: ["s1", "s2"] })],
      payload: validateIncomeReportInput({
        fromDate: "2026-05-01T00:00:00Z",
        toDate: "2026-05-31T23:59:59Z",
        groupBy: "student",
      }),
      generatedAt: new Date("2026-05-10T00:00:00Z"),
    });
    assert.deepEqual(
      report.rows.map((row) => row.key),
      ["s1", "s2"]
    );
    assert.equal(report.summary.totalInvoiced, 200);
  });
});

describe("buildInvoiceAgingReport", () => {
  it("buckets unpaid invoices and tracks parent balances", () => {
    const report = buildInvoiceAgingReport({
      invoices: [
        invoice({
          id: "old",
          amountDue: 75,
          dueDate: new Date("2026-04-01T00:00:00Z"),
          xeroInvoiceId: "xero-1",
        }),
        invoice({
          id: "current",
          amountDue: 50,
          dueDate: new Date("2026-05-20T00:00:00Z"),
          stripePaymentIntentId: "pi_1",
        }),
        invoice({ id: "paid", status: "paid", amountDue: 0 }),
      ],
      payload: validateInvoiceAgingReportInput({
        asOfDate: "2026-05-20T00:00:00Z",
      }),
      generatedAt: new Date("2026-05-20T00:00:00Z"),
    });

    assert.equal(report.summary.invoiceCount, 2);
    assert.equal(report.summary.totalOutstanding, 125);
    assert.equal(report.summary.missingXeroId, 1);
    assert.equal(report.summary.stripeIntentButUnpaid, 1);
    assert.equal(report.buckets.find((b) => b.bucket === "31-60").balance, 75);
    assert.equal(report.buckets.find((b) => b.bucket === "current").balance, 50);
    assert.equal(report.parentBalances[0].balance, 125);
  });

  it("calculates aging buckets", () => {
    assert.equal(agingBucket(0), "current");
    assert.equal(agingBucket(30), "1-30");
    assert.equal(agingBucket(31), "31-60");
    assert.equal(agingBucket(61), "61-90");
    assert.equal(agingBucket(91), "90+");
  });

  it("calculates Sydney-local days overdue", () => {
    assert.equal(
      daysOverdue(
        invoice({ dueDate: new Date("2026-05-01T00:00:00+10:00") }),
        new Date("2026-05-03T23:00:00+10:00")
      ),
      2
    );
  });
});

describe("CSV exports", () => {
  it("escapes CSV values", () => {
    const csv = rowsToCsv(
      [{ name: 'A "quoted", value', amount: 10 }],
      [
        { key: "name", header: "Name" },
        { key: "amount", header: "Amount" },
      ]
    );
    assert.equal(csv, 'Name,Amount\n"A ""quoted"", value",10');
  });

  it("renders income report CSV rows", () => {
    const report = buildIncomeReport({
      invoices: [invoice()],
      payload: validateIncomeReportInput({
        fromDate: "2026-05-01T00:00:00Z",
        toDate: "2026-05-31T23:59:59Z",
      }),
      generatedAt: new Date("2026-05-10T00:00:00Z"),
    });
    const csv = csvForReport(report);
    assert.match(csv, /Group,Invoices,Total invoiced/);
    assert.match(csv, /2026-05,1,200/);
  });
});
