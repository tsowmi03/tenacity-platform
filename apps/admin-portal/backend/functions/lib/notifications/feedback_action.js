"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackNotificationBody = exports.shouldSuppressFeedbackCreatedNotification = exports.canCreateFeedback = void 0;
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
//# sourceMappingURL=feedback_action.js.map