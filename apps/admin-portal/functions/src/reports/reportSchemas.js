"use strict";

const {
  ValidationError,
  assertBoolean,
  assertEnum,
  assertArray,
  assertString,
  validateShape,
} = require("../shared/validation");
const { assertDateInput, INVOICE_STATUSES } = require("../invoices/invoiceSchemas");

const INCOME_BASES = ["created", "due", "paid"];
const INCOME_GROUPS = ["day", "week", "month", "term", "parent", "student"];
const ATTENDANCE_GROUPS = ["day", "week", "class", "student", "tutor"];
const EXPORT_REPORT_TYPES = ["income", "invoiceAging", "attendance", "studentEnrolment"];
const EXPORT_FORMATS = ["csv"];

function optionalDate(value, field) {
  return value === undefined || value === null ? undefined : assertDateInput(value, field);
}

function validateDateRange({ fromDate, toDate }) {
  if (fromDate > toDate) {
    throw new ValidationError("fromDate must be before or equal to toDate", {
      field: "fromDate",
    });
  }
}

function validateIncomeReportInput(input) {
  const out = validateShape(input || {}, {
    fromDate: (v) => assertDateInput(v, "fromDate"),
    toDate: (v) => assertDateInput(v, "toDate"),
    basis: (v) => (v === undefined ? "created" : assertEnum(v, "basis", INCOME_BASES)),
    status: (v) =>
      v === undefined || v === "all"
        ? "all"
        : assertEnum(v, "status", INVOICE_STATUSES),
    groupBy: (v) =>
      v === undefined ? "month" : assertEnum(v, "groupBy", INCOME_GROUPS),
  });
  validateDateRange(out);
  return out;
}

function validateInvoiceAgingReportInput(input) {
  const out = validateShape(input || {}, {
    asOfDate: (v) => optionalDate(v, "asOfDate"),
  });
  return {
    asOfDate: out.asOfDate || new Date(),
  };
}

function optionalStringArray(value, field) {
  if (value === undefined || value === null) return undefined;
  return assertArray(value, field, {
    itemAssert: (id, f) => assertString(id, f),
    max: 100,
  });
}

function validateAttendanceReportInput(input) {
  const out = validateShape(input || {}, {
    fromDate: (v) => assertDateInput(v, "fromDate"),
    toDate: (v) => assertDateInput(v, "toDate"),
    classIds: (v) => optionalStringArray(v, "classIds"),
    tutorIds: (v) => optionalStringArray(v, "tutorIds"),
    studentIds: (v) => optionalStringArray(v, "studentIds"),
    includeCancelled: (v) => (v === undefined ? false : assertBoolean(v, "includeCancelled")),
    groupBy: (v) =>
      v === undefined ? "class" : assertEnum(v, "groupBy", ATTENDANCE_GROUPS),
  });
  validateDateRange(out);
  return out;
}

function validateClassUtilisationReportInput(input) {
  const out = validateShape(input || {}, {
    fromDate: (v) => assertDateInput(v, "fromDate"),
    toDate: (v) => assertDateInput(v, "toDate"),
    classIds: (v) => optionalStringArray(v, "classIds"),
  });
  validateDateRange(out);
  return out;
}

function validateExportReportInput(input) {
  const out = validateShape(input || {}, {
    reportType: (v) => assertEnum(v, "reportType", EXPORT_REPORT_TYPES),
    format: (v) => (v === undefined ? "csv" : assertEnum(v, "format", EXPORT_FORMATS)),
    fileName: (v) =>
      v === undefined ? undefined : assertString(v, "fileName", { max: 160 }),
  });
  return out;
}

module.exports = {
  ATTENDANCE_GROUPS,
  EXPORT_FORMATS,
  EXPORT_REPORT_TYPES,
  INCOME_BASES,
  INCOME_GROUPS,
  optionalStringArray,
  validateAttendanceReportInput,
  validateClassUtilisationReportInput,
  validateDateRange,
  validateIncomeReportInput,
  validateInvoiceAgingReportInput,
  validateExportReportInput,
};
