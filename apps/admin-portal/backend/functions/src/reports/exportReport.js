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
const { reportToXlsx } = require("./xlsxExport");
const { generateReportPdf } = require("./pdfExport");
const { writeReportAuditLog } = require("./reportAudit");

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

const REPORT_TITLES = {
  income: "Income Report",
  invoiceAging: "Invoice Aging Report",
  attendance: "Attendance Report",
  studentEnrolment: "Student Enrolment Report",
};

function columnsAndRowsForReport(report) {
  if (report.reportType === "income") return { columns: INCOME_COLUMNS, rows: report.rows };
  if (report.reportType === "invoiceAging") return { columns: AGING_COLUMNS, rows: report.invoices };
  if (report.reportType === "attendance") return { columns: ATTENDANCE_COLUMNS, rows: report.rows };
  if (report.reportType === "studentEnrolment") return { columns: STUDENT_ENROLMENT_COLUMNS, rows: report.byGrade };
  throw new Error(`Unsupported report type: ${report.reportType}`);
}

function csvForReport(report) {
  const { columns, rows } = columnsAndRowsForReport(report);
  return rowsToCsv(rows, columns);
}

const CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

const EXTENSIONS = { csv: "csv", xlsx: "xlsx", pdf: "pdf" };

function defaultFileName(reportType, format, now = new Date()) {
  return `${reportType}-${now.toISOString().slice(0, 10)}.${EXTENSIONS[format] || format}`;
}

async function renderReport(report, format) {
  const { columns, rows } = columnsAndRowsForReport(report);
  if (format === "csv") {
    return { csv: rowsToCsv(rows, columns) };
  }
  if (format === "xlsx") {
    return { data: reportToXlsx(report, columns, rows) };
  }
  if (format === "pdf") {
    const buf = await generateReportPdf(
      REPORT_TITLES[report.reportType] || report.reportType,
      report,
      columns,
      rows
    );
    return { data: buf };
  }
  throw new Error(`Unsupported format: ${format}`);
}

async function exportReportImpl({ payload, actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("exportReportImpl requires db");
  if (!actor?.uid) throw new TypeError("exportReportImpl requires actor.uid");

  const generatedAt = clock ? clock() : new Date();
  let report;
  if (payload.reportType === "income") {
    const reportPayload = validateIncomeReportInput(payload.report || {});
    report = await incomeReportImpl({ payload: reportPayload, actor, deps: { db, clock: () => generatedAt } });
  } else if (payload.reportType === "invoiceAging") {
    const reportPayload = validateInvoiceAgingReportInput(payload.report || {});
    report = await invoiceAgingReportImpl({ payload: reportPayload, actor, deps: { db, clock: () => generatedAt } });
  } else if (payload.reportType === "attendance") {
    const reportPayload = validateAttendanceReportInput(payload.report || {});
    report = await attendanceReportImpl({ payload: reportPayload, actor, deps: { db, clock: () => generatedAt } });
  } else {
    report = await studentEnrolmentReportImpl({ actor, deps: { db, clock: () => generatedAt } });
  }

  const format = payload.format || "csv";
  const { rows } = columnsAndRowsForReport(report);
  const rendered = await renderReport(report, format);

  return {
    reportType: payload.reportType,
    format,
    fileName: payload.fileName || defaultFileName(payload.reportType, format, generatedAt),
    contentType: CONTENT_TYPES[format],
    ...rendered,
    rowCount: rows.length,
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
    const db = admin.firestore();
    const exported = await exportReportImpl({ payload, actor, deps: { db } });
    await writeReportAuditLog(
      db,
      {
        actor,
        action: "report.export",
        reportType: exported.reportType,
        filters: payload.report,
        rowCount: exported.rowCount,
        format: exported.format,
      },
      { logger }
    );
    return exported;
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
