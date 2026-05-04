type ChatNotificationAction = {
  type?: unknown;
};

export function canSendChatMessage(actorId: string, participants: unknown): boolean {
  return Array.isArray(participants) &&
    participants.some(participant => participant === actorId);
}

export function chatRecipientIds(participants: unknown, senderId: string): string[] {
  return Array.isArray(participants)
    ? participants.filter((participant): participant is string => (
      typeof participant === "string" && participant !== senderId
    ))
    : [];
}

export function chatMessagePreview(params: {
  text?: unknown;
  type?: unknown;
}): string {
  const { text, type } = params;
  if (typeof text === "string" && text !== "") return text;
  return type === "image" ? "[Image]" : "[Media]";
}

export function truncateChatMessagePreview(preview: string): string {
  return preview.length > 100 ? `${preview.substring(0, 97)}...` : preview;
}

export function chatSenderDisplayName(senderData: Record<string, unknown>): string {
  return `${senderData.firstName ?? ""} ${senderData.lastName ?? ""}`.trim() || "Unknown";
}

export function shouldSuppressChatMessageNotification(
  notificationAction?: ChatNotificationAction,
): boolean {
  return notificationAction?.type === "send_chat_message";
}
