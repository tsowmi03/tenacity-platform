"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentAbsentNotificationBody = exports.studentAddedNotificationBody = exports.attendanceRemovedStudentIdsForNotification = exports.attendanceAddedStudentIdsForNotification = void 0;
const addedNotificationActions = new Set([
    "one_off_enrollment",
    "reschedule_to",
    "bulk_attendance_sync",
]);
const removedNotificationActions = new Set([
    "notify_absence",
    "cancel_student_for_week",
    "reschedule_from",
    "bulk_attendance_sync",
]);
function stringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
}
// "bulk_attendance_sync" guards the multi-document loops that fan a single
// human action (a class swap, a waitlist promotion, an enrolment acceptance,
// a student deletion, an admin-portal roster edit) out across every future
// attendance doc for a class. Those callers either name the one student they
// moved (studentId), list several (studentIds, for a write that touches more
// than one student at once), or - for a full roster overwrite where the
// "before" membership per student isn't tracked - suppress the whole
// document's diff (suppressAll).
function isGuardedForStudent(notificationAction, guardedActions, studentId) {
    if (!notificationAction || typeof notificationAction.type !== "string") {
        return false;
    }
    if (!guardedActions.has(notificationAction.type)) {
        return false;
    }
    if (notificationAction.suppressAll === true) {
        return true;
    }
    if (Array.isArray(notificationAction.studentIds)) {
        return notificationAction.studentIds.includes(studentId);
    }
    return notificationAction.studentId === studentId;
}
function attendanceAddedStudentIdsForNotification(beforeAttendance, afterAttendance, notificationAction) {
    const before = stringArray(beforeAttendance);
    const after = stringArray(afterAttendance);
    return after
        .filter(studentId => !before.includes(studentId))
        .filter(studentId => !isGuardedForStudent(notificationAction, addedNotificationActions, studentId));
}
exports.attendanceAddedStudentIdsForNotification = attendanceAddedStudentIdsForNotification;
function attendanceRemovedStudentIdsForNotification(beforeAttendance, afterAttendance, notificationAction) {
    const before = stringArray(beforeAttendance);
    const after = stringArray(afterAttendance);
    return before
        .filter(studentId => !after.includes(studentId))
        .filter(studentId => !isGuardedForStudent(notificationAction, removedNotificationActions, studentId));
}
exports.attendanceRemovedStudentIdsForNotification = attendanceRemovedStudentIdsForNotification;
function studentAddedNotificationBody(params) {
    const { studentName, classDay, classTime, attendanceDateText } = params;
    return `${studentName} has been added to ${classDay} at ${classTime} on ${attendanceDateText}.`;
}
exports.studentAddedNotificationBody = studentAddedNotificationBody;
function studentAbsentNotificationBody(params) {
    const { studentName, classDay, classTime, attendanceDateText } = params;
    return `${studentName} will be absent from ${classDay} at ${classTime} on ${attendanceDateText}.`;
}
exports.studentAbsentNotificationBody = studentAbsentNotificationBody;
//# sourceMappingURL=attendance_action.js.map