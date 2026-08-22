"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeWaitlistReason = exports.waitlistDisplayDay = exports.canPerformWaitlistStatusUpdate = exports.shouldNotifyWaitlistReactivated = exports.waitlistStatusCounterDeltas = exports.normalizeWaitlistStatus = exports.countsTowardOpenOffers = exports.countsTowardWaitlist = exports.waitlistEntryId = exports.activeWaitlistStatuses = exports.waitlistStatuses = void 0;
exports.waitlistStatuses = new Set([
    "active",
    "offered",
    "accepted",
    "declined",
    "expired",
    "cancelled",
    "promoted",
]);
exports.activeWaitlistStatuses = new Set(["active", "offered", "accepted"]);
const parentMutableWaitlistStatuses = new Set(["accepted", "declined", "cancelled"]);
function waitlistEntryId(classId, studentId) {
    return `${classId}_${studentId}`;
}
exports.waitlistEntryId = waitlistEntryId;
function countsTowardWaitlist(status) {
    return typeof status === "string" && exports.activeWaitlistStatuses.has(status);
}
exports.countsTowardWaitlist = countsTowardWaitlist;
function countsTowardOpenOffers(status) {
    return status === "offered" || status === "accepted";
}
exports.countsTowardOpenOffers = countsTowardOpenOffers;
function normalizeWaitlistStatus(status) {
    if (typeof status === "string" && exports.waitlistStatuses.has(status))
        return status;
    throw new Error("Invalid waitlist status");
}
exports.normalizeWaitlistStatus = normalizeWaitlistStatus;
function waitlistStatusCounterDeltas(previousStatus, nextStatus) {
    return {
        waitlistCount: countDelta(countsTowardWaitlist(previousStatus), countsTowardWaitlist(nextStatus)),
        openOfferCount: countDelta(countsTowardOpenOffers(previousStatus), countsTowardOpenOffers(nextStatus)),
    };
}
exports.waitlistStatusCounterDeltas = waitlistStatusCounterDeltas;
function shouldNotifyWaitlistReactivated(previousStatus, nextStatus) {
    return previousStatus !== "active" && nextStatus === "active";
}
exports.shouldNotifyWaitlistReactivated = shouldNotifyWaitlistReactivated;
function canPerformWaitlistStatusUpdate(params) {
    const { actorId, actorRole, entryParentId, nextStatus } = params;
    if (actorRole === "admin")
        return true;
    return entryParentId === actorId && parentMutableWaitlistStatuses.has(nextStatus);
}
exports.canPerformWaitlistStatusUpdate = canPerformWaitlistStatusUpdate;
function waitlistDisplayDay(waitlistEntry) {
    const day = waitlistEntry.day;
    if (typeof day === "string" && day.trim() !== "")
        return day;
    const dayOfWeek = waitlistEntry.dayOfWeek;
    if (typeof dayOfWeek === "string" && dayOfWeek.trim() !== "")
        return dayOfWeek;
    return "Unknown day";
}
exports.waitlistDisplayDay = waitlistDisplayDay;
function normalizeWaitlistReason(reason) {
    if (reason === "classFull" || reason === "class_full")
        return "class_full";
    if (reason === "classNotOpen" || reason === "class_not_open")
        return "class_not_open";
    throw new Error("Invalid waitlist reason");
}
exports.normalizeWaitlistReason = normalizeWaitlistReason;
function countDelta(wasCounting, isCounting) {
    if (wasCounting === isCounting)
        return 0;
    return isCounting ? 1 : -1;
}
