"use strict";

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const {
  validateExportReportInput,
  validateIncomeReportInput,
  validateInvoiceAgingReportInput,
  validateAttendanceReportInput,
} = require("./reportSchemas");
const { incomeReportImpl } = require("./incomeReport");
const { invoiceAgingReportImpl } = require("./invoiceAgingReport");
const { attendanceReportImpl } = require("./attendanceReport");
const { studentEnrolmentReportImpl } = require("./studentEnrolmentReport");
const { rowsToCsv } = require("./reportUtils");

const INCOME_COLUMNS = [
  { key: "key", header: "Group" },
  { key: "invoiceCount", header: "Invoices" },
  { key: "totalInvoiced", header: "Total invoiced" },
  { key: "totalPaid", header: "Total paid" },
  { key: "totalUnpaid", header: "Total unpaid" },
  { key: "totalOverdue", header: "Total overdue" },
  { key: "averageInvoiceValue", header: "Average invoice value" },
  { key: "xeroSynced", header: "Xero synced" },
  { key: "xeroUnsynced", header: "Xero unsynced" },
  { key: "stripePaymentIntentCount", header: "Stripe payment intents" },
];

const AGING_COLUMNS = [
  { key: "invoiceId", header: "Invoice ID" },
  { key: "invoiceNumber", header: "Invoice number" },
  { key: "parentId", header: "Parent ID" },
  { key: "parentName", header: "Parent name" },
  { key: "status", header: "Status" },
  { key: "balance", header: "Balance" },
  { key: "daysOverdue", header: "Days overdue" },
  { key: "bucket", header: "Bucket" },
  { key: "dueDate", header: "Due date" },
  { key: "hasXeroInvoice", header: "Has Xero invoice" },
  { key: "hasPdfPath", header: "Has PDF path" },
  { key: "hasStripePaymentIntent", header: "Has Stripe payment intent" },
];

const ATTENDANCE_COLUMNS = [
  { key: "key", header: "Class ID" },
  { key: "classType", header: "Type" },
  { key: "day", header: "Day" },
  { key: "startTime", header: "Start time" },
  { key: "endTime", header: "End time" },
  { key: "capacity", header: "Capacity" },
  { key: "permanentEnrolments", header: "Permanent enrolments" },
  { key: "sessionsScheduled", header: "Sessions scheduled" },
  { key: "sessionsCancelled", header: "Sessions cancelled" },
  { key: "sessionsHeld", header: "Sessions held" },
  { key: "totalStudentAttendances", header: "Total student attendances" },
  { key: "studentsNotPresent", header: "Students not present" },
  { key: "oneOffBookings", header: "One-off bookings" },
  { key: "averageAttendance", header: "Average attendance" },
  { key: "utilisationRate", header: "Utilisation rate" },
];

const STUDENT_ENROLMENT_COLUMNS = [
  { key: "grade", header: "Grade" },
  { key: "count", header: "Student count" },
];

function csvForReport(report) {
  if (report.reportType === "income") {
    return rowsToCsv(report.rows, INCOME_COLUMNS);
  }
  if (report.reportType === "invoiceAging") {
    return rowsToCsv(report.invoices, AGING_COLUMNS);
  }
  if (report.reportType === "attendance") {
    return rowsToCsv(report.rows, ATTENDANCE_COLUMNS);
  }
  if (report.reportType === "studentEnrolment") {
    return rowsToCsv(report.byGrade, STUDENT_ENROLMENT_COLUMNS);
  }
  throw new Error(`Unsupported report type: ${report.reportType}`);
}

function defaultFileName(reportType, now = new Date()) {
  return `${reportType}-${now.toISOString().slice(0, 10)}.csv`;
}

async function exportReportImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("exportReportImpl requires db");
  if (!actor?.uid) throw new TypeError("exportReportImpl requires actor.uid");

  const generatedAt = clock ? clock() : new Date();
  let report;
  if (payload.reportType === "income") {
    const reportPayload = validateIncomeReportInput(payload.report || {});
    report = await incomeReportImpl({
      payload: reportPayload,
      actor,
      deps: { db, clock: () => generatedAt },
    });
  } else if (payload.reportType === "invoiceAging") {
    const reportPayload = validateInvoiceAgingReportInput(payload.report || {});
    report = await invoiceAgingReportImpl({
      payload: reportPayload,
      actor,
      deps: { db, clock: () => generatedAt },
    });
  } else if (payload.reportType === "attendance") {
    const reportPayload = validateAttendanceReportInput(payload.report || {});
    report = await attendanceReportImpl({
      payload: reportPayload,
      actor,
      deps: { db, clock: () => generatedAt },
    });
  } else {
    report = await studentEnrolmentReportImpl({
      actor,
      deps: { db, clock: () => generatedAt },
    });
  }

  const csv = csvForReport(report);
  const rowCount =
    report.reportType === "income" ? report.rows.length
    : report.reportType === "invoiceAging" ? report.invoices.length
    : report.reportType === "attendance" ? report.rows.length
    : report.byGrade.length;

  return {
    reportType: payload.reportType,
    format: "csv",
    fileName: payload.fileName || defaultFileName(payload.reportType, generatedAt),
    contentType: "text/csv; charset=utf-8",
    csv,
    rowCount,
  };
}

const adminExportReport = onCall({ region: "us-central1" }, async (request) => {
  const actor = requireAdminCallable(request);
  let payload;
  try {
    payload = validateExportReportInput(request.data);
    payload.report = request.data?.report || {};
  } catch (err) {
    throw toHttpsError(err);
  }
  try {
    return await exportReportImpl({
      payload,
      actor,
      deps: { db: admin.firestore() },
    });
  } catch (err) {
    logger.error("[adminExportReport] failed", {
      errorMessage: err?.message,
      actorUid: actor.uid,
    });
    throw toHttpsError(err);
  }
});

module.exports = {
  AGING_COLUMNS,
  ATTENDANCE_COLUMNS,
  INCOME_COLUMNS,
  STUDENT_ENROLMENT_COLUMNS,
  csvForReport,
  defaultFileName,
  exportReportImpl,
  adminExportReport,
};
