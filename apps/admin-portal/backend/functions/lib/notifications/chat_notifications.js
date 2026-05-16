"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onMessageReceived = void 0;
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const firestore_2 = require("firebase-functions/v2/firestore");
exports.onMessageReceived = (0, firestore_2.onDocumentCreated)("chats/{chatId}/messages/{messageId}", async (event) => {
    var _a, _b, _c, _d;
    const db = (0, firestore_1.getFirestore)();
    const messaging = (0, messaging_1.getMessaging)();
    // 1) Get the message data
    const messageData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!messageData) {
        console.error("Message data is undefined");
        return;
    }
    const { senderId, text = "", type } = messageData;
    // 2) Build preview
    const chatId = event.params.chatId;
    const msgId = event.params.messageId;
    const msgPreview = text || (type === "image" ? "[Image]" : "[Media]");
    // 3) Load chat participants
    const chatSnap = await db.collection("chats").doc(chatId).get();
    if (!chatSnap.exists) {
        console.error(`Chat document with ID ${chatId} does not exist`);
        return;
    }
    const participants = ((_b = chatSnap.data()) === null || _b === void 0 ? void 0 : _b.participants) || [];
    const recipientIds = participants.filter((id) => id !== senderId);
    if (recipientIds.length === 0) {
        console.log("No recipients found for this message");
        return;
    }
    // Fetch sender's first and last name for navigation
    const senderDoc = await db.collection("users").doc(senderId).get();
    const senderData = senderDoc.data() || {};
    const otherUserName = (`${((_c = senderData['firstName']) !== null && _c !== void 0 ? _c : '')} ${((_d = senderData['lastName']) !== null && _d !== void 0 ? _d : '')}`).trim() || "Unknown";
    // 4) Load user tokens
    const tokens = [];
    for (const recipientId of recipientIds) {
        const tokenSnap = await db
            .collection("userTokens")
            .doc(recipientId)
            .collection("tokens")
            .get();
        tokenSnap.forEach((tokenDoc) => {
            const token = tokenDoc.data().token;
            if (token) {
                tokens.push(token);
            }
        });
    }
    if (tokens.length === 0) {
        console.log("No tokens found for recipients");
        return;
    }
    // 5) Send notification
    const payload = {
        notification: {
            title: otherUserName,
            body: msgPreview.length > 100 ? msgPreview.substring(0, 97) + "..." : msgPreview,
        },
        data: {
            type: "chat_message",
            chatId: String(chatId),
            messageId: String(msgId),
            otherUserName: String(otherUserName),
        },
        tokens: tokens,
    };
    try {
        const response = await messaging.sendEachForMulticast(payload);
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
});
//# sourceMappingURL=chat_notifications.js.map