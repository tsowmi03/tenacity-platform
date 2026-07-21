import { callFunction } from "./callable";
import { getDocument, listDocuments, orderBy } from "./firestoreReads";
import { normalizeStudent } from "./schemas";

export function listStudents() {
  return listDocuments("students", {
    constraints: [orderBy("lastName", "asc")],
    normalize: normalizeStudent,
  });
}

export function getStudent(id) {
  return getDocument("students", id, { normalize: normalizeStudent });
}

export function createStudent(payload) {
  return callFunction("adminCreateStudent", payload);
}

export function updateStudent(studentId, updates) {
  return callFunction("adminUpdateStudent", { studentId, ...updates });
}

export function deleteStudent(studentId, confirmFullName) {
  return callFunction("adminDeleteStudent", { studentId, confirmFullName });
}

export function linkStudentToParent(parentId, studentId) {
  return callFunction("adminLinkStudentToParent", { parentId, studentId });
}

export function unlinkStudentFromParent(parentId, studentId) {
  return callFunction("adminUnlinkStudentFromParent", { parentId, studentId });
}
