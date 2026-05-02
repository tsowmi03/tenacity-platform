import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { isNotificationPreferenceEnabled } from "./preferences";
import {
  canAcceptParentPermanentEnrollment,
  classEnrollmentState,
} from "./permanent_enrollment_action";
import { getAdminTokens, sendWaitlistJoinedAdminNotification, to12Hour } from "./shared";
import {
  countsTowardOpenOffers,
  countsTowardWaitlist,
  normalizeWaitlistReason,
  waitlistEntryId,
} from "./waitlist_action";

type ClassNotificationAction = {
  type?: unknown;
  studentId?: unknown;
};

type ParentPermanentEnrollmentResult =
  | {
    outcome: "already_enrolled";
    classState: string;
  }
  | {
    outcome: "waitlisted";
    classState: string;
    waitlistEntryId: string;
    shouldNotifyWaitlist: boolean;
  }
  | {
    outcome: "enrolled";
    classState: string;
    studentName: string;
    classDay: string;
    classTime: string;
  };

function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value;
}

async function sendAdminPermanentEnrollmentNotification(params: {
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

async function addStudentToFutureAttendanceDocs(params: {
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
        attendance: FieldValue.arrayUnion(studentId),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy,
      });
    }
  }
}

export const enrollStudentPermanentForParent = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to enrol permanently.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const classId = requiredString(requestData, "classId");
  const studentId = requiredString(requestData, "studentId");
  const parentId = requiredString(requestData, "parentId");

  if (requesterId !== parentId) {
    throw new HttpsError("permission-denied", "You can only enrol students for your own account.");
  }

  const db = getFirestore();
  const classRef = db.collection("classes").doc(classId);
  const studentRef = db.collection("students").doc(studentId);
  const entryId = waitlistEntryId(classId, studentId);
  const entryRef = db.collection("waitlistEntries").doc(entryId);

  const result = await db.runTransaction<ParentPermanentEnrollmentResult>(async (transaction) => {
    const classSnap = await transaction.get(classRef);
    const studentSnap = await transaction.get(studentRef);
    const waitlistSnap = await transaction.get(entryRef);

    if (!classSnap.exists) {
      throw new HttpsError("not-found", "Class not found.");
    }
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "Student not found.");
    }

    const classData = classSnap.data() || {};
    const studentData = studentSnap.data() || {};
    const parentIds = Array.isArray(studentData.parents)
      ? studentData.parents as string[]
      : [];
    const primaryParentId = studentData.primaryParentId as string | undefined;
    if (!parentIds.includes(parentId) && primaryParentId !== parentId) {
      throw new HttpsError("permission-denied", "This student is not linked to your account.");
    }

    const classState = classEnrollmentState(classData);
    const enrolledStudents = Array.isArray(classData.enrolledStudents)
      ? classData.enrolledStudents as string[]
      : [];

    const promoteExistingWaitlistEntry = () => {
      if (!waitlistSnap.exists) return;
      const existingData = waitlistSnap.data() || {};
      if (!countsTowardWaitlist(existingData.status)) return;

      transaction.update(entryRef, {
        status: "promoted",
        promotedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const classUpdates: Record<string, FieldValue> = {
        waitlistCount: FieldValue.increment(-1),
      };
      if (countsTowardOpenOffers(existingData.status)) {
        classUpdates.openOfferCount = FieldValue.increment(-1);
      }
      transaction.update(classRef, classUpdates);
    };

    if (enrolledStudents.includes(studentId)) {
      promoteExistingWaitlistEntry();
      return {
        outcome: "already_enrolled",
        classState,
      };
    }

    if (!canAcceptParentPermanentEnrollment(classData)) {
      const reason = normalizeWaitlistReason(
        classState === "full" ? "class_full" : "class_not_open",
      );

      if (waitlistSnap.exists) {
        const existingData = waitlistSnap.data() || {};
        if (countsTowardWaitlist(existingData.status)) {
          return {
            outcome: "waitlisted",
            classState,
            waitlistEntryId: entryId,
            shouldNotifyWaitlist: false,
          };
        }
      }

      const nextPosition = ((classData.waitlistCounter as number | undefined) ?? 0) + 1;
      const now = Timestamp.now();
      transaction.set(entryRef, {
        classId,
        studentId,
        parentId,
        classType: classData.type ?? "",
        day: classData.day ?? "",
        startTime: classData.startTime ?? "",
        endTime: classData.endTime ?? "",
        status: "active",
        reason,
        position: nextPosition,
        createdAt: now,
        updatedAt: now,
        offeredAt: null,
        offerExpiresAt: null,
        promotedAt: null,
        notificationAction: {
          type: "join_waitlist",
          parentId,
        },
      });
      transaction.update(classRef, {
        waitlistCounter: nextPosition,
        waitlistCount: FieldValue.increment(1),
      });

      return {
        outcome: "waitlisted",
        classState,
        waitlistEntryId: entryId,
        shouldNotifyWaitlist: true,
      };
    }

    const classDay = classData.day as string || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";
    const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

    transaction.update(classRef, {
      enrolledStudents: FieldValue.arrayUnion(studentId),
      notificationAction: {
        type: "parent_permanent_enrollment",
        studentId,
        parentId,
      },
    });
    promoteExistingWaitlistEntry();

    return {
      outcome: "enrolled",
      classState,
      studentName,
      classDay,
      classTime,
    };
  });

  if (result.outcome === "enrolled") {
    let attendanceSyncError: unknown;
    try {
      await addStudentToFutureAttendanceDocs({
        classId,
        studentId,
        updatedBy: parentId,
      });
    } catch (error) {
      attendanceSyncError = error;
      console.error("Error syncing future attendance for parent permanent enrolment:", error);
    }

    try {
      const tokens = await getAdminTokens();
      if (tokens.length) {
        await sendAdminPermanentEnrollmentNotification({
          tokens,
          classId,
          studentId,
          studentName: result.studentName,
          classDay: result.classDay,
          classTime: result.classTime,
        });
      }
    } catch (error) {
      console.error("Error sending parent permanent enrolment admin notification:", error);
    } finally {
      try {
        await classRef.update({
          notificationAction: FieldValue.delete(),
        });
      } catch (error) {
        console.error("Error clearing parent permanent enrolment action:", error);
      }
    }

    if (attendanceSyncError) {
      throw new HttpsError(
        "internal",
        "Permanent enrolment was saved, but future attendance sync failed.",
      );
    }
  }

  if (result.outcome === "waitlisted" && result.shouldNotifyWaitlist) {
    try {
      const entrySnap = await entryRef.get();
      const waitlistEntry = entrySnap.data();
      if (waitlistEntry) {
        await sendWaitlistJoinedAdminNotification(result.waitlistEntryId, waitlistEntry);
      }
    } catch (error) {
      console.error("Error sending permanent enrolment waitlist admin notification:", error);
    } finally {
      try {
        await entryRef.update({
          notificationAction: FieldValue.delete(),
        });
      } catch (error) {
        console.error("Error clearing permanent enrolment waitlist action:", error);
      }
    }
  }

  return result;
});

