import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import {
  announcementNotificationBody,
  canCreateAnnouncement,
  normalizeAnnouncementAudience,
  shouldSuppressAnnouncementCreatedNotification,
} from "./announcement_action";

type AnnouncementDocument = Record<string, unknown>;

function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value.trim();
}

function optionalBoolean(
  data: Record<string, unknown>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = data[key];
  if (value == null) return defaultValue;
  if (typeof value === "boolean") return value;
  throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
}

async function announcementTokensForAudience(audience: string): Promise<string[]> {
  const db = getFirestore();
  const tokens: string[] = [];

  if (audience === "all") {
    const usersSnapshot = await db.collection("userTokens").get();
    for (const userDoc of usersSnapshot.docs) {
      const tokensSnapshot = await userDoc.ref.collection("tokens").get();
      tokensSnapshot.forEach((tokenDoc) => {
        const token = tokenDoc.data().token;
        if (typeof token === "string" && token) tokens.push(token);
      });
    }
    return tokens;
  }

  const usersQuerySnapshot = await db
    .collection("users")
    .where("role", "==", audience)
    .get();
  if (usersQuerySnapshot.empty) return tokens;

  for (const userDoc of usersQuerySnapshot.docs) {
    const tokensSnapshot = await db
      .collection("userTokens")
      .doc(userDoc.id)
      .collection("tokens")
      .get();
    tokensSnapshot.forEach((tokenDoc) => {
      const token = tokenDoc.data().token;
      if (typeof token === "string" && token) tokens.push(token);
    });
  }

  return tokens;
}

async function sendAnnouncementCreatedNotification(
  announcementId: string,
  announcement: AnnouncementDocument,
): Promise<void> {
  const audience = normalizeAnnouncementAudience(announcement.audience ?? "all");
  const tokens = await announcementTokensForAudience(audience);
  if (!tokens.length) return;

  const message: MulticastMessage = {
    notification: {
      title: "New Announcement",
      body: announcementNotificationBody(announcement.title),
    },
    data: {
      type: "announcement",
      announcementId,
    },
    tokens,
  };

  const response = await getMessaging().sendEachForMulticast(message);
  console.log(`Successfully sent announcement messages: ${response.successCount}`);
  console.log(`Failed announcement messages: ${response.failureCount}`);

  if (response.failureCount > 0) {
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        console.log("Failed to send announcement to token:", tokens[idx]);
        console.log("Error:", resp.error);
      }
    });
  }
}

export const createAnnouncement = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to create an announcement.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const title = requiredString(requestData, "title");
  const body = requiredString(requestData, "body");
  const archived = optionalBoolean(requestData, "archived", false);
  const audience = (() => {
    try {
      return normalizeAnnouncementAudience(requestData.audience ?? "all");
    } catch {
      throw new HttpsError("invalid-argument", "Missing or invalid audience");
    }
  })();

  const db = getFirestore();
  const actorSnap = await db.collection("users").doc(requesterId).get();
  if (!actorSnap.exists) {
    throw new HttpsError("permission-denied", "User account not found.");
  }
  if (!canCreateAnnouncement(actorSnap.data() || {})) {
    throw new HttpsError("permission-denied", "You cannot create announcements.");
  }

  const announcementRef = db.collection("announcements").doc();
  const announcement: AnnouncementDocument = {
    title,
    body,
    archived,
    audience,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: requesterId,
    notificationAction: {
      type: "create_announcement",
      actorId: requesterId,
    },
  };

  await announcementRef.set(announcement);

  try {
    await sendAnnouncementCreatedNotification(announcementRef.id, announcement);
  } catch (error) {
    console.error("Error sending announcement notification:", error);
  } finally {
    try {
      await announcementRef.update({
        notificationAction: FieldValue.delete(),
      });
    } catch (error) {
      console.error("Error clearing announcement notification action:", error);
    }
  }

  return {
    announcementId: announcementRef.id,
  };
});

export const onAnnouncementCreated = onDocumentCreated(
  "announcements/{announcementId}",
  async (event) => {
    const announcement = event.data?.data();
    if (!announcement) {
      console.error("Announcement data is undefined");
      return;
    }
    if (shouldSuppressAnnouncementCreatedNotification(
      announcement.notificationAction as { type?: unknown } | undefined,
    )) return;

    try {
      await sendAnnouncementCreatedNotification(event.params.announcementId, announcement);
    } catch (error) {
      console.error("Error sending notifications:", error);
    }
  }
);
