"use strict";

const {
  assertString,
  assertOptionalString,
  assertArray,
  validateShape,
} = require("../shared/validation");

function validateCreateStudentInput(input) {
  return validateShape(input, {
    firstName: (v) => assertString(v, "firstName", { max: 80 }),
    lastName: (v) => assertString(v, "lastName", { max: 80 }),
    grade: (v) => assertString(v, "grade", { max: 10 }),
    subjects: (v) =>
      v === undefined
        ? []
        : assertArray(v, "subjects", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    parents: (v) =>
      v === undefined
        ? []
        : assertArray(v, "parents", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    primaryParentId: (v) =>
      assertOptionalString(v, "primaryParentId", { max: 80 }),
  });
}

function validateUpdateStudentInput(input) {
  return validateShape(input, {
    firstName: (v) => assertOptionalString(v, "firstName", { max: 80 }),
    lastName: (v) => assertOptionalString(v, "lastName", { max: 80 }),
    grade: (v) => assertOptionalString(v, "grade", { max: 10 }),
    subjects: (v) =>
      v === undefined
        ? undefined
        : assertArray(v, "subjects", {
            itemAssert: (item, f) => assertString(item, f, { max: 80 }),
            unique: true,
          }),
    primaryParentId: (v) =>
      assertOptionalString(v, "primaryParentId", { max: 80 }),
  });
}

module.exports = {
  validateCreateStudentInput,
  validateUpdateStudentInput,
};
