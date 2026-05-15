import { timestampToIso } from "./firestoreReads";

function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

export function normalizeEnrolment(id, data = {}) {
  const archived = data.archived === true;
  const status = data.status || (archived ? "archived" : "pending");
  return {
    id,
    ...data,
    archived,
    status,
    studentName: fullName(data.studentFirstName, data.studentLastName),
    carerName: fullName(data.carerFirstName, data.carerLastName),
    createdAtIso: timestampToIso(data.createdAt),
    acceptedAtIso: timestampToIso(data.acceptedAt),
    archivedAtIso: timestampToIso(data.archivedAt),
    deletedAtIso: timestampToIso(data.deletedAt),
  };
}

export function normalizeUser(id, data = {}) {
  return {
    id,
    uid: id,
    ...data,
    displayName: fullName(data.firstName, data.lastName) || data.email || id,
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}

export function normalizeStudent(id, data = {}) {
  return {
    id,
    ...data,
    displayName: fullName(data.firstName, data.lastName) || id,
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}

export function normalizeClass(id, data = {}) {
  const enrolledStudents = Array.isArray(data.enrolledStudents) ? data.enrolledStudents : [];
  const tutors = Array.isArray(data.tutors) ? data.tutors : [];
  return {
    id,
    ...data,
    enrolledStudents,
    tutors,
    enrolledCount: enrolledStudents.length,
    tutorCount: tutors.length,
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}

export function normalizeAttendance(id, data = {}) {
  return {
    id,
    ...data,
    dateIso: timestampToIso(data.date),
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}

export function normalizeWaitlistEntry(id, data = {}) {
  return {
    id,
    ...data,
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}

export function normalizeInvoice(id, data = {}, { draft = false } = {}) {
  return {
    id,
    ...data,
    draft,
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
    dueDateIso: timestampToIso(data.dueDate),
    paidAtIso: timestampToIso(data.paidAt),
  };
}

export function normalizeTerm(id, data = {}) {
  return {
    id,
    ...data,
    startDateIso: timestampToIso(data.startDate),
    endDateIso: timestampToIso(data.endDate),
  };
}
