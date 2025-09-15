import { getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

export const onFeedbackCreated = onDocumentCreated(
  "feedback/{feedbackId}",
  async (event) => {
    const db = getFirestore();
    const messaging = getMessaging();
    const feedbackId = event.params.feedbackId;
    const feedbackDoc = event.data?.data();
    if (!feedbackDoc) {
      console.error("Feedback document data is undefined");
      return;
    }
    const { studentId, subject } = feedbackDoc;
    if (!studentId) {
      console.error("Feedback document missing studentId");
      return;
    }

    // Fetch student doc
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      console.error(`Student document ${studentId} does not exist`);
      return;
    }
    const studentData = studentSnap.data() || {};
    const parents: string[] = Array.isArray(studentData.parents) ? studentData.parents : [];
    const studentName =
      `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || "Your child";

    if (!parents.length) {
      console.log(`No parents array for student ${studentId}`);
      return;
    }

    // Helper: fetch tokens for a parentId
    async function getParentTokens(parentId: string): Promise<string[]> {
      const tokensSnap = await db
        .collection("userTokens")
        .doc(parentId)
        .collection("tokens")
        .get();
      return tokensSnap.docs.map(doc => doc.data().token as string).filter(Boolean);
    }

    // Send notification to each parent's devices
    for (const parentId of parents) {
      let tokens: string[];
      try {
        tokens = await getParentTokens(parentId);
      } catch (err) {
        console.error(`Failed to fetch tokens for parent ${parentId}:`, err);
        continue;
      }
      if (!tokens.length) {
        console.log(`No tokens for parent ${parentId}`);
        continue;
      }
      let notifBody: string;
      if (typeof subject === "string" && subject.length) {
        notifBody = subject.length > 80 ? subject.slice(0, 77) + "..." : subject;
      } else {
        notifBody = "You have new feedback for your child.";
      }
      const msg: MulticastMessage = {
        notification: {
          title: `New Feedback for ${studentName}`,
          body: notifBody,
        },
        data: {
          type: "feedback",
          studentId: studentId,
          feedbackId: feedbackId,
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
);