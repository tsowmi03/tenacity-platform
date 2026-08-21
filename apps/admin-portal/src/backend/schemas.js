import { timestampToIso } from "./firestoreReads";
import {
  DEFAULT_CTA,
  DEFAULT_MASTHEAD_EYEBROW,
  blocksForEditing,
  blocksFromLegacy,
} from "./weeklyUpdateBlocks";

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

const WEEKLY_UPDATE_STATUSES = ["draft", "sending", "sent", "failed"];

function optionalCount(value) {
  return Number.isFinite(value) ? value : null;
}

export function normalizeWeeklyUpdate(id, data = {}) {
  const announcementIds = Array.isArray(data.announcementIds)
    ? data.announcementIds.filter((value) => typeof value === "string")
    : [];
  const sections = Array.isArray(data.sections)
    ? data.sections.map((section) => ({
        title: String(section?.title || ""),
        body: String(section?.body || ""),
      }))
    : [];
  const storedBlocks = Array.isArray(data.blocks) ? data.blocks : [];

  return {
    id,
    ...data,
    subject: String(data.subject || "").trim(),
    preheader: String(data.preheader || ""),
    masthead: {
      eyebrow:
        data.masthead?.eyebrow === undefined
          ? DEFAULT_MASTHEAD_EYEBROW
          : String(data.masthead.eyebrow),
      // Empty means "use the subject", which is what the renderer falls back to.
      title: String(data.masthead?.title ?? ""),
    },
    // Seeded from the defaults so the copy the renderer would apply is visible
    // in the composer rather than implied by an empty field.
    cta: { ...DEFAULT_CTA, ...(data.cta ?? {}) },
    // A draft saved before the block model existed is converted on read. Nothing
    // is written back until the admin saves, so opening an old update to look at
    // it does not silently rewrite it.
    blocks: blocksForEditing(
      storedBlocks.length
        ? storedBlocks
        : blocksFromLegacy({ intro: data.intro, announcementIds, sections })
    ),
    intro: String(data.intro || ""),
    announcementIds,
    sections,
    status: WEEKLY_UPDATE_STATUSES.includes(data.status) ? data.status : "draft",
    recipientCount: optionalCount(data.recipientCount),
    successCount: optionalCount(data.successCount),
    failureCount: optionalCount(data.failureCount),
    optedOutCount: optionalCount(data.optedOutCount),
    createdAtIso: timestampToIso(data.createdAt),
    updatedAtIso: timestampToIso(data.updatedAt),
    sentAtIso: timestampToIso(data.sentAt),
    lastTestSentAtIso: timestampToIso(data.lastTestSentAt),
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

/**
 * A parent feedback survey response.
 *
 * The website writes these through the admin SDK after validating them, so the
 * shape is trustworthy. The defaults here only cover responses written by an
 * older survey version, where a section may be missing entirely.
 */
export function normalizeParentSurveyResponse(id, data = {}) {
  const context = data.context || {};
  const app = data.app || {};
  const comments = data.comments || {};
  const followUp = data.followUp || {};

  return {
    id,
    ...data,
    surveyVersion: Number(data.surveyVersion) || 1,
    archived: data.archived === true,
    context: {
      studentYear: String(context.studentYear || ""),
      subjects: Array.isArray(context.subjects) ? context.subjects : [],
    },
    overallSatisfaction: Number.isFinite(data.overallSatisfaction)
      ? data.overallSatisfaction
      : null,
    lessons: data.lessons || {},
    communication: data.communication || {},
    app: {
      usage: String(app.usage || ""),
      usefulness: Number.isFinite(app.usefulness) ? app.usefulness : null,
      barrier: String(app.barrier || ""),
      otherBarrier: String(app.otherBarrier || ""),
      improvement: String(app.improvement || ""),
    },
    recommendation: Number.isFinite(data.recommendation) ? data.recommendation : null,
    comments: {
      strengths: String(comments.strengths || ""),
      change: String(comments.change || ""),
    },
    followUp: {
      requested: followUp.requested === true,
      name: String(followUp.name || ""),
      email: String(followUp.email || ""),
    },
    createdAtIso: timestampToIso(data.createdAt),
  };
}
