"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldSuppressChatMessageNotification = exports.chatSenderDisplayName = exports.truncateChatMessagePreview = exports.chatMessagePreview = exports.chatRecipientIds = exports.canSendChatMessage = void 0;
function canSendChatMessage(actorId, participants) {
    return Array.isArray(participants) &&
        participants.some(participant => participant === actorId);
}
exports.canSendChatMessage = canSendChatMessage;
function chatRecipientIds(participants, senderId) {
    return Array.isArray(participants)
        ? participants.filter((participant) => (typeof participant === "string" && participant !== senderId))
        : [];
}
exports.chatRecipientIds = chatRecipientIds;
function chatMessagePreview(params) {
    const { text, type } = params;
    if (typeof text === "string" && text !== "")
        return text;
    return type === "image" ? "[Image]" : "[Media]";
}
exports.chatMessagePreview = chatMessagePreview;
function truncateChatMessagePreview(preview) {
    return preview.length > 100 ? `${preview.substring(0, 97)}...` : preview;
}
exports.truncateChatMessagePreview = truncateChatMessagePreview;
function chatSenderDisplayName(senderData) {
    var _a, _b;
    return `${(_a = senderData.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = senderData.lastName) !== null && _b !== void 0 ? _b : ""}`.trim() || "Unknown";
}
exports.chatSenderDisplayName = chatSenderDisplayName;
function shouldSuppressChatMessageNotification(notificationAction) {
    return (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "send_chat_message";
}
exports.shouldSuppressChatMessageNotification = shouldSuppressChatMessageNotification;
//# sourceMappingURL=chat_action.js.map