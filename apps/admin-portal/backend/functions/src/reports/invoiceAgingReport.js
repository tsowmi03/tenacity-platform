"use strict";

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { DateTime } = require("luxon");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { validateInvoiceAgingReportInput } = require("./reportSchemas");
const { reportRowCount, writeReportAuditLog } = require("./reportAudit");
const { invoiceOutstanding, roundMoney, toDate } = require("./reportUtils");

function daysOverdue(invoice, asOfDate) {
  const dueDate = toDate(invoice.dueDate);
  if (!dueDate) return 0;
  const due = DateTime.fromJSDate(dueDate, { zone: "Australia/Sydney" }).startOf("day");
  const asOf = DateTime.fromJSDate(asOfDate, { zone: "Australia/Sydney" }).startOf("day");
  return Math.max(0, Math.floor(asOf.diff(due, "days").days));
}

function agingBucket(days) {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

async function loadInvoices(db) {
  const snap = await db
    .collection("invoices")
    .where("status", "in", ["unpaid", "overdue"])
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function buildInvoiceAgingReport({ invoices, payload, generatedAt = new Date() }) {
  const buckets = {
    current: { bucket: "current", invoiceCount: 0, balance: 0 },
    "1-30": { bucket: "1-30", invoiceCount: 0, balance: 0 },
    "31-60": { bucket: "31-60", invoiceCount: 0, balance: 0 },
    "61-90": { bucket: "61-90", invoiceCount: 0, balance: 0 },
    "90+": { bucket: "90+", invoiceCount: 0, balance: 0 },
  };
  const parentBalances = new Map();
  const invoiceRows = [];
  let missingXeroId = 0;
  let missingPdfPath = 0;
  let stripeIntentButUnpaid = 0;
  let totalOutstanding = 0;

  invoices
    .filter((invoice) => invoice.status !== "paid")
    .forEach((invoice) => {
      const balance = invoiceOutstanding(invoice);
      const overdueDays = daysOverdue(invoice, payload.asOfDate);
      const bucket = agingBucket(overdueDays);

      buckets[bucket].invoiceCount += 1;
      buckets[bucket].balance += balance;
      totalOutstanding += balance;

      const parentKey = invoice.parentId || "unknown";
      if (!parentBalances.has(parentKey)) {
        parentBalances.set(parentKey, {
          parentId: parentKey,
          parentName: invoice.parentName || "",
          parentEmail: invoice.parentEmail || "",
          invoiceCount: 0,
          balance: 0,
          oldestDueDate: null,
          oldestDaysOverdue: 0,
        });
      }
      const parent = parentBalances.get(parentKey);
      parent.invoiceCount += 1;
      parent.balance += balance;
      if (overdueDays > parent.oldestDaysOverdue) {
        parent.oldestDaysOverdue = overdueDays;
        const dueDate = toDate(invoice.dueDate);
        parent.oldestDueDate = dueDate ? dueDate.toISOString() : null;
      }

      if (!invoice.xeroInvoiceId) missingXeroId += 1;
      if (!invoice.xeroInvoicePdfPath) missingPdfPath += 1;
      if (invoice.stripePaymentIntentId) stripeIntentButUnpaid += 1;

      invoiceRows.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber || "",
        parentId: parentKey,
        parentName: invoice.parentName || "",
        status: invoice.status || "unpaid",
        balance: roundMoney(balance),
        daysOverdue: overdueDays,
        bucket,
        dueDate: toDate(invoice.dueDate)?.toISOString() || "",
        hasXeroInvoice: Boolean(invoice.xeroInvoiceId),
        hasPdfPath: Boolean(invoice.xeroInvoicePdfPath),
        hasStripePaymentIntent: Boolean(invoice.stripePaymentIntentId),
      });
    });

  Object.values(buckets).forEach((bucket) => {
    bucket.balance = roundMoney(bucket.balance);
  });

  return {
    reportType: "invoiceAging",
    generatedAt: generatedAt.toISOString(),
    filters: { asOfDate: payload.asOfDate.toISOString() },
    summary: {
      invoiceCount: invoiceRows.length,
      totalOutstanding: roundMoney(totalOutstanding),
      missingXeroId,
      missingPdfPath,
      stripeIntentButUnpaid,
    },
    buckets: Object.values(buckets),
    parentBalances: [...parentBalances.values()]
      .map((parent) => ({ ...parent, balance: roundMoney(parent.balance) }))
      .sort((a, b) => b.balance - a.balance),
    invoices: invoiceRows.sort((a, b) => b.daysOverdue - a.daysOverdue),
  };
}

async function invoiceAgingReportImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("invoiceAgingReportImpl requires db");
  if (!actor?.uid) throw new TypeError("invoiceAgingReportImpl requires actor.uid");

  const invoices = await loadInvoices(db);
  return buildInvoiceAgingReport({
    invoices,
    payload,
    generatedAt: clock ? clock() : new Date(),
  });
}

const adminInvoiceAgingReport = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    let payload;
    try {
      payload = validateInvoiceAgingReportInput(request.data);
    } catch (err) {
      throw toHttpsError(err);
    }
    try {
      const db = admin.firestore();
      const report = await invoiceAgingReportImpl({
        payload,
        actor,
        deps: { db },
      });
      await writeReportAuditLog(
        db,
        {
          actor,
          action: "report.generate",
          reportType: report.reportType,
          filters: report.filters,
          rowCount: reportRowCount(report),
        },
        { logger }
      );
      return report;
    } catch (err) {
      logger.error("[adminInvoiceAgingReport] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  agingBucket,
  buildInvoiceAgingReport,
  daysOverdue,
  invoiceAgingReportImpl,
  loadInvoices,
  adminInvoiceAgingReport,
};
