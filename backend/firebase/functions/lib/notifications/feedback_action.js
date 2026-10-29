"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackResponseNotificationBody = exports.responsesToNotify = exports.feedbackNotificationBody = exports.shouldSuppressFeedbackCreatedNotification = exports.canCreateFeedback = void 0;
function canCreateFeedback(actorData) {
    return actorData.role === "admin" || actorData.role === "tutor";
}
exports.canCreateFeedback = canCreateFeedback;
function shouldSuppressFeedbackCreatedNotification(notificationAction) {
    return (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "create_feedback";
}
exports.shouldSuppressFeedbackCreatedNotification = shouldSuppressFeedbackCreatedNotification;
function feedbackNotificationBody(subject) {
    if (typeof subject !== "string" || subject.length === 0) {
        return "You have new feedback for your child.";
    }
    return subject.length > 80 ? `${subject.slice(0, 77)}...` : subject;
}
exports.feedbackNotificationBody = feedbackNotificationBody;
// MOB-52: a parent's one-off response to a note. A question or comment
// notifies the tutor who wrote the note; a thanks is shown on the note only.
const NOTIFYING_RESPONSE_TYPES = ["question", "comment"];
/**
 * The responses added by this update that should notify the tutor, as
 * `[{ parentId, type, text, parentName }]`. Responses are write-once, so an
 * entry present before the update has already been handled.
 */
function responsesToNotify(before, after) {
    const previous = (before === null || before === void 0 ? void 0 : before.parentResponses) || {};
    const current = (after === null || after === void 0 ? void 0 : after.parentResponses) || {};
    if (typeof current !== "object")
        return [];
    return Object.entries(current)
        .filter(([parentId, response]) => !(parentId in previous)
        && response
        && NOTIFYING_RESPONSE_TYPES.includes(response.type))
        .map(([parentId, response]) => ({
        parentId,
        type: response.type,
        text: typeof response.text === "string" ? response.text.trim() : "",
        parentName: typeof response.parentName === "string" && response.parentName.trim() !== ""
            ? response.parentName.trim()
            : "A parent",
    }));
}
exports.responsesToNotify = responsesToNotify;
function feedbackResponseNotificationBody(text) {
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
exports.feedbackResponseNotificationBody = feedbackResponseNotificationBody;
