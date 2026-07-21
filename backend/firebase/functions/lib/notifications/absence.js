"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldAwardAbsenceLessonToken = exports.formatSydneyAttendanceDate = exports.timestampToDate = void 0;
const luxon_1 = require("luxon");
function timestampToDate(value) {
    if (value && typeof value.toDate === "function") {
        return value.toDate();
    }
    if (value instanceof Date) {
        return value;
    }
    if (value &&
        typeof value === "object" &&
        typeof value._seconds === "number") {
        return new Date(value._seconds * 1000);
    }
    return null;
}
exports.timestampToDate = timestampToDate;
function formatSydneyAttendanceDate(attendanceDate, fallbackDay) {
    return attendanceDate
        ? luxon_1.DateTime.fromJSDate(attendanceDate).setZone("Australia/Sydney").toFormat("cccc d LLLL")
        : fallbackDay;
}
exports.formatSydneyAttendanceDate = formatSydneyAttendanceDate;
function shouldAwardAbsenceLessonToken(attendanceDate, now = new Date()) {
    const attendanceSydney = luxon_1.DateTime.fromJSDate(attendanceDate, {
        zone: "Australia/Sydney",
    });
    const cutoff = attendanceSydney.set({
        hour: 10,
        minute: 0,
        second: 0,
        millisecond: 0,
    });
    return luxon_1.DateTime.fromJSDate(now, { zone: "Australia/Sydney" }) < cutoff;
}
exports.shouldAwardAbsenceLessonToken = shouldAwardAbsenceLessonToken;
//# sourceMappingURL=absence.js.map