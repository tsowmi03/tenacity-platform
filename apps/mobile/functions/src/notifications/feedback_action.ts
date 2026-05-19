type FeedbackNotificationAction = {
  type?: unknown;
};

export function canCreateFeedback(actorData: Record<string, unknown>): boolean {
  return actorData.role === "admin" || actorData.role === "tutor";
}

export function shouldSuppressFeedbackCreatedNotification(
  notificationAction?: FeedbackNotificationAction,
): boolean {
  return notificationAction?.type === "create_feedback";
}

export function feedbackNotificationBody(subject: unknown): string {
  if (typeof subject !== "string" || subject.length === 0) {
    return "You have new feedback for your child.";
  }
  return subject.length > 80 ? `${subject.slice(0, 77)}...` : subject;
}
