import { getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";

type FirestoreData = Record<string, unknown>;

export function to12Hour(time24: string): string {
  // Expects "HH:mm"
  const [h, m] = time24.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const hour = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "pm" : "am";
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export async function getAdminTokens(): Promise<string[]> {
  const db = getFirestore();
  const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
  if (adminsSnap.empty) return [];

  const tokens: string[] = [];
  for (const adminDoc of adminsSnap.docs) {
    const tokensSnap = await db
      .collection("userTokens")
      .doc(adminDoc.id)
      .collection("tokens")
      .get();
    tokens.push(...tokensSnap.docs.map(d => d.data().token as string).filter(Boolean));
  }
  return tokens;
}

export async function sendWaitlistJoinedAdminNotification(
  waitlistEntryId: string,
  waitlistEntry: FirestoreData,
): Promise<void> {
  if (waitlistEntry.status !== "active") return;

  const db = getFirestore();
  const messaging = getMessaging();
  const tokens = await getAdminTokens();
  if (!tokens.length) return;

  const studentId = waitlistEntry.studentId as string | undefined;
  const parentId = waitlistEntry.parentId as string | undefined;
  const classId = waitlistEntry.classId as string | undefined;
  const studentSnap = studentId
    ? await db.collection("students").doc(studentId).get()
    : null;
  const parentSnap = parentId
    ? await db.collection("users").doc(parentId).get()
    : null;

  const studentData = studentSnap?.data() || {};
  const parentData = parentSnap?.data() || {};
  const studentName =
    `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() ||
    studentId ||
    "A student";
  const parentName =
    `${parentData.firstName ?? ""} ${parentData.lastName ?? ""}`.trim() ||
    parentId ||
    "a parent";
  const classDay = (waitlistEntry.dayOfWeek as string | undefined) || "Unknown day";
  const classTime = waitlistEntry.startTime
    ? to12Hour(waitlistEntry.startTime as string)
    : "Unknown time";
  const reason =
    waitlistEntry.reason === "classFull" ? "class is full" : "class is not open yet";

  const msg: MulticastMessage = {
    notification: {
      title: "New Waitlist Request",
      body: `${studentName} joined the waitlist for ${classDay} at ${classTime} because the ${reason}.`,
    },
    data: {
      type: "waitlist_joined",
      waitlistEntryId,
      classId: classId ?? "",
      studentId: studentId ?? "",
      parentId: parentId ?? "",
      parentName,
    },
    tokens,
  };

  const response = await messaging.sendEachForMulticast(msg);
  console.log(
    `Sent waitlist notification for ${waitlistEntryId}: success=${response.successCount}, failure=${response.failureCount}`
  );
  if (response.failureCount > 0) {
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        console.error("Failed waitlist notification token:", tokens[idx], resp.error);
      }
    });
  }
}
