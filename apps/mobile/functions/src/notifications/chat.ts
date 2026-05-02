import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

export const onMessageReceived = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();

    const messageData = event.data?.data();
    if (!messageData) {
      console.error("Message data is undefined");
      return;
    }
    const { senderId, text = "", type } = messageData as {
      senderId: string;
      text?: string;
      type?: string;
    };

    const chatId = event.params.chatId;
    const msgId = event.params.messageId;
    const msgPreview = text || (type === "image" ? "[Image]" : "[Media]");

    const chatSnap = await db.collection("chats").doc(chatId).get();
    if (!chatSnap.exists) {
      console.error(`Chat document with ID ${chatId} does not exist`);
      return;
    }
    const participants: string[] = chatSnap.data()?.participants || [];
    const recipientIds = participants.filter((id) => id !== senderId);
    if (recipientIds.length === 0) {
      console.log("No recipients found for this message");
      return;
    }

    const senderDoc = await db.collection("users").doc(senderId).get();
    const senderData = senderDoc.data() || {};
    const otherUserName = (
      `${(senderData["firstName"] as string ?? "")} ${(senderData["lastName"] as string ?? "")}`
    ).trim() || "Unknown";

    const tokens: string[] = [];
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
    } catch (error) {
      console.error("Error sending notifications:", error);
    }
  }
);
