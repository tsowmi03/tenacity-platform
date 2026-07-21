"use strict";

const { writeAuditLog } = require("../shared/auditLog");

const REPORT_LABELS = {
  attendance: "Attendance report",
  classUtilisation: "Class utilisation report",
  income: "Income report",
  invoiceAging: "Invoice aging report",
  studentEnrolment: "Student enrolment report",
};

function serialiseFilterValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : null;
  }
  if (Array.isArray(value)) return value.map(serialiseFilterValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, child]) => [key, serialiseFilterValue(child)])
        .filter(([, child]) => child !== undefined)
    );
  }
  return value;
}

function reportRowCount(report) {
  if (Array.isArray(report?.rows)) return report.rows.length;
  if (Array.isArray(report?.invoices)) return report.invoices.length;
  if (Array.isArray(report?.byGrade)) return report.byGrade.length;
  return 0;
}

async function writeReportAuditLog(
  db,
  { actor, action, reportType, filters, rowCount, format },
  { logger, clock } = {}
) {
  return writeAuditLog(
    db,
    {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.claims?.role || actor.role || null,
      action,
      targetType: "report",
      targetId: reportType,
      targetName: REPORT_LABELS[reportType] || reportType,
      payloadSummary: {
        filters: serialiseFilterValue(filters || {}),
        rowCount,
        ...(format ? { format } : {}),
      },
    },
    { logger, clock }
  );
}

module.exports = {
  reportRowCount,
  serialiseFilterValue,
  writeReportAuditLog,
};
