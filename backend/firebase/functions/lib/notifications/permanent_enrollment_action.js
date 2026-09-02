"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permanentEnrolmentSkippedWeeksMessage = exports.canAcceptParentPermanentEnrollment = exports.classEnrollmentState = exports.permanentSpotsRemaining = exports.canPerformPermanentEnrollmentAction = void 0;
const defaultMinimumStudentsToOpen = 2;
/** "2026-09-03" -> "3 Sep". Falls back to the raw value if it is not a date. */
function shortDate(isoDate) {
    if (typeof isoDate !== "string")
        return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!match)
        return isoDate;
    const [, year, month, day] = match;
    const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const monthName = months[Number(month) - 1];
    if (!monthName)
        return isoDate;
    // Year is deliberately absent: these are always weeks in the current or
    // next term, and the extra four characters push a push notification past
    // where a phone truncates it.
    void year;
    return `${Number(day)} ${monthName}`;
}
/**
 * Tell an admin that a permanent enrolment could not take every week.
 *
 * The student is enrolled — this is not a failure — but one or more sessions
 * were already full of permanent students and one-off visitors, so they are
 * not on those rolls. Someone has to know that, or the family turns up to a
 * week the student was never added to.
 *
 * Returns null when nothing was skipped, so the caller can use it as the test
 * for whether to notify at all.
 */
function permanentEnrolmentSkippedWeeksMessage(params) {
    const { studentName, classDay, classTime, skipped, maxDatesListed = 3 } = params;
    const dates = (Array.isArray(skipped) ? skipped : [])
        .map(entry => shortDate(entry === null || entry === void 0 ? void 0 : entry.date))
        .filter(Boolean);
    if (!dates.length)
        return null;
    const listed = dates.slice(0, maxDatesListed);
    const remaining = dates.length - listed.length;
    let dateText;
    if (remaining > 0) {
        // The tail carries the "and", so the listed dates stay comma-separated
        // rather than reading "17 Sep and 1 more week".
        dateText = `${listed.join(", ")} and ${remaining} more week${remaining === 1 ? "" : "s"}`;
    }
    else if (listed.length === 1) {
        dateText = listed[0];
    }
    else {
        dateText = `${listed.slice(0, -1).join(", ")} and ${listed[listed.length - 1]}`;
    }
    const wasWere = dates.length === 1 ? "was" : "were";
    return {
        title: "Enrolment Skipped Full Weeks",
        body: `${studentName} is permanently enrolled for ${classDay} at ${classTime}, but ${dateText} ${wasWere} already full. Not added to those rolls.`,
    };
}
exports.permanentEnrolmentSkippedWeeksMessage = permanentEnrolmentSkippedWeeksMessage;
function canPerformPermanentEnrollmentAction(actorId, actorData, studentData) {
    if (actorData.role === "admin")
        return true;
    const parentIds = Array.isArray(studentData.parents)
        ? studentData.parents
        : [];
    const primaryParentId = studentData.primaryParentId;
    return parentIds.includes(actorId) || primaryParentId === actorId;
}
exports.canPerformPermanentEnrollmentAction = canPerformPermanentEnrollmentAction;
function permanentSpotsRemaining(classData) {
    const capacity = typeof classData.capacity === "number" ? classData.capacity : 0;
    const enrolledStudents = Array.isArray(classData.enrolledStudents)
        ? classData.enrolledStudents
        : [];
    return Math.max(capacity - enrolledStudents.length, 0);
}
exports.permanentSpotsRemaining = permanentSpotsRemaining;
function classEnrollmentState(classData) {
    const minimumStudentsToOpen = typeof classData.minStudentsToOpen === "number"
        ? classData.minStudentsToOpen
        : defaultMinimumStudentsToOpen;
    const enrolledStudents = Array.isArray(classData.enrolledStudents)
        ? classData.enrolledStudents
        : [];
    const spotsRemaining = permanentSpotsRemaining(classData);
    if (spotsRemaining <= 0)
        return "full";
    if (enrolledStudents.length < minimumStudentsToOpen)
        return "pending";
    return "open";
}
exports.classEnrollmentState = classEnrollmentState;
function canAcceptParentPermanentEnrollment(classData) {
    return classEnrollmentState(classData) === "open";
}
exports.canAcceptParentPermanentEnrollment = canAcceptParentPermanentEnrollment;
