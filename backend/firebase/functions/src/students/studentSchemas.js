"use strict";

const {
  assertString,
  assertOptionalString,
  assertEnum,
  assertArray,
  validateShape,
} = require("../shared/validation");

const STUDENT_SUBJECTS = ["Maths", "English"];

function assertStudentSubject(value, field) {
  return assertEnum(value, field, STUDENT_SUBJECTS);
}

function validateCreateStudentInput(input) {
  return validateShape(input, {
    firstName: (v) => assertString(v, "firstName", { max: 80 }),
    lastName: (v) => assertString(v, "lastName", { max: 80 }),
    grade: (v) => assertString(v, "grade", { max: 10 }),
    subjects: (v) =>
      v === undefined
        ? []
        : assertArray(v, "subjects", {
            itemAssert: assertStudentSubject,
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
            itemAssert: assertStudentSubject,
            unique: true,
          }),
    primaryParentId: (v) =>
      assertOptionalString(v, "primaryParentId", { max: 80 }),
  });
}

module.exports = {
  STUDENT_SUBJECTS,
  validateCreateStudentInput,
  validateUpdateStudentInput,
};
