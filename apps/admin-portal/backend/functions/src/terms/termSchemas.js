"use strict";

const {
  ValidationError,
  assertString,
  assertNumber,
} = require("../shared/validation");

/**
 * Terms are not yet portal-managed. Per PLAN.md, the Flutter `Term.fromMap`
 * reads `termNum` / `weeksNum` / `status` while `Term.toMap` writes
 * `termNumber` / `totalWeeks` / `isActive`. Existing Firestore data therefore
 * has both shapes in the wild.
 *
 * This module provides a READ-ONLY normaliser so reporting code can treat a
 * term consistently. It does NOT provide a `buildTermDoc` — we should not
 * introduce a third shape; if/when the portal owns term writes, the app
 * model must be fixed first and documents migrated deliberately.
 */
function normaliseTermDoc(raw, id = "<unknown>") {
  if (!raw || typeof raw !== "object") {
    throw new ValidationError("term data must be an object", { field: id });
  }

  const year = assertString(raw.year, `${id}.year`, { max: 10 });

  const termNumRaw = raw.termNum ?? raw.termNumber;
  const termNum = assertNumber(termNumRaw, `${id}.termNum|termNumber`, {
    min: 1,
    max: 4,
    integer: true,
  });

  const weeksNumRaw = raw.weeksNum ?? raw.totalWeeks;
  const weeksNum = assertNumber(weeksNumRaw, `${id}.weeksNum|totalWeeks`, {
    min: 1,
    max: 20,
    integer: true,
  });

  let active;
  if (typeof raw.status === "string") {
    active = raw.status === "active";
  } else if (typeof raw.isActive === "boolean") {
    active = raw.isActive;
  } else if (typeof raw.status === "boolean") {
    active = raw.status;
  } else {
    active = false;
  }

  const startDate = toDate(raw.startDate, `${id}.startDate`);
  const endDate = toDate(raw.endDate, `${id}.endDate`);

  return {
    id,
    year,
    termNum,
    weeksNum,
    active,
    startDate,
    endDate,
  };
}

function toDate(v, field) {
  if (v && typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  throw new ValidationError(`${field} must be a Timestamp or Date`, { field });
}

module.exports = { normaliseTermDoc };
