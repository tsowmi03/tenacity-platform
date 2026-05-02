import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  addStudentToFutureAttendanceDocs,
  getAdminTokens,
  sendAdminPermanentEnrollmentNotification,
  sendWaitlistJoinedAdminNotification,
  to12Hour,
} from "./shared";
import { permanentSpotsRemaining } from "./permanent_enrollment_action";
import {
  countsTowardWaitlist,
  normalizeWaitlistReason,
  waitlistEntryId,
} from "./waitlist_action";
import {
  canPromoteWaitlistStatus,
  WaitlistPromotionOutcome,
  waitlistPromotionCounterDeltas,
} from "./waitlist_promotion_action";

type WaitlistNotificationAction = {
  type?: unknown;
};

type PromoteWaitlistEntryResult = {
  outcome: WaitlistPromotionOutcome;
  entryId: string;
  classId: string;
  studentId: string;
  parentId: string;
  previousStatus: string;
  permanentSpotsRemaining: number;
  shouldSyncAttendance: boolean;
  shouldNotifyEnrollment: boolean;
  studentName?: string;
  classDay?: string;
  classTime?: string;
};

function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value;
}

export const joinWaitlist = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to join a waitlist.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const classId = requiredString(requestData, "classId");
  const studentId = requiredString(requestData, "studentId");
  const parentId = requiredString(requestData, "parentId");
  const reason = (() => {
    try {
      return normalizeWaitlistReason(requestData.reason);
    } catch {
      throw new HttpsError("invalid-argument", "Missing or invalid reason");
    }
  })();

  if (requesterId !== parentId) {
    throw new HttpsError("permission-denied", "You can only join waitlists for your own account.");
  }

  const db = getFirestore();
  const entryId = waitlistEntryId(classId, studentId);
  const entryRef = db.collection("waitlistEntries").doc(entryId);
  const classRef = db.collection("classes").doc(classId);
  const studentRef = db.collection("students").doc(studentId);

  const result = await db.runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(entryRef);
    const classSnap = await transaction.get(classRef);
    const studentSnap = await transaction.get(studentRef);

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

    const enrolledStudents = Array.isArray(classData.enrolledStudents)
      ? classData.enrolledStudents as string[]
      : [];
    if (enrolledStudents.includes(studentId)) {
      throw new HttpsError("failed-precondition", "Student is already permanently enrolled in class.");
    }

    if (existingSnap.exists) {
      const existingData = existingSnap.data() || {};
      if (countsTowardWaitlist(existingData.status)) {
        return {
          entryId,
          shouldNotifyAdmins: false,
        };
      }
    }

    const nextPosition = ((classData.waitlistCounter as number | undefined) ?? 0) + 1;
    const now = Timestamp.now();
    const entry = {
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
    };

    transaction.set(entryRef, entry);
    transaction.update(classRef, {
      waitlistCounter: nextPosition,
      waitlistCount: FieldValue.increment(1),
    });

    return {
      entryId,
      shouldNotifyAdmins: true,
    };
  });

  if (result.shouldNotifyAdmins) {
    try {
      const entrySnap = await entryRef.get();
      const waitlistEntry = entrySnap.data();
      if (waitlistEntry) {
        await sendWaitlistJoinedAdminNotification(entryId, waitlistEntry);
      }
    } catch (error) {
      console.error("Error sending join-waitlist admin notification:", error);
    } finally {
      try {
        await entryRef.update({
          notificationAction: FieldValue.delete(),
        });
      } catch (error) {
        console.error("Error clearing join-waitlist notification action:", error);
      }
    }
  }

  return {
    entryId: result.entryId,
    joined: result.shouldNotifyAdmins,
  };
});

