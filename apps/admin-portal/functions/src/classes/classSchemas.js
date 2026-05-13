"use strict";

const {
  assertString,
  assertOptionalString,
  assertNumber,
  assertArray,
  assertHHmm,
  assertDayOfWeek,
  validateShape,
} = require("../shared/validation");

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
  });

  if (out.startTime >= out.endTime) {
    const err = new Error("endTime must be after startTime");
    err.field = "endTime";
    throw err;
  }
  return out;
}

function validateUpdateClassInput(input) {
  return validateShape(input, {
    type: (v) => assertOptionalString(v, "type", { max: 80 }),
    day: (v) => (v === undefined ? undefined : assertDayOfWeek(v)),
    startTime: (v) => (v === undefined ? undefined : assertHHmm(v, "startTime")),
    endTime: (v) => (v === undefined ? undefined : assertHHmm(v, "endTime")),
    capacity: (v) =>
      v === undefined
        ? undefined
        : assertNumber(v, "capacity", { min: 1, max: 200, integer: true }),
  });
}

module.exports = {
  validateCreateClassInput,
  validateUpdateClassInput,
};
