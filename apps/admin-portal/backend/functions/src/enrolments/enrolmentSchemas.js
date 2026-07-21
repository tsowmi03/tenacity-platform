"use strict";

const {
  assertString,
  assertOptionalString,
  assertEnum,
  validateShape,
} = require("../shared/validation");

const ENROLMENT_STATUSES = ["pending", "accepted", "archived", "deleted"];

/**
 * Used by `adminAcceptEnrolment` and similar. The incoming enrolment doc was
 * created by the public intake form (in the Flutter app/website), so the
 * portal does not validate the carer/student details on accept — it just
 * picks the enrolment by id and the (optional) override of which classes to
 * enrol into.
 */
function validateAcceptEnrolmentInput(input) {
  return validateShape(input, {
    enrolmentId: (v) => assertString(v, "enrolmentId", { max: 120 }),
  });
}

function validateArchiveEnrolmentInput(input) {
  return validateShape(input, {
    enrolmentId: (v) => assertString(v, "enrolmentId", { max: 120 }),
  });
}

function validateDeleteEnrolmentInput(input) {
  return validateShape(input, {
    enrolmentId: (v) => assertString(v, "enrolmentId", { max: 120 }),
    reason: (v) => assertOptionalString(v, "reason", { max: 500 }),
  });
}

function validateEnrolmentStatus(value, field = "status") {
  return assertEnum(value, field, ENROLMENT_STATUSES);
}

module.exports = {
  ENROLMENT_STATUSES,
  validateAcceptEnrolmentInput,
  validateArchiveEnrolmentInput,
  validateDeleteEnrolmentInput,
  validateEnrolmentStatus,
};