export const promoteWaitlistEntry = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to promote a waitlist entry.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const entryId = requiredString(requestData, "entryId");

  const db = getFirestore();
  const adminRef = db.collection("users").doc(requesterId);
  const entryRef = db.collection("waitlistEntries").doc(entryId);
  let classRef: FirebaseFirestore.DocumentReference | undefined;

  const result = await db.runTransaction<PromoteWaitlistEntryResult>(async (transaction) => {
    const adminSnap = await transaction.get(adminRef);
    const entrySnap = await transaction.get(entryRef);

    if (!adminSnap.exists || adminSnap.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Only admins can promote waitlist entries.");
    }
    if (!entrySnap.exists) {
      throw new HttpsError("not-found", "Waitlist entry not found.");
    }

    const entryData = entrySnap.data() || {};
    const classId = requiredString(entryData, "classId");
    const studentId = requiredString(entryData, "studentId");
    const parentId = requiredString(entryData, "parentId");
    const previousStatus = typeof entryData.status === "string"
      ? entryData.status
      : "active";

    classRef = db.collection("classes").doc(classId);
    const studentRef = db.collection("students").doc(studentId);
    const classSnap = await transaction.get(classRef);
    const studentSnap = await transaction.get(studentRef);

    if (!classSnap.exists) {
      throw new HttpsError("not-found", "Class not found.");
    }
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "Student not found.");
    }

    const classData = classSnap.data() || {};
    const studentData = studentSnap.data() || {};
    const spotsRemaining = permanentSpotsRemaining(classData);
    const enrolledStudents = Array.isArray(classData.enrolledStudents)
      ? classData.enrolledStudents as string[]
      : [];

    if (!canPromoteWaitlistStatus(previousStatus)) {
      return {
        outcome: "not_promotable",
        entryId,
        classId,
        studentId,
        parentId,
        previousStatus,
        permanentSpotsRemaining: spotsRemaining,
        shouldSyncAttendance: false,
        shouldNotifyEnrollment: false,
      };
    }

    const promotedEntryUpdates = {
      status: "promoted",
      updatedAt: FieldValue.serverTimestamp(),
      promotedAt: FieldValue.serverTimestamp(),
    };
    const counterDeltas = waitlistPromotionCounterDeltas(previousStatus);
    const classCounterUpdates: Record<string, FieldValue> = {};
    if (counterDeltas.waitlistCount !== 0) {
      classCounterUpdates.waitlistCount = FieldValue.increment(counterDeltas.waitlistCount);
    }
    if (counterDeltas.openOfferCount !== 0) {
      classCounterUpdates.openOfferCount = FieldValue.increment(counterDeltas.openOfferCount);
    }

    if (enrolledStudents.includes(studentId)) {
      transaction.update(entryRef, promotedEntryUpdates);
      if (Object.keys(classCounterUpdates).length) {
        transaction.update(classRef, classCounterUpdates);
      }

      return {
        outcome: "already_enrolled",
        entryId,
        classId,
        studentId,
        parentId,
        previousStatus,
        permanentSpotsRemaining: spotsRemaining,
        shouldSyncAttendance: true,
        shouldNotifyEnrollment: false,
      };
    }

    if (spotsRemaining <= 0) {
      return {
        outcome: "class_full",
        entryId,
        classId,
        studentId,
        parentId,
        previousStatus,
        permanentSpotsRemaining: spotsRemaining,
        shouldSyncAttendance: false,
        shouldNotifyEnrollment: false,
      };
    }

    const classDay = classData.day as string || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";
    const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

    transaction.update(entryRef, promotedEntryUpdates);
    transaction.update(classRef, {
      ...classCounterUpdates,
      enrolledStudents: FieldValue.arrayUnion(studentId),
      notificationAction: {
        type: "waitlist_promotion",
        entryId,
        studentId,
        adminId: requesterId,
      },
    });

    return {
      outcome: "promoted",
      entryId,
      classId,
      studentId,
      parentId,
      previousStatus,
      permanentSpotsRemaining: spotsRemaining - 1,
      shouldSyncAttendance: true,
      shouldNotifyEnrollment: true,
      studentName,
      classDay,
      classTime,
    };
  });

  let attendanceSyncError: unknown;
  if (result.shouldSyncAttendance) {
    try {
      await addStudentToFutureAttendanceDocs({
        classId: result.classId,
        studentId: result.studentId,
        updatedBy: requesterId,
      });
    } catch (error) {
      attendanceSyncError = error;
      console.error("Error syncing future attendance for waitlist promotion:", error);
    }
  }

  if (result.shouldNotifyEnrollment && classRef) {
    try {
      const tokens = await getAdminTokens();
      if (tokens.length) {
        await sendAdminPermanentEnrollmentNotification({
          tokens,
          classId: result.classId,
          studentId: result.studentId,
          studentName: result.studentName ?? result.studentId,
          classDay: result.classDay ?? "Unknown day",
          classTime: result.classTime ?? "Unknown time",
        });
      }
    } catch (error) {
      console.error("Error sending waitlist promotion admin notification:", error);
    } finally {
      try {
        await classRef.update({
          notificationAction: FieldValue.delete(),
        });
      } catch (error) {
        console.error("Error clearing waitlist promotion notification action:", error);
      }
    }
  }

  if (attendanceSyncError) {
    throw new HttpsError(
      "internal",
      "Waitlist promotion was saved, but future attendance sync failed.",
    );
  }

  return result;
});

export const onWaitlistEntryCreatedNotifyAdmins = onDocumentCreated(
  "waitlistEntries/{waitlistEntryId}",
  async (event) => {
    const waitlistEntry = event.data?.data();
    if (!waitlistEntry) return;
    const notificationAction = waitlistEntry.notificationAction as WaitlistNotificationAction | undefined;
    if (notificationAction?.type === "join_waitlist") return;

    await sendWaitlistJoinedAdminNotification(
      event.params.waitlistEntryId,
      waitlistEntry,
    );
  }
);

export const onWaitlistEntryReactivatedNotifyAdmins = onDocumentUpdated(
  "waitlistEntries/{waitlistEntryId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const before = event.data.before.data();
    const after = event.data.after.data();
    const notificationAction = after.notificationAction as WaitlistNotificationAction | undefined;
    if (notificationAction?.type === "join_waitlist") return;
    if (before.status === "active" || after.status !== "active") return;

    await sendWaitlistJoinedAdminNotification(
      event.params.waitlistEntryId,
      after,
    );
  }
);
