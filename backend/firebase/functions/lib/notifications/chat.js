"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onMessageReceived = exports.sendChatMessage = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const chat_action_1 = require("./chat_action");
function requiredString(data, key) {
    const value = data[key];
    if (typeof value !== "string" || value.trim() === "") {
        throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
    }
    return value.trim();
}
function optionalString(data, key) {
    const value = data[key];
    if (value == null)
        return undefined;
    if (typeof value === "string")
        return value;
    throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
}
function optionalNumber(data, key) {
    const value = data[key];
    if (value == null)
        return undefined;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    throw new https_1.HttpsError("invalid-argument", `Missing or invalid ${key}`);
}
async function chatNotificationTokens(recipientIds) {
    const db = (0, firestore_2.getFirestore)();
    const tokens = [];
    for (const recipientId of recipientIds) {
        const tokenSnap = await db
            .collection("userTokens")
            .doc(recipientId)
            .collection("tokens")
            .get();
        tokenSnap.forEach((tokenDoc) => {
            const token = tokenDoc.data().token;
            if (typeof token === "string" && token) {
                tokens.push(token);
            }
        });
    }
    return tokens;
}
async function sendChatMessageNotification(params) {
    const { chatId, messageId, senderId, messageData, participants } = params;
    const recipientIds = (0, chat_action_1.chatRecipientIds)(participants, senderId);
    if (!recipientIds.length) {
        console.log("No recipients found for this message");
        return;
    }
    const db = (0, firestore_2.getFirestore)();
    const senderDoc = await db.collection("users").doc(senderId).get();
    const otherUserName = (0, chat_action_1.chatSenderDisplayName)(senderDoc.data() || {});
    const tokens = await chatNotificationTokens(recipientIds);
    if (!tokens.length) {
        console.log("No tokens found for recipients");
        return;
    }
    const msgPreview = (0, chat_action_1.chatMessagePreview)({
        text: messageData.text,
        type: messageData.type,
    });
    const payload = {
        notification: {
            title: otherUserName,
            body: (0, chat_action_1.truncateChatMessagePreview)(msgPreview),
        },
        data: {
            type: "chat_message",
            chatId: String(chatId),
            messageId: String(messageId),
            otherUserName: String(otherUserName),
        },
        tokens,
    };
    try {
        const response = await (0, messaging_1.getMessaging)().sendEachForMulticast(payload);
        console.log(`Successfully sent messages: ${response.successCount}`);
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                console.log("Failed to send to token:", tokens[idx]);
                console.log("Error:", resp.error);
            }
        });
    }
    catch (error) {
        console.error("Error sending notifications:", error);
    }
}
// 512MiB, not the 256MiB default. Requiring `lib/index.js` pulls in every
// function's dependencies, which costs roughly 200MiB before this handler runs
// — so the default leaves ~56MiB of working room and sending a message to a
// recipient with many FCM tokens tips it over. Cloud Run kills the instance,
// and the client sees `[firebase_functions/internal] INTERNAL` with no clue
// why. Reported by a parent on 13 Aug 2026.
exports.sendChatMessage = (0, https_1.onCall)({ memory: "512MiB" }, async (request) => {
    var _a, _b, _c;
    const requesterId = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!requesterId) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to send a message.");
    }
    if (!request.data || typeof request.data !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Request data must be an object.");
    }
    const requestData = request.data;
    const chatId = requiredString(requestData, "chatId");
    const text = (_b = optionalString(requestData, "text")) !== null && _b !== void 0 ? _b : "";
    const mediaUrl = optionalString(requestData, "mediaUrl");
    const thumbnailUrl = optionalString(requestData, "thumbnailUrl");
    const messageType = (_c = optionalString(requestData, "messageType")) !== null && _c !== void 0 ? _c : "text";
    const fileName = optionalString(requestData, "fileName");
    const fileSize = optionalNumber(requestData, "fileSize");
    const db = (0, firestore_2.getFirestore)();
    const chatRef = db.collection("chats").doc(chatId);
    const messageRef = chatRef.collection("messages").doc();
    const result = await db.runTransaction(async (transaction) => {
        const chatSnap = await transaction.get(chatRef);
        if (!chatSnap.exists) {
            throw new https_1.HttpsError("not-found", "Chat not found.");
        }
        const chatData = chatSnap.data() || {};
        const participants = chatData.participants;
        if (!(0, chat_action_1.canSendChatMessage)(requesterId, participants)) {
            throw new https_1.HttpsError("permission-denied", "You cannot send messages to this chat.");
        }
        const messageData = {
            senderId: requesterId,
            text,
            type: messageType,
            timestamp: firestore_2.FieldValue.serverTimestamp(),
            readBy: {},
            isPending: false,
            notificationAction: {
                type: "send_chat_message",
                actorId: requesterId,
            },
        };
        if (mediaUrl != null)
            messageData.mediaUrl = mediaUrl;
        if (thumbnailUrl != null)
            messageData.thumbnailUrl = thumbnailUrl;
        if (fileName != null)
            messageData.fileName = fileName;
        if (fileSize != null)
            messageData.fileSize = fileSize;
        const chatUpdate = {
            lastMessage: text === "" ? "[Attachment]" : text,
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
            [`deletedFor.${requesterId}`]: firestore_2.FieldValue.delete(),
        };
        for (const recipientId of (0, chat_action_1.chatRecipientIds)(participants, "")) {
            chatUpdate[`unreadCounts.${recipientId}`] = recipientId === requesterId
                ? 0
                : firestore_2.FieldValue.increment(1);
        }
        transaction.set(messageRef, messageData);
        transaction.update(chatRef, chatUpdate);
        return {
            participants,
            messageData,
        };
    });
    try {
        await sendChatMessageNotification({
            chatId,
            messageId: messageRef.id,
            senderId: requesterId,
            messageData: result.messageData,
            participants: result.participants,
        });
    }
    finally {
        try {
            await messageRef.update({
                notificationAction: firestore_2.FieldValue.delete(),
            });
        }
        catch (error) {
            console.error("Error clearing chat notification action:", error);
        }
    }
    return {
        messageId: messageRef.id,
    };
});
// Same 512MiB reason as sendChatMessage — this trigger does the same
// multicast work, and was also being OOM-killed.
exports.onMessageReceived = (0, firestore_1.onDocumentCreated)({
    document: "chats/{chatId}/messages/{messageId}",
    memory: "512MiB",
}, async (event) => {
    var _a, _b;
    const messageData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!messageData) {
        console.error("Message data is undefined");
        return;
    }
    if ((0, chat_action_1.shouldSuppressChatMessageNotification)(messageData.notificationAction))
        return;
    const chatId = event.params.chatId;
    const msgId = event.params.messageId;
    const senderId = messageData.senderId;
    if (typeof senderId !== "string" || senderId === "") {
        console.error("Message data is missing senderId");
        return;
    }
    const db = (0, firestore_2.getFirestore)();
    const chatSnap = await db.collection("chats").doc(chatId).get();
    if (!chatSnap.exists) {
        console.error(`Chat document with ID ${chatId} does not exist`);
        return;
    }
    await sendChatMessageNotification({
        chatId,
        messageId: msgId,
        senderId,
        messageData,
        participants: (_b = chatSnap.data()) === null || _b === void 0 ? void 0 : _b.participants,
    });
});
//# sourceMappingURL=chat.js.map