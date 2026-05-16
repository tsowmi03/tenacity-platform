"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentAbsentNotificationBody = exports.studentAddedNotificationBody = exports.attendanceRemovedStudentIdsForNotification = exports.attendanceAddedStudentIdsForNotification = void 0;
const addedNotificationActions = new Set([
    "one_off_enrollment",
    "reschedule_to",
]);
const removedNotificationActions = new Set([
    "notify_absence",
    "cancel_student_for_week",
    "reschedule_from",
]);
function stringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
}
function attendanceAddedStudentIdsForNotification(beforeAttendance, afterAttendance, notificationAction) {
    const before = stringArray(beforeAttendance);
    const after = stringArray(afterAttendance);
    return after
        .filter(studentId => !before.includes(studentId))
        .filter(studentId => {
        return !(typeof (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "string" &&
            addedNotificationActions.has(notificationAction.type) &&
            notificationAction.studentId === studentId);
    });
}
exports.attendanceAddedStudentIdsForNotification = attendanceAddedStudentIdsForNotification;
function attendanceRemovedStudentIdsForNotification(beforeAttendance, afterAttendance, notificationAction) {
    const before = stringArray(beforeAttendance);
    const after = stringArray(afterAttendance);
    return before
        .filter(studentId => !after.includes(studentId))
        .filter(studentId => {
        return !(typeof (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "string" &&
            removedNotificationActions.has(notificationAction.type) &&
            notificationAction.studentId === studentId);
    });
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