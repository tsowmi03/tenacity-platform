"use strict";

// Input checks and role gates shared by the question bank's admin actions.

const { HttpsError } = require("firebase-functions/v2/https");

const STAFF_ROLES = ["admin", "tutor"];

function invalid(message) {
  return new HttpsError("invalid-argument", message);
}

function text(value, field, max) {
  if (typeof value !== "string" || value.length > max) throw invalid(`${field} must be text of at most ${max} characters`);
  return value.trim();
}

/** Text that must not be blank. */
function requiredText(value, field, max) {
  const trimmed = text(value, field, max);
  if (!trimmed) throw invalid(`${field} cannot be empty`);
  return trimmed;
}

/** Text an admin may clear; blank is stored as null. */
function optionalText(value, field, max) {
  if (value === null) return null;
  return text(value, field, max) || null;
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw invalid(`${field} must be one of: ${allowed.join(", ")}`);
  return value;
}

function id(value, field) {
  if (typeof value !== "string" || !value || value.length > 200 || value.includes("/")) throw invalid(`${field} is required`);
  return value;
}

function requireStaff(request) {
  const uid = request?.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required");
  const role = request.auth.token?.role || null;
  if (!STAFF_ROLES.includes(role)) throw new HttpsError("permission-denied", "Admin or tutor role required");
  return { uid, role, name: request.auth.token?.name || request.auth.token?.email || null };
}

function requireAdmin(actor) {
  if (actor.role !== "admin") throw new HttpsError("permission-denied", "Admin role required");
}

module.exports = { id, invalid, oneOf, optionalText, requireAdmin, requireStaff, requiredText, text };
