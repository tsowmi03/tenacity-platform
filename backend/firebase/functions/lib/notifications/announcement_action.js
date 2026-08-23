"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.announcementNotificationBody = exports.shouldSendAnnouncementCreatedNotification = exports.shouldSuppressAnnouncementCreatedNotification = exports.canCreateAnnouncement = exports.normalizeAnnouncementAudience = void 0;
const announcementAudiences = new Set(["all", "admin", "tutor", "parent"]);
function normalizeAnnouncementAudience(audience) {
    if (typeof audience !== "string") {
        throw new Error("Invalid announcement audience");
    }
    const normalized = audience.trim().toLowerCase();
    if (announcementAudiences.has(normalized))
        return normalized;
    throw new Error("Invalid announcement audience");
}
exports.normalizeAnnouncementAudience = normalizeAnnouncementAudience;
function canCreateAnnouncement(actorData) {
    return actorData.role === "admin";
}
exports.canCreateAnnouncement = canCreateAnnouncement;
function shouldSuppressAnnouncementCreatedNotification(notificationAction) {
    return (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "create_announcement";
}
exports.shouldSuppressAnnouncementCreatedNotification = shouldSuppressAnnouncementCreatedNotification;
function shouldSendAnnouncementCreatedNotification(announcement) {
    return (announcement === null || announcement === void 0 ? void 0 : announcement.archived) !== true;
}
exports.shouldSendAnnouncementCreatedNotification = shouldSendAnnouncementCreatedNotification;
function announcementNotificationBody(title) {
    return typeof title === "string" && title !== ""
        ? title
        : "A new announcement has been posted";
}
exports.announcementNotificationBody = announcementNotificationBody;
