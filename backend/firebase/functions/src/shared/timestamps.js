"use strict";

const admin = require("firebase-admin");

/**
 * Thin wrappers over `admin.firestore.Timestamp` so call sites read clearly
 * and tests can inject their own clock without monkey-patching admin.
 *
 * Pass `clock` (a `() => Date`) anywhere you need deterministic time in tests.
 */

function now(clock = () => new Date()) {
  return admin.firestore.Timestamp.fromDate(clock());
}

function fromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("fromDate requires a valid Date");
  }
  return admin.firestore.Timestamp.fromDate(date);
}

/**
 * Build `{ createdAt, createdBy, updatedAt, updatedBy }` for a new document.
 */
function createdMeta(actorUid, clock) {
  const ts = now(clock);
  return {
    createdAt: ts,
    createdBy: actorUid,
    updatedAt: ts,
    updatedBy: actorUid,
  };
}

/**
 * Build `{ updatedAt, updatedBy }` for an update.
 */
function updatedMeta(actorUid, clock) {
  return { updatedAt: now(clock), updatedBy: actorUid };
}

module.exports = { now, fromDate, createdMeta, updatedMeta };
