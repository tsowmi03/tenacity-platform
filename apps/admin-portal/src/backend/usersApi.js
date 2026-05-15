import { callFunction } from "./callable";
import { getDocument, listDocuments, orderBy } from "./firestoreReads";
import { normalizeUser } from "./schemas";

export async function listUsers(filters = {}) {
  const rows = await listDocuments("users", {
    constraints: [orderBy("lastName", "asc")],
    normalize: normalizeUser,
  });
  return filters.role ? rows.filter((row) => row.role === filters.role) : rows;
}

export function getUser(uid) {
  return getDocument("users", uid, { normalize: normalizeUser });
}

export function createUser(payload) {
  return callFunction("adminCreateUser", payload);
}

export function createParent(payload) {
  return callFunction("adminCreateParent", payload);
}

export function updateUser(uid, updates) {
  return callFunction("adminUpdateUser", { uid, ...updates });
}

export function deleteUser(uid, confirmEmail) {
  return callFunction("adminDeleteUser", { uid, confirmEmail });
}

export function adjustLessonTokens(uid, mode, value, reason) {
  return callFunction("adminAdjustLessonTokens", { uid, mode, value, reason });
}

export function linkStudentToParent(parentId, studentId) {
  return callFunction("adminLinkStudentToParent", { parentId, studentId });
}

export function unlinkStudentFromParent(parentId, studentId) {
  return callFunction("adminUnlinkStudentFromParent", { parentId, studentId });
}
