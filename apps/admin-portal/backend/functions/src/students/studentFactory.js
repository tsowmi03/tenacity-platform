"use strict";

const { createdMeta } = require("../shared/timestamps");

/**
 * Build an app-compatible `students/{studentId}` document.
 *
 * Subject names should already be validated upstream so the app can rely on
 * exact display strings such as `Maths` and `English`.
 */
function buildStudentDoc(input, { actorUid, clock } = {}) {
  if (!input || typeof input !== "object") {
    throw new TypeError("buildStudentDoc requires a normalised input object");
  }
  if (!actorUid) {
    throw new TypeError("buildStudentDoc requires actorUid for audit metadata");
  }

  const doc = {
    firstName: input.firstName,
    lastName: input.lastName,
    grade: input.grade,
    subjects: Array.isArray(input.subjects) ? input.subjects : [],
    parents: Array.isArray(input.parents) ? input.parents : [],
    ...createdMeta(actorUid, clock),
  };
  if (input.primaryParentId) {
    doc.primaryParentId = input.primaryParentId;
  }
  return doc;
}

module.exports = { buildStudentDoc };
