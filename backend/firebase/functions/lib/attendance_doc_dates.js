"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAttendanceDateBackfillPlan = exports.attendanceWeekNumberForDoc = exports.attendanceTermIdForDoc = void 0;
const class_schedule_dates_1 = require("./class_schedule_dates");
const VALID_CLASS_DAYS = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]);
function optionalString(value) {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}
function positiveInteger(value) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        const parsed = Number(value.trim());
        return parsed > 0 ? parsed : undefined;
    }
    return undefined;
}
function isValidClassDay(value) {
    return VALID_CLASS_DAYS.has(value.trim().toLowerCase());
}
function isValidStartTime(value) {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match)
        return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}
function attendanceTermIdForDoc(attendanceDocId, data) {
    var _a;
    const termId = optionalString(data.termId);
    if (termId)
        return termId;
    const rawId = (_a = optionalString(data.id)) !== null && _a !== void 0 ? _a : attendanceDocId;
    const match = rawId.match(/^([A-Za-z0-9]+_T\d+)/);
    return match ? match[1] : null;
}
exports.attendanceTermIdForDoc = attendanceTermIdForDoc;
function attendanceWeekNumberForDoc(attendanceDocId, data) {
    var _a, _b;
    const explicitWeek = (_a = positiveInteger(data.weekNum)) !== null && _a !== void 0 ? _a : positiveInteger(data.weekNumber);
    if (explicitWeek)
        return explicitWeek;
    const rawId = (_b = optionalString(data.id)) !== null && _b !== void 0 ? _b : attendanceDocId;
    const match = rawId.match(/_W(\d+)$/);
    if (!match)
        return null;
    const parsed = Number(match[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
exports.attendanceWeekNumberForDoc = attendanceWeekNumberForDoc;
function buildAttendanceDateBackfillPlan(params) {
    var _a;
    const toleranceMs = (_a = params.toleranceMs) !== null && _a !== void 0 ? _a : 1000;
    if (!params.existingDate) {
        return { action: "skip", reason: "missing-date" };
    }
    if (!params.weekNumber) {
        return { action: "skip", reason: "missing-week" };
    }
    if (typeof params.classDay !== "string" || !params.classDay.trim()) {
        return { action: "skip", reason: "missing-class-day" };
    }
    if (!isValidClassDay(params.classDay)) {
        return { action: "skip", reason: "invalid-class-day" };
    }
    if (typeof params.startTime !== "string" || !params.startTime.trim()) {
        return { action: "skip", reason: "missing-start-time" };
    }
    if (!isValidStartTime(params.startTime)) {
        return { action: "skip", reason: "invalid-start-time" };
    }
    const correctedDate = (0, class_schedule_dates_1.classSessionDateForWeek)({
        termStart: params.termStart,
        classDay: params.classDay,
        startTime: params.startTime,
        weekNumber: params.weekNumber,
    });
    if (params.existingDate < params.fromDate &&
        correctedDate < params.fromDate) {
        return { action: "skip", reason: "past" };
    }
    const deltaMs = correctedDate.getTime() - params.existingDate.getTime();
    if (Math.abs(deltaMs) <= toleranceMs) {
        return { action: "skip", reason: "already-correct" };
    }
    return {
        action: "update",
        existingDate: params.existingDate,
        correctedDate,
        deltaMs,
    };
}
exports.buildAttendanceDateBackfillPlan = buildAttendanceDateBackfillPlan;
