import { callFunction } from "./callable";
import { getDocument, listDocuments, orderBy, where } from "./firestoreReads";
import { normalizeEnrolment } from "./schemas";

export async function listEnrolments(filters = {}) {
  const rows = await listDocuments("enrolments", {
    constraints: [orderBy("archived", "asc")],
    normalize: normalizeEnrolment,
  });
  const filtered = typeof filters.archived === "boolean"
    ? rows.filter((row) => row.archived === filters.archived)
    : rows;

  return filtered.sort((a, b) => {
    const archiveSort = Number(a.archived) - Number(b.archived);
    if (archiveSort !== 0) return archiveSort;
    return a.id.localeCompare(b.id);
  });
}

export function getEnrolment(id) {
  return getDocument("enrolments", id, { normalize: normalizeEnrolment });
}

export async function listEnrolmentsByRegistrationGroup(registrationGroupId) {
  const groupId = String(registrationGroupId || "").trim();
  if (!groupId) return [];

  const rows = await listDocuments("enrolments", {
    constraints: [where("registrationGroupId", "==", groupId)],
    normalize: normalizeEnrolment,
  });

  return rows.sort((a, b) => {
    const aIndex = Number.isInteger(a.registrationGroupIndex)
      ? a.registrationGroupIndex
      : Number.MAX_SAFE_INTEGER;
    const bIndex = Number.isInteger(b.registrationGroupIndex)
      ? b.registrationGroupIndex
      : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || a.id.localeCompare(b.id);
  });
}

export function acceptEnrolment(enrolmentId) {
  return callFunction("adminAcceptEnrolment", { enrolmentId });
}

export function archiveEnrolment(enrolmentId) {
  return callFunction("adminArchiveEnrolment", { enrolmentId });
}

export function unarchiveEnrolment(enrolmentId) {
  return callFunction("adminUnarchiveEnrolment", { enrolmentId });
}

export function updateEnrolment(enrolmentId, updates) {
  return callFunction("adminUpdateEnrolment", { enrolmentId, ...updates });
}

export function deleteEnrolment(enrolmentId, reason) {
  return callFunction("adminDeleteEnrolment", { enrolmentId, reason });
}

export function purgeEnrolment(enrolmentId, confirmId, reason) {
  return callFunction("adminPurgeEnrolment", { enrolmentId, confirmId, reason });
}
