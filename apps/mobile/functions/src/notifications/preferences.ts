import { getFirestore } from "firebase-admin/firestore";

const defaultNotificationPreferences = {
  spotOpened: true,
  lessonReminder: true,
};

export type NotificationPreferenceKey = keyof typeof defaultNotificationPreferences;

export function isPreferenceEnabled(
  settings: Record<string, unknown> | null | undefined,
  key: NotificationPreferenceKey,
): boolean {
  const value = settings?.[key];
  return typeof value === "boolean"
    ? value
    : defaultNotificationPreferences[key];
}

export async function isNotificationPreferenceEnabled(
  userId: string,
  key: NotificationPreferenceKey,
): Promise<boolean> {
  const settingsSnap = await getFirestore()
    .collection("userSettings")
    .doc(userId)
    .get();

  return isPreferenceEnabled(
    settingsSnap.exists ? settingsSnap.data() : undefined,
    key,
  );
}
