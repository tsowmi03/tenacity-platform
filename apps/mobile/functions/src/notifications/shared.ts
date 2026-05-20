import {
  DocumentData,
  FieldValue,
  getFirestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { waitlistDisplayDay } from "./waitlist_action";

type FirestoreData = Record<string, unknown>;

export type AttendanceSyncSummary = {
  attendanceSessionsAdded: number;
  skippedFullSessionCount: number;
  firstAttendanceDate: Date | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function futureAttendanceSyncDecision(params: {
  attendance: unknown;
  capacity?: number;
  studentId: string;
  enforceCapacity?: boolean;
}): "add" | "already_present" | "full" {
  const attendance = stringArray(params.attendance);
  if (attendance.includes(params.studentId)) return "already_present";
  if (
    params.enforceCapacity !== false &&
    typeof params.capacity === "number" &&
    attendance.length >= params.capacity
  ) {
    return "full";
  }
  return "add";
}

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

export async function sendAdminPermanentEnrollmentNotification(params: {
  tokens: string[];
  classId: string;
  studentId: string;
  studentName: string;
  classDay: string;
  classTime: string;
}): Promise<void> {
  const { tokens, classId, studentId, studentName, classDay, classTime } = params;
  const msg: MulticastMessage = {
    notification: {
      title: "Student Enrolled",
      body: `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`,
    },
    data: {
      type: "student_enrolled",
      classId,
      studentId,
      enrolType: "permanent",
    },
    tokens,
  };
  await getMessaging().sendEachForMulticast(msg);
}

export async function addStudentToFutureAttendanceDocs(params: {
  classId: string;
  studentId: string;
  updatedBy: string;
  capacity?: number;
}): Promise<AttendanceSyncSummary> {
  const { classId, studentId, updatedBy, capacity } = params;
  const db = getFirestore();
  const summary: AttendanceSyncSummary = {
    attendanceSessionsAdded: 0,
    skippedFullSessionCount: 0,
    firstAttendanceDate: null,
  };
  const nowSydney = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Sydney",
  });
  const attendanceSnapshots = await db
    .collection("classes")
    .doc(classId)
    .collection("attendance")
    .get();

  const futureAttendanceDocs: Array<{
    snap: QueryDocumentSnapshot<DocumentData>;
    data: DocumentData;
    attendanceDate: Date;
  }> = [];

  for (const snap of attendanceSnapshots.docs) {
    const data = snap.data();
    const rawDate = data.date;
    const attendanceDate = rawDate && typeof rawDate.toDate === "function"
      ? rawDate.toDate() as Date
      : null;
    if (!attendanceDate) continue;

    const attendanceSydney = attendanceDate.toLocaleDateString("en-CA", {
      timeZone: "Australia/Sydney",
    });
    if (attendanceSydney >= nowSydney) {
      futureAttendanceDocs.push({ snap, data, attendanceDate });
    }
  }

  futureAttendanceDocs.sort(
    (a, b) => a.attendanceDate.getTime() - b.attendanceDate.getTime(),
  );

  for (let i = 0; i < futureAttendanceDocs.length; i++) {
    const { snap, data, attendanceDate } = futureAttendanceDocs[i];
    const decision = futureAttendanceSyncDecision({
      attendance: data.attendance,
      capacity,
      studentId,
      enforceCapacity: i < 2,
    });
    if (decision === "full") {
      summary.skippedFullSessionCount += 1;
      continue;
    }
    if (decision === "already_present") {
      continue;
    }
    await snap.ref.update({
      attendance: FieldValue.arrayUnion(studentId),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    });
    summary.attendanceSessionsAdded += 1;
    if (!summary.firstAttendanceDate || attendanceDate < summary.firstAttendanceDate) {
      summary.firstAttendanceDate = attendanceDate;
    }
  }
  return summary;
}

export async function removeStudentFromFutureAttendanceDocs(params: {
  classId: string;
  studentId: string;
  updatedBy: string;
}): Promise<void> {
  const { classId, studentId, updatedBy } = params;
  const db = getFirestore();
  const nowSydney = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Sydney",
  });
  const attendanceSnapshots = await db
    .collection("classes")
    .doc(classId)
    .collection("attendance")
    .get();

  for (const snap of attendanceSnapshots.docs) {
    const data = snap.data();
    const rawDate = data.date;
    const attendanceDate = rawDate && typeof rawDate.toDate === "function"
      ? rawDate.toDate() as Date
      : null;
    if (!attendanceDate) continue;

    const attendanceSydney = attendanceDate.toLocaleDateString("en-CA", {
      timeZone: "Australia/Sydney",
    });
    if (attendanceSydney >= nowSydney) {
      await snap.ref.update({
        attendance: FieldValue.arrayRemove(studentId),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy,
      });
    }
  }
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
  const classDay = waitlistDisplayDay(waitlistEntry);
  const classTime = waitlistEntry.startTime
    ? to12Hour(waitlistEntry.startTime as string)
    : "Unknown time";
  const reason =
    waitlistEntry.reason === "classFull" || waitlistEntry.reason === "class_full"
      ? "class is full"
      : "class is not open yet";

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
