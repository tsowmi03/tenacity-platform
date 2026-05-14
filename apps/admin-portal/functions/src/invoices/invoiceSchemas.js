"use strict";

const {
  ValidationError,
  assertString,
  assertOptionalString,
  assertEmail,
  assertEnum,
  assertNumber,
  assertBoolean,
  assertArray,
  validateShape,
} = require("../shared/validation");

const INVOICE_STATUSES = ["unpaid", "paid", "overdue"];

function assertDateInput(value, field) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  throw new ValidationError(`${field} must be a valid date`, { field });
}

function assertLineItem(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`, { field });
  }
  const out = validateShape(value, {
    studentName: (v) =>
      assertOptionalString(v, `${field}.studentName`, { max: 160 }),
    description: (v) =>
      assertString(v, `${field}.description`, { max: 500 }),
    quantity: (v) =>
      assertNumber(v, `${field}.quantity`, { min: 0 }),
    unitAmount: (v) =>
      assertNumber(v, `${field}.unitAmount`),
    lineTotal: (v) =>
      assertNumber(v, `${field}.lineTotal`),
    isAdminAdjustment: (v) =>
      v === undefined ? undefined : assertBoolean(v, `${field}.isAdminAdjustment`),
  });
  return out;
}

function validateCreateInvoiceInput(input) {
  return validateShape(input, {
    parentId: (v) => assertString(v, "parentId", { max: 120 }),
    parentName: (v) => assertString(v, "parentName", { max: 160 }),
    parentEmail: (v) => assertEmail(v, "parentEmail"),
    studentIds: (v) =>
      assertArray(v, "studentIds", {
        itemAssert: (item, f) => assertString(item, f, { max: 120 }),
        unique: true,
        min: 1,
      }),
    weeks: (v) => assertNumber(v, "weeks", { min: 0, integer: true }),
    amountDue: (v) => assertNumber(v, "amountDue", { min: 0 }),
    amountDueComputed: (v) =>
      v === undefined ? undefined : assertNumber(v, "amountDueComputed"),
    amountDueOverride: (v) =>
      v === undefined ? undefined : assertNumber(v, "amountDueOverride", { min: 0 }),
    dueDate: (v) => assertDateInput(v, "dueDate"),
    lineItems: (v) =>
      assertArray(v, "lineItems", {
        itemAssert: assertLineItem,
        min: 1,
      }),
    adminNotes: (v) => assertOptionalString(v, "adminNotes", { max: 1000 }),
    invoiceNumber: (v) => assertOptionalString(v, "invoiceNumber", { max: 40 }),
  });
}

function validateUpdateInvoiceInput(input) {
  return validateShape(input, {
    status: (v) =>
      v === undefined ? undefined : assertEnum(v, "status", INVOICE_STATUSES),
    adminNotes: (v) => assertOptionalString(v, "adminNotes", { max: 1000 }),
    amountDueOverride: (v) =>
      v === undefined
        ? undefined
        : assertNumber(v, "amountDueOverride", { min: 0 }),
    dueDate: (v) => (v === undefined ? undefined : assertDateInput(v, "dueDate")),
    lineItems: (v) =>
      v === undefined
        ? undefined
        : assertArray(v, "lineItems", { itemAssert: assertLineItem, min: 1 }),
  });
}

module.exports = {
  INVOICE_STATUSES,
  assertDateInput,
  assertLineItem,
  validateCreateInvoiceInput,
  validateUpdateInvoiceInput,
};
