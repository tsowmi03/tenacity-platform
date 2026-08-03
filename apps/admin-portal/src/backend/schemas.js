import { timestampToIso } from "./firestoreReads";

function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

export function normalizeYear11Interest(id, data = {}) {
  const archived = data.archived === true;
  const mathsCourses = Array.isArray(data.mathsCourses) ? data.mathsCourses : [];
  const englishCourses = Array.isArray(data.englishCourses)
    ? data.englishCourses
    : [];

  return {
    id,
    ...data,
    archived,
    // Rows submitted before triage existed have no stored status.
    status: archived ? "archived" : data.status || "new",
    mathsCourses,
    englishCourses,
    courses: [...mathsCourses, ...englishCourses],
    preferredDays: Array.isArray(data.preferredDays) ? data.preferredDays : [],
    studentName: fullName(data.studentFirstName, data.studentLastName),
    parentName: fullName(data.parentFirstName, data.parentLastName),
    school: String(data.school || "").trim(),
    createdAtIso: timestampToIso(data.createdAt),
    statusUpdatedAtIso: timestampToIso(data.statusUpdatedAt),
  };
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
    readAnnouncements: Array.isArray(data.readAnnouncements)
      ? data.readAnnouncements.filter((announcementId) => typeof announcementId === "string")
      : [],
    displayName: fullName(data.firstName, data.lastName) || data.email || id,
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}

export function normalizeAnnouncement(id, data = {}) {
  return {
    id,
    ...data,
    title: String(data.title || "").trim(),
    body: String(data.body || ""),
    audience: ["all", "parent", "tutor", "admin"].includes(data.audience)
      ? data.audience
      : "all",
    archived: data.archived === true,
    createdAtIso: timestampToIso(data.createdAt),
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
    weekNumber: data.weekNumber ?? data.weekNum ?? null,
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
  const termNum = data.termNum ?? data.termNumber ?? null;
  const weeksNum = data.weeksNum ?? data.totalWeeks ?? null;
  const status =
    typeof data.status === "string"
      ? data.status
      : data.isActive === true || data.status === true
        ? "active"
        : "upcoming";
  return {
    id,
    ...data,
    termNum,
    weeksNum,
    status,
    startDateIso: timestampToIso(data.startDate),
    endDateIso: timestampToIso(data.endDate),
  };
}