export const onPermanentSpotOpened = onDocumentUpdated(
  "classes/{classId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const beforeArr = event.data.before.data().enrolledStudents as string[] || [];
    const afterArr = event.data.after.data().enrolledStudents as string[] || [];

    if (afterArr.length >= beforeArr.length) return;

    const classData = event.data.after.data();
    const day = classData.day as string || "a class day";
    const startTime = classData.startTime as string || "?";
    const start12 = to12Hour(startTime);

    const title = "Permanent Spot Opened!";
    const body = `A permanent spot opened for ${day} at ${start12}.`;

    const db = getFirestore();
    const msgSvc = getMessaging();

    const parentsSnap = await db.collection("users")
      .where("role", "==", "parent")
      .get();
    if (parentsSnap.empty) return;

    const tokens: string[] = [];
    for (const p of parentsSnap.docs) {
      const enabled = await isNotificationPreferenceEnabled(p.id, "spotOpened");
      if (!enabled) continue;

      const tsnap = await db
        .collection("userTokens")
        .doc(p.id)
        .collection("tokens")
        .get();
      tsnap.forEach(d => {
        const t = d.data().token as string;
        if (t) tokens.push(t);
      });
    }
    if (!tokens.length) return;

    await msgSvc.sendEachForMulticast({
      notification: { title, body },
      data: { type: "permanent_spot", classId: event.params.classId },
      tokens,
    });
    console.log(`Sent permanent‐spot notification for class ${event.params.classId}`);
  }
);

export const onPermanentEnrolmentNotifyAdmins = onDocumentUpdated(
  "classes/{classId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const beforeArr = event.data.before.data().enrolledStudents as string[] || [];
    const afterArr = event.data.after.data().enrolledStudents as string[] || [];

    if (afterArr.length <= beforeArr.length) return;

    const notificationAction = event.data.after.data().notificationAction as ClassNotificationAction | undefined;
    const newStudentIds = afterArr
      .filter(id => !beforeArr.includes(id))
      .filter(id => {
        return !(
          notificationAction?.type === "parent_permanent_enrollment" &&
          notificationAction.studentId === id
        );
      });
    if (!newStudentIds.length) return;

    const db = getFirestore();
    const messaging = getMessaging();
    const classId = event.params.classId;
    const classData = event.data.after.data();
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";

    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty) return;

    let tokens: string[] = [];
    for (const adminDoc of adminsSnap.docs) {
      const uid = adminDoc.id;
      const tokensSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
      tokens.push(...tokensSnap.docs.map(d => d.data().token as string).filter(Boolean));
    }
    if (!tokens.length) return;

    for (const studentId of newStudentIds) {
      const studentSnap = await db.collection("students").doc(studentId).get();
      const studentData = studentSnap.data() || {};
      const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

      const notifBody = `${studentName} has permanently enrolled for ${classDay} at ${classTime}.`;

      const msg: MulticastMessage = {
        notification: {
          title: "Student Enrolled",
          body: notifBody,
        },
        data: {
          type: "student_enrolled",
          classId,
          studentId,
          enrolType: "permanent",
        },
        tokens,
      };
      await messaging.sendEachForMulticast(msg);
    }
  }
);
