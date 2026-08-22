"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permanentSpotOpenedMessage = exports.permanentSpotStudentIdsForNotification = void 0;
function stringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
}
function permanentSpotStudentIdsForNotification(beforeStudents, afterStudents, notificationAction) {
    const before = stringArray(beforeStudents);
    const after = stringArray(afterStudents);
    return before
        .filter(studentId => !after.includes(studentId))
        .filter(studentId => {
        return !((notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "direct_permanent_unenrollment" &&
            notificationAction.studentId === studentId);
    });
}
exports.permanentSpotStudentIdsForNotification = permanentSpotStudentIdsForNotification;
function permanentSpotOpenedMessage(classData, formatTime) {
    const day = typeof classData.day === "string" && classData.day.trim() !== ""
        ? classData.day
        : "a class day";
    const startTime = typeof classData.startTime === "string" && classData.startTime.trim() !== ""
        ? classData.startTime
        : "?";
    const start12 = formatTime(startTime);
    return {
        title: "Permanent Spot Opened!",
        body: `A permanent spot opened for ${day} at ${start12}.`,
    };
}
exports.permanentSpotOpenedMessage = permanentSpotOpenedMessage;
