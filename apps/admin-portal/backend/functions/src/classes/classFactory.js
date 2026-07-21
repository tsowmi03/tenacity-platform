"use strict";

const { createdMeta } = require("../shared/timestamps");

/**
 * Build an app-compatible `classes/{classId}` document. Field names match
 * the Flutter app model exactly:
 *  - `day` (not `dayOfWeek`)
 *  - `startTime` / `endTime` are "HH:mm" strings
 */
function buildClassDoc(input, { actorUid, clock } = {}) {
  if (!input || typeof input !== "object") {
    throw new TypeError("buildClassDoc requires a normalised input object");
  }
  if (!actorUid) {
    throw new TypeError("buildClassDoc requires actorUid for audit metadata");
  }
  return {
    type: input.type,
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
    capacity: input.capacity,
    enrolledStudents: Array.isArray(input.enrolledStudents)
      ? input.enrolledStudents
      : [],
    tutors: Array.isArray(input.tutors) ? input.tutors : [],
    ...createdMeta(actorUid, clock),
  };
}

module.exports = { buildClassDoc };
