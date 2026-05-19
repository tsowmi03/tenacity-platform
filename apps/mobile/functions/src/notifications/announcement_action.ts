type AnnouncementNotificationAction = {
  type?: unknown;
};

const announcementAudiences = new Set(["all", "admin", "tutor", "parent"]);

export function normalizeAnnouncementAudience(audience: unknown): string {
  if (typeof audience !== "string") {
    throw new Error("Invalid announcement audience");
  }

  const normalized = audience.trim().toLowerCase();
  if (announcementAudiences.has(normalized)) return normalized;

  throw new Error("Invalid announcement audience");
}

export function canCreateAnnouncement(actorData: Record<string, unknown>): boolean {
  return actorData.role === "admin";
}

export function shouldSuppressAnnouncementCreatedNotification(
  notificationAction?: AnnouncementNotificationAction,
): boolean {
  return notificationAction?.type === "create_announcement";
}

export function announcementNotificationBody(title: unknown): string {
  return typeof title === "string" && title !== ""
    ? title
    : "A new announcement has been posted";
}
