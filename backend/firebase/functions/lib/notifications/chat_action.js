"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidClientMessageId = exports.isChatInactive = exports.shouldSuppressChatMessageNotification = exports.chatSenderDisplayName = exports.truncateChatMessagePreview = exports.chatMessagePreview = exports.chatRecipientIds = exports.canSendChatMessage = void 0;
function canSendChatMessage(actorId, participants) {
    return Array.isArray(participants) &&
        participants.some(participant => participant === actorId);
}
exports.canSendChatMessage = canSendChatMessage;
/**
 * A thread retired because one of its participants was deleted.
 *
 * Checked server-side rather than left to the client: app builds already on
 * parents' phones do not know about `inactive`, so without this guard they
 * could still post into a conversation whose other party no longer exists.
 */
function isChatInactive(chatData) {
    return (chatData === null || chatData === void 0 ? void 0 : chatData.inactive) === true;
}
exports.isChatInactive = isChatInactive;
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
/**
 * Whether `value` is usable as the message document's id.
 *
 * The client picks the id so that the copy it is already showing and the
 * document written here are one message rather than two (MOB-31). That means
 * accepting a caller-supplied document path segment, so the value is checked
 * against Firestore's rules for an id — no `/`, not `.` or `..`, not a
 * `__reserved__` name — before it is used to build a reference. The 128
 * character ceiling is well under Firestore's own limit and comfortably above
 * the UUID the app sends.
 *
 * Callers must treat an absent id as valid and fall back to an auto-id: builds
 * released before MOB-31 do not send one.
 */
function isValidClientMessageId(value) {
    return (typeof value === "string" &&
        value.length > 0 &&
        value.length <= 128 &&
        value.trim() === value &&
        !value.includes("/") &&
        value !== "." &&
        value !== ".." &&
        !/^__.*__$/.test(value));
}
exports.isValidClientMessageId = isValidClientMessageId;
function shouldSuppressChatMessageNotification(notificationAction) {
    return (notificationAction === null || notificationAction === void 0 ? void 0 : notificationAction.type) === "send_chat_message";
}
exports.shouldSuppressChatMessageNotification = shouldSuppressChatMessageNotification;
