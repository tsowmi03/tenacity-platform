import { callFunction } from "./callable";
import { listDocuments, orderBy } from "./firestoreReads";
import { normalizeAttendance } from "./schemas";

export function listAttendance(classId) {
  return listDocuments(`classes/${classId}/attendance`, {
    constraints: [orderBy("weekNum", "asc")],
    normalize: normalizeAttendance,
  });
}

export function generateAttendanceForClass(payload) {
  return callFunction("adminGenerateAttendanceForClass", payload);
}

export function regenerateAttendanceForTerm(payload) {
  return callFunction("adminRegenerateAttendanceForTerm", payload);
}
