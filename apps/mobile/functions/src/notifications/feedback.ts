import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import {
  canCreateFeedback,
  feedbackNotificationBody,
  shouldSuppressFeedbackCreatedNotification,
} from "./feedback_action";

type FeedbackDocument = Record<string, unknown>;

function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value.trim();
}

function studentParentIds(studentData: Record<string, unknown>): string[] {
  return Array.isArray(studentData.parents)
    ? studentData.parents.filter((parentId): parentId is string => typeof parentId === "string")
    : [];
}

function studentDisplayName(studentData: Record<string, unknown>): string {
  return `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || "Your child";
}

async function parentTokens(parentId: string): Promise<string[]> {
  const tokensSnap = await getFirestore()
    .collection("userTokens")
    .doc(parentId)
    .collection("tokens")
    .get();
  return tokensSnap.docs
    .map(doc => doc.data().token)
    .filter((token): token is string => typeof token === "string" && token !== "");
}

async function sendFeedbackCreatedNotifications(
  feedbackId: string,
  feedbackDoc: FeedbackDocument,
): Promise<void> {
  const db = getFirestore();
  const messaging = getMessaging();
  const studentId = feedbackDoc.studentId;
  if (typeof studentId !== "string" || studentId === "") {
    console.error("Feedback document missing studentId");
    return;
  }

  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    console.error(`Student document ${studentId} does not exist`);
    return;
  }

  const studentData = studentSnap.data() || {};
  const parents = studentParentIds(studentData);
  const studentName = studentDisplayName(studentData);

  if (!parents.length) {
    console.log(`No parents array for student ${studentId}`);
    return;
  }

  for (const parentId of parents) {
    let tokens: string[];
    try {
      tokens = await parentTokens(parentId);
    } catch (err) {
      console.error(`Failed to fetch tokens for parent ${parentId}:`, err);
      continue;
    }
    if (!tokens.length) {
      console.log(`No tokens for parent ${parentId}`);
      continue;
    }

    const msg: MulticastMessage = {
      notification: {
        title: `New Feedback for ${studentName}`,
        body: feedbackNotificationBody(feedbackDoc.subject),
      },
      data: {
        type: "feedback",
        studentId,
        feedbackId,
      },
      tokens,
    };
    try {
      const res = await messaging.sendEachForMulticast(msg);
      console.log(
        `Feedback notification sent to parent ${parentId}: success=${res.successCount}, failure=${res.failureCount}, tokensCount=${tokens.length}`
      );
      if (res.failureCount > 0) {
        res.responses.forEach((r, i) => {
          if (!r.success) console.error("Failed token:", tokens[i], r.error);
        });
      }
    } catch (err) {
      console.error(`Error sending notification to parent ${parentId}:`, err);
    }
  }
}

export const createFeedback = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to create feedback.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const studentId = requiredString(requestData, "studentId");
  const subject = requiredString(requestData, "subject");
  const feedback = requiredString(requestData, "feedback");

  const db = getFirestore();
  const actorRef = db.collection("users").doc(requesterId);
  const studentRef = db.collection("students").doc(studentId);

  const [actorSnap, studentSnap] = await Promise.all([
    actorRef.get(),
    studentRef.get(),
  ]);
  if (!actorSnap.exists) {
    throw new HttpsError("permission-denied", "User account not found.");
  }
  if (!studentSnap.exists) {
    throw new HttpsError("not-found", "Student not found.");
  }
  if (!canCreateFeedback(actorSnap.data() || {})) {
    throw new HttpsError("permission-denied", "You cannot create feedback.");
  }

  const studentData = studentSnap.data() || {};
  const feedbackRef = db.collection("feedback").doc();
  const feedbackDoc: FeedbackDocument = {
    studentId,
    tutorId: requesterId,
    parentIds: studentParentIds(studentData),
    subject,
    feedback,
    createdAt: FieldValue.serverTimestamp(),
    isUnread: true,
    notificationAction: {
      type: "create_feedback",
      actorId: requesterId,
    },
  };

  await feedbackRef.set(feedbackDoc);

  try {
    await sendFeedbackCreatedNotifications(feedbackRef.id, feedbackDoc);
  } catch (error) {
    console.error("Error sending feedback notification:", error);
  } finally {
    try {
      await feedbackRef.update({
        notificationAction: FieldValue.delete(),
      });
    } catch (error) {
      console.error("Error clearing feedback notification action:", error);
    }
  }

  return {
    feedbackId: feedbackRef.id,
  };
});

export const onFeedbackCreated = onDocumentCreated(
  "feedback/{feedbackId}",
  async (event) => {
    const feedbackId = event.params.feedbackId;
    const feedbackDoc = event.data?.data();
    if (!feedbackDoc) {
      console.error("Feedback document data is undefined");
      return;
    }
    if (shouldSuppressFeedbackCreatedNotification(
      feedbackDoc.notificationAction as { type?: unknown } | undefined,
    )) return;

    await sendFeedbackCreatedNotifications(feedbackId, feedbackDoc);
  }
);
