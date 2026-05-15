import { callFunction } from "./callable";
import { getDocument, listDocuments, orderBy } from "./firestoreReads";
import { normalizeClass } from "./schemas";

export function listClasses() {
  return listDocuments("classes", {
    constraints: [orderBy("day", "asc"), orderBy("startTime", "asc")],
    normalize: normalizeClass,
  });
}

export function getClass(id) {
  return getDocument("classes", id, { normalize: normalizeClass });
}

export function createClass(payload) {
  return callFunction("adminCreateClass", payload);
}

export function updateClass(classId, updates, propagationOptions = {}) {
  return callFunction("adminUpdateClass", { classId, ...updates, ...propagationOptions });
}

export function deleteClass(classId, confirmClassId, deleteAttendance) {
  return callFunction("adminDeleteClass", { classId, confirmClassId, deleteAttendance });
}
