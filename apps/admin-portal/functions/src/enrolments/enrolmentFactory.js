"use strict";

const { now } = require("../shared/timestamps");

/**
 * Lifecycle field builders for `enrolments/{enrolmentId}`.
 *
 * The portal does not own enrolment creation (the public intake form does),
 * so there is no "buildEnrolmentDoc". These helpers produce the lifecycle
 * patches that `adminAcceptEnrolment`/`adminArchiveEnrolment`/
 * `adminDeleteEnrolment` write back onto the existing doc.
 *
 * `acceptedFields` is intentionally idempotent: when called for an already-
 * accepted enrolment, the existing `acceptedAt`/`acceptedBy`/created* ids
 * should be preserved (the caller decides whether to merge or skip the
 * update entirely).
 */

function acceptedFields({ actorUid, createdParentId, createdStudentId, clock } = {}) {
  if (!actorUid) throw new TypeError("acceptedFields requires actorUid");
  const ts = now(clock);
  return {
    status: "accepted",
    archived: true,
    acceptedAt: ts,
    acceptedBy: actorUid,
    createdParentId,
    createdStudentId,
    updatedAt: ts,
    updatedBy: actorUid,
  };
}

function archivedFields({ actorUid, clock } = {}) {
  if (!actorUid) throw new TypeError("archivedFields requires actorUid");
  const ts = now(clock);
  return {
    status: "archived",
    archived: true,
    archivedAt: ts,
    archivedBy: actorUid,
    updatedAt: ts,
    updatedBy: actorUid,
  };
}

function unarchivedFields({ actorUid, clock } = {}) {
  if (!actorUid) throw new TypeError("unarchivedFields requires actorUid");
  const ts = now(clock);
  return {
    status: "pending",
    archived: false,
    archivedAt: null,
    archivedBy: null,
    updatedAt: ts,
    updatedBy: actorUid,
  };
}

function softDeletedFields({ actorUid, reason, clock } = {}) {
  if (!actorUid) throw new TypeError("softDeletedFields requires actorUid");
  const ts = now(clock);
  return {
    status: "deleted",
    archived: true,
    deletedAt: ts,
    deletedBy: actorUid,
    deleteReason: reason || null,
    updatedAt: ts,
    updatedBy: actorUid,
  };
}

module.exports = {
  acceptedFields,
  archivedFields,
  unarchivedFields,
  softDeletedFields,
};
