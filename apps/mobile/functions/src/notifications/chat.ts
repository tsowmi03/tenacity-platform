import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import {
  canSendChatMessage,
  chatMessagePreview,
  chatRecipientIds,
  chatSenderDisplayName,
  shouldSuppressChatMessageNotification,
  truncateChatMessagePreview,
} from "./chat_action";

type ChatMessageDocument = Record<string, unknown>;

function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value.trim();
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
}

function optionalNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
}

async function chatNotificationTokens(recipientIds: string[]): Promise<string[]> {
  const db = getFirestore();
  const tokens: string[] = [];
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

async function sendChatMessageNotification(params: {
  chatId: string;
  messageId: string;
  senderId: string;
  messageData: ChatMessageDocument;
  participants: unknown;
}): Promise<void> {
  const { chatId, messageId, senderId, messageData, participants } = params;
  const recipientIds = chatRecipientIds(participants, senderId);
  if (!recipientIds.length) {
    console.log("No recipients found for this message");
    return;
  }

  const db = getFirestore();
  const senderDoc = await db.collection("users").doc(senderId).get();
  const otherUserName = chatSenderDisplayName(senderDoc.data() || {});
  const tokens = await chatNotificationTokens(recipientIds);
  if (!tokens.length) {
    console.log("No tokens found for recipients");
    return;
  }

  const msgPreview = chatMessagePreview({
    text: messageData.text,
    type: messageData.type,
  });
  const payload: MulticastMessage = {
    notification: {
      title: otherUserName,
      body: truncateChatMessagePreview(msgPreview),
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
    const response = await getMessaging().sendEachForMulticast(payload);
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

export const sendChatMessage = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to send a message.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const chatId = requiredString(requestData, "chatId");
  const text = optionalString(requestData, "text") ?? "";
  const mediaUrl = optionalString(requestData, "mediaUrl");
  const thumbnailUrl = optionalString(requestData, "thumbnailUrl");
  const messageType = optionalString(requestData, "messageType") ?? "text";
  const fileName = optionalString(requestData, "fileName");
  const fileSize = optionalNumber(requestData, "fileSize");

  const db = getFirestore();
  const chatRef = db.collection("chats").doc(chatId);
  const messageRef = chatRef.collection("messages").doc();

  const result = await db.runTransaction<{
    participants: unknown;
    messageData: ChatMessageDocument;
  }>(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists) {
      throw new HttpsError("not-found", "Chat not found.");
    }

    const chatData = chatSnap.data() || {};
    const participants = chatData.participants;
    if (!canSendChatMessage(requesterId, participants)) {
      throw new HttpsError("permission-denied", "You cannot send messages to this chat.");
    }

    const messageData: ChatMessageDocument = {
      senderId: requesterId,
      text,
      type: messageType,
      timestamp: FieldValue.serverTimestamp(),
      readBy: {},
      isPending: false,
      notificationAction: {
        type: "send_chat_message",
        actorId: requesterId,
      },
    };
    if (mediaUrl != null) messageData.mediaUrl = mediaUrl;
    if (thumbnailUrl != null) messageData.thumbnailUrl = thumbnailUrl;
    if (fileName != null) messageData.fileName = fileName;
    if (fileSize != null) messageData.fileSize = fileSize;

    const chatUpdate: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      lastMessage: text === "" ? "[Attachment]" : text,
      updatedAt: FieldValue.serverTimestamp(),
      [`deletedFor.${requesterId}`]: FieldValue.delete(),
    };
    for (const recipientId of chatRecipientIds(participants, "")) {
      chatUpdate[`unreadCounts.${recipientId}`] = recipientId === requesterId
        ? 0
        : FieldValue.increment(1);
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
  } finally {
    try {
      await messageRef.update({
        notificationAction: FieldValue.delete(),
      });
    } catch (error) {
      console.error("Error clearing chat notification action:", error);
    }
  }

  return {
    messageId: messageRef.id,
  };
});

export const onMessageReceived = onDocumentCreated(
  "chats/{chatId}/messages/{messageId}",
  async (event) => {
    const messageData = event.data?.data();
    if (!messageData) {
      console.error("Message data is undefined");
      return;
    }
    if (shouldSuppressChatMessageNotification(
      messageData.notificationAction as { type?: unknown } | undefined,
    )) return;

    const chatId = event.params.chatId;
    const msgId = event.params.messageId;
    const senderId = messageData.senderId;
    if (typeof senderId !== "string" || senderId === "") {
      console.error("Message data is missing senderId");
      return;
    }

    const db = getFirestore();
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
      participants: chatSnap.data()?.participants,
    });
  }
);
