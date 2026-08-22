"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldProcessReminderAttendance = exports.classDayNameForDate = exports.attendanceDateMatchesClassDay = exports.classSessionDateForWeek = exports.SYDNEY_TZ = void 0;
const luxon_1 = require("luxon");
exports.SYDNEY_TZ = "Australia/Sydney";
const WEEKDAY_BY_CLASS_DAY = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
};
function weekdayForClassDay(classDay) {
    var _a;
    if (!classDay) {
        return 1;
    }
    return (_a = WEEKDAY_BY_CLASS_DAY[classDay.trim().toLowerCase()]) !== null && _a !== void 0 ? _a : 1;
}
function parseStartTime(startTime) {
    if (!startTime || !startTime.includes(":")) {
        return { hour: 0, minute: 0 };
    }
    const [hour, minute] = startTime.split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return { hour: 0, minute: 0 };
    }
    return { hour, minute };
}
function classSessionDateForWeek(params) {
    const termStartSydney = luxon_1.DateTime
        .fromJSDate(params.termStart, { zone: exports.SYDNEY_TZ })
        .startOf("day");
    const firstTermWeekStartSydney = termStartSydney.minus({
        days: termStartSydney.weekday - 1,
    });
    const classWeekday = weekdayForClassDay(params.classDay);
    const weekOffset = Math.max(params.weekNumber, 1) - 1;
    const { hour, minute } = parseStartTime(params.startTime);
    return firstTermWeekStartSydney
        .plus({ days: weekOffset * 7 + classWeekday - 1 })
        .set({ hour, minute, second: 0, millisecond: 0 })
        .toJSDate();
}
exports.classSessionDateForWeek = classSessionDateForWeek;
function attendanceDateMatchesClassDay(attendanceDate, classDay, timeZone = exports.SYDNEY_TZ) {
    return luxon_1.DateTime.fromJSDate(attendanceDate, { zone: timeZone }).weekday ===
        weekdayForClassDay(classDay);
}
exports.attendanceDateMatchesClassDay = attendanceDateMatchesClassDay;
function classDayNameForDate(date, timeZone = exports.SYDNEY_TZ) {
    return luxon_1.DateTime.fromJSDate(date, { zone: timeZone }).toFormat("cccc");
}
exports.classDayNameForDate = classDayNameForDate;
function shouldProcessReminderAttendance(params) {
    if (params.cancelled === true) {
        return false;
    }
    if (!params.classDay) {
        return true;
    }
    return attendanceDateMatchesClassDay(params.attendanceDate, params.classDay, params.timeZone);
}
exports.shouldProcessReminderAttendance = shouldProcessReminderAttendance;
