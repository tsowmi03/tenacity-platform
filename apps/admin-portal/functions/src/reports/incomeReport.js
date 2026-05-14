"use strict";

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { validateIncomeReportInput } = require("./reportSchemas");
const {
  emptyMoneyMetrics,
  finaliseMoneyMetrics,
  groupKeyForInvoice,
  invoiceDateForBasis,
  invoiceOriginalTotal,
  invoiceOutstanding,
} = require("./reportUtils");

function includeInvoice(invoice, payload) {
  if (payload.status !== "all" && invoice.status !== payload.status) {
    return false;
  }
  const date = invoiceDateForBasis(invoice, payload.basis);
  if (!date) return false;
  return date >= payload.fromDate && date <= payload.toDate;
}

function addInvoiceToMetrics(metrics, invoice, now = new Date()) {
  const originalTotal = invoiceOriginalTotal(invoice);
  const outstanding = invoiceOutstanding(invoice);
  const dueDate = invoiceDateForBasis(invoice, "due");

  metrics.invoiceCount += 1;
  metrics.totalInvoiced += originalTotal;
  if (invoice.status === "paid") {
    metrics.totalPaid += originalTotal;
  } else {
    metrics.totalUnpaid += outstanding;
  }
  if (
    invoice.status === "overdue" ||
    (invoice.status !== "paid" && dueDate && dueDate < now)
  ) {
    metrics.totalOverdue += outstanding;
  }
  if (invoice.xeroInvoiceId) metrics.xeroSynced += 1;
  else metrics.xeroUnsynced += 1;
  if (invoice.stripePaymentIntentId) metrics.stripePaymentIntentCount += 1;
}

async function loadInvoices(db) {
  const snap = await db.collection("invoices").get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function buildIncomeReport({ invoices, payload, generatedAt = new Date() }) {
  const groups = new Map();
  const summary = emptyMoneyMetrics("summary");

  invoices.filter((invoice) => includeInvoice(invoice, payload)).forEach((invoice) => {
    const basisDate = invoiceDateForBasis(invoice, payload.basis);
    const keys =
      payload.groupBy === "student"
        ? (Array.isArray(invoice.studentIds) && invoice.studentIds.length
            ? invoice.studentIds
            : ["unknown"])
        : [groupKeyForInvoice(invoice, payload.groupBy, basisDate)];

    addInvoiceToMetrics(summary, invoice, generatedAt);
    keys.forEach((key) => {
      if (!groups.has(key)) groups.set(key, emptyMoneyMetrics(key));
      addInvoiceToMetrics(groups.get(key), invoice, generatedAt);
    });
  });

  return {
    reportType: "income",
    generatedAt: generatedAt.toISOString(),
    filters: {
      fromDate: payload.fromDate.toISOString(),
      toDate: payload.toDate.toISOString(),
      basis: payload.basis,
      status: payload.status,
      groupBy: payload.groupBy,
    },
    summary: finaliseMoneyMetrics(summary),
    rows: [...groups.values()]
      .map(finaliseMoneyMetrics)
      .sort((a, b) => String(a.key).localeCompare(String(b.key))),
  };
}

async function incomeReportImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("incomeReportImpl requires db");
  if (!actor?.uid) throw new TypeError("incomeReportImpl requires actor.uid");

  const invoices = await loadInvoices(db);
  return buildIncomeReport({
    invoices,
    payload,
    generatedAt: clock ? clock() : new Date(),
  });
}

const adminIncomeReport = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  let payload;
  try {
    payload = validateIncomeReportInput(request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
  try {
    return await incomeReportImpl({
      payload,
      actor,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[adminIncomeReport] failed", {
      errorMessage: err?.message,
      actorUid: actor.uid,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  addInvoiceToMetrics,
  buildIncomeReport,
  includeInvoice,
  incomeReportImpl,
  adminIncomeReport,
};
