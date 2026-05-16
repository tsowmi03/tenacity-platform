"use strict";

const { DateTime } = require("luxon");

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dayKey(date) {
  return DateTime.fromJSDate(date, { zone: "Australia/Sydney" }).toISODate();
}

function weekKey(date) {
  const dt = DateTime.fromJSDate(date, { zone: "Australia/Sydney" });
  return `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, "0")}`;
}

function monthKey(date) {
  return DateTime.fromJSDate(date, { zone: "Australia/Sydney" }).toFormat("yyyy-MM");
}

function invoiceDateForBasis(invoice, basis) {
  if (basis === "due") return toDate(invoice.dueDate);
  if (basis === "paid") return toDate(invoice.paidAt);
  return toDate(invoice.createdAt);
}

function invoiceLineItemsTotal(invoice) {
  const lines = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  const total = lines.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  return Math.round(total * 100) / 100;
}

function invoiceOriginalTotal(invoice) {
  const lineTotal = invoiceLineItemsTotal(invoice);
  if (Number.isFinite(lineTotal) && Math.abs(lineTotal) >= 0.01) return lineTotal;
  if (typeof invoice.amountDueComputed === "number") return invoice.amountDueComputed;
  return typeof invoice.amountDue === "number" ? invoice.amountDue : 0;
}

function invoiceOutstanding(invoice) {
  if (invoice.status === "paid") return 0;
  return typeof invoice.amountDue === "number" ? invoice.amountDue : invoiceOriginalTotal(invoice);
}

function groupKeyForInvoice(invoice, groupBy, basisDate) {
  if (groupBy === "day") return dayKey(basisDate);
  if (groupBy === "week") return weekKey(basisDate);
  if (groupBy === "month") return monthKey(basisDate);
  if (groupBy === "term") return invoice.termId || "unknown";
  if (groupBy === "parent") return invoice.parentId || "unknown";
  return "unknown";
}

function emptyMoneyMetrics(key) {
  return {
    key,
    invoiceCount: 0,
    totalInvoiced: 0,
    totalPaid: 0,
    totalUnpaid: 0,
    totalOverdue: 0,
    averageInvoiceValue: 0,
    xeroSynced: 0,
    xeroUnsynced: 0,
    stripePaymentIntentCount: 0,
  };
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function finaliseMoneyMetrics(metrics) {
  metrics.totalInvoiced = roundMoney(metrics.totalInvoiced);
  metrics.totalPaid = roundMoney(metrics.totalPaid);
  metrics.totalUnpaid = roundMoney(metrics.totalUnpaid);
  metrics.totalOverdue = roundMoney(metrics.totalOverdue);
  metrics.averageInvoiceValue =
    metrics.invoiceCount === 0
      ? 0
      : roundMoney(metrics.totalInvoiced / metrics.invoiceCount);
  return metrics;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows, columns) {
  const header = columns.map((col) => csvEscape(col.header)).join(",");
  const body = rows.map((row) =>
    columns.map((col) => csvEscape(row[col.key])).join(",")
  );
  return [header, ...body].join("\n");
}

module.exports = {
  csvEscape,
  dayKey,
  emptyMoneyMetrics,
  finaliseMoneyMetrics,
  groupKeyForInvoice,
  invoiceDateForBasis,
  invoiceOriginalTotal,
  invoiceOutstanding,
  monthKey,
  roundMoney,
  rowsToCsv,
  toDate,
  weekKey,
};
