"use strict";

const {
  ValidationError,
  assertString,
  assertOptionalString,
  assertNumber,
  assertArray,
  assertBoolean,
  assertHHmm,
  assertDayOfWeek,
  validateShape,
} = require("../shared/validation");

function optionalDate(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  throw new ValidationError(`${field} must be a Date or ISO date string`, {
    field,
  });
}

function validateCreateClassInput(input) {
  const out = validateShape(input, {
    id: (v) => assertOptionalString(v, "id", { max: 120 }),
    type: (v) => assertString(v, "type", { max: 80 }),
    day: (v) => assertDayOfWeek(v),
    startTime: (v) => assertHHmm(v, "startTime"),
    endTime: (v) => assertHHmm(v, "endTime"),
    capacity: (v) =>
      assertNumber(v, "capacity", { min: 1, max: 200, integer: true }),
    tutors: (v) =>
      v === undefined
        ? []
        : assertArray(v, "tutors", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    enrolledStudents: (v) =>
      v === undefined
        ? []
        : assertArray(v, "enrolledStudents", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    termIds: (v) =>
      v === undefined
        ? []
        : assertArray(v, "termIds", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    generateAttendance: (v) =>
      v === undefined ? false : assertBoolean(v, "generateAttendance"),
    attendanceFromDate: (v) => optionalDate(v, "attendanceFromDate"),
  });

  if (out.startTime >= out.endTime) {
    throw new ValidationError("endTime must be after startTime", {
      field: "endTime",
    });
  }
  if (out.enrolledStudents.length > out.capacity) {
    throw new ValidationError(
      "capacity cannot be less than enrolledStudents length",
      { field: "capacity" }
    );
  }
  return out;
}

function validateUpdateClassInput(input) {
  const out = validateShape(input, {
    type: (v) => assertOptionalString(v, "type", { max: 80 }),
    day: (v) => (v === undefined ? undefined : assertDayOfWeek(v)),
    startTime: (v) => (v === undefined ? undefined : assertHHmm(v, "startTime")),
    endTime: (v) => (v === undefined ? undefined : assertHHmm(v, "endTime")),
    capacity: (v) =>
      v === undefined
        ? undefined
        : assertNumber(v, "capacity", { min: 1, max: 200, integer: true }),
    tutors: (v) =>
      v === undefined
        ? undefined
        : assertArray(v, "tutors", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    enrolledStudents: (v) =>
      v === undefined
        ? undefined
        : assertArray(v, "enrolledStudents", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
  });

  if (
    out.startTime !== undefined &&
    out.endTime !== undefined &&
    out.startTime >= out.endTime
  ) {
    throw new ValidationError("endTime must be after startTime", {
      field: "endTime",
    });
  }

  return out;
}

module.exports = {
  validateCreateClassInput,
  validateUpdateClassInput,
};
