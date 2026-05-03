import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import {
  formatSydneyAttendanceDate,
  shouldAwardAbsenceLessonToken,
  timestampToDate,
} from "./absence";
import {
  attendanceAddedStudentIdsForNotification,
  studentAddedNotificationBody,
} from "./attendance_action";
import { canPerformPermanentEnrollmentAction } from "./permanent_enrollment_action";
import { getAdminTokens, to12Hour } from "./shared";

type NotifyAbsenceAction = {
  type?: unknown;
  studentId?: unknown;
};

type NotifyAbsenceResult =
  | {
    didRemoveStudent: false;
    tokenAwarded: false;
  }
  | {
    didRemoveStudent: true;
    tokenAwarded: boolean;
    classDay: string;
    classTime: string;
    attDateStr: string;
    studentName: string;
  };

type OneOffEnrollmentResult =
  | {
    didAddStudent: false;
    alreadyEnrolled: true;
  }
  | {
    didAddStudent: true;
    alreadyEnrolled: false;
    classDay: string;
    classTime: string;
    attDateStr: string;
    studentName: string;
  };

function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpsError("invalid-argument", `Missing or invalid ${key}`);
  }
  return value;
}

async function sendAdminStudentAddedNotification(params: {
  tokens: string[];
  classId: string;
  studentId: string;
  studentName: string;
  classDay: string;
  classTime: string;
  attDateStr: string;
}): Promise<void> {
  const {
    tokens,
    classId,
    studentId,
    studentName,
    classDay,
    classTime,
    attDateStr,
  } = params;

  const msg: MulticastMessage = {
    notification: {
      title: "Student Added",
      body: studentAddedNotificationBody({
        studentName,
        classDay,
        classTime,
        attendanceDateText: attDateStr,
      }),
    },
    data: {
      type: "student_added",
      classId,
      studentId,
    },
    tokens,
  };
  await getMessaging().sendEachForMulticast(msg);
}

async function sendAdminStudentAbsentNotification(params: {
  tokens: string[];
  classId: string;
  studentId: string;
  studentName: string;
  classDay: string;
  classTime: string;
  attDateStr: string;
}): Promise<void> {
  const {
    tokens,
    classId,
    studentId,
    studentName,
    classDay,
    classTime,
    attDateStr,
  } = params;

  const msg: MulticastMessage = {
    notification: {
      title: "Student Absent",
      body: `${studentName} will be absent from ${classDay} at ${classTime} on ${attDateStr}.`,
    },
    data: {
      type: "student_absent",
      classId,
      studentId,
    },
    tokens,
  };
  await getMessaging().sendEachForMulticast(msg);
}

export const enrollStudentOneOff = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to enrol for a class.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const classId = requiredString(requestData, "classId");
  const studentId = requiredString(requestData, "studentId");
  const attendanceDocId = requiredString(requestData, "attendanceDocId");

  const db = getFirestore();
  const actorRef = db.collection("users").doc(requesterId);
  const classRef = db.collection("classes").doc(classId);
  const attendanceRef = classRef.collection("attendance").doc(attendanceDocId);
  const studentRef = db.collection("students").doc(studentId);

  const result = await db.runTransaction<OneOffEnrollmentResult>(async (transaction) => {
    const actorSnap = await transaction.get(actorRef);
    const classSnap = await transaction.get(classRef);
    const attendanceSnap = await transaction.get(attendanceRef);
    const studentSnap = await transaction.get(studentRef);

    if (!actorSnap.exists) {
      throw new HttpsError("permission-denied", "User account not found.");
    }
    if (!classSnap.exists) {
      throw new HttpsError("not-found", "Class not found.");
    }
    if (!attendanceSnap.exists) {
      throw new HttpsError("not-found", "Attendance record not found.");
    }
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "Student not found.");
    }

    const actorData = actorSnap.data() || {};
    const classData = classSnap.data() || {};
    const attendanceData = attendanceSnap.data() || {};
    const studentData = studentSnap.data() || {};

    if (!canPerformPermanentEnrollmentAction(requesterId, actorData, studentData)) {
      throw new HttpsError("permission-denied", "You cannot enrol this student for this class.");
    }

    const currentAttendance = Array.isArray(attendanceData.attendance)
      ? attendanceData.attendance as string[]
      : [];

    if (currentAttendance.includes(studentId)) {
      return {
        didAddStudent: false,
        alreadyEnrolled: true,
      };
    }

    const capacity = typeof classData.capacity === "number" ? classData.capacity : 0;
    if (currentAttendance.length >= capacity) {
      throw new HttpsError("failed-precondition", "Class is full for this date/week.");
    }

    const attendanceDate = timestampToDate(attendanceData.date);
    const classDay = classData.day as string || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";
    const attDateStr = formatSydneyAttendanceDate(attendanceDate, classDay);
    const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

    transaction.update(attendanceRef, {
      attendance: FieldValue.arrayUnion(studentId),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: requesterId,
      notificationAction: {
        type: "one_off_enrollment",
        studentId,
        actorId: requesterId,
      },
    });

    return {
      didAddStudent: true,
      alreadyEnrolled: false,
      classDay,
      classTime,
      attDateStr,
      studentName,
    };
  });

  if (result.didAddStudent) {
    try {
      const tokens = await getAdminTokens();
      if (tokens.length) {
        await sendAdminStudentAddedNotification({
          tokens,
          classId,
          studentId,
          studentName: result.studentName,
          classDay: result.classDay,
          classTime: result.classTime,
          attDateStr: result.attDateStr,
        });
      }
    } catch (error) {
      console.error("Error sending one-off enrolment admin notification:", error);
    } finally {
      try {
        await attendanceRef.update({
          notificationAction: FieldValue.delete(),
        });
      } catch (error) {
        console.error("Error clearing one-off enrolment notification action:", error);
      }
    }
  }

  return {
    added: result.didAddStudent,
    alreadyEnrolled: result.alreadyEnrolled,
  };
});

export const notifyStudentAbsence = onCall(async (request) => {
  const requesterId = request.auth?.uid;
  if (!requesterId) {
    throw new HttpsError("unauthenticated", "You must be signed in to notify an absence.");
  }

  if (!request.data || typeof request.data !== "object") {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const requestData = request.data as Record<string, unknown>;
  const classId = requiredString(requestData, "classId");
  const studentId = requiredString(requestData, "studentId");
  const attendanceDocId = requiredString(requestData, "attendanceDocId");
  const parentId = requiredString(requestData, "parentId");

  if (requesterId !== parentId) {
    throw new HttpsError("permission-denied", "You can only notify absences for your own account.");
  }

  const db = getFirestore();
  const classRef = db.collection("classes").doc(classId);
  const attendanceRef = classRef.collection("attendance").doc(attendanceDocId);
  const studentRef = db.collection("students").doc(studentId);
  const parentRef = db.collection("users").doc(parentId);

  const result = await db.runTransaction<NotifyAbsenceResult>(async (transaction) => {
    const classSnap = await transaction.get(classRef);
    const attendanceSnap = await transaction.get(attendanceRef);
    const studentSnap = await transaction.get(studentRef);
    const parentSnap = await transaction.get(parentRef);

    if (!classSnap.exists) {
      throw new HttpsError("not-found", "Class not found.");
    }
    if (!attendanceSnap.exists) {
      throw new HttpsError("not-found", "Attendance record not found.");
    }
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "Student not found.");
    }
    if (!parentSnap.exists) {
      throw new HttpsError("not-found", "Parent not found.");
    }

    const classData = classSnap.data() || {};
    const attendanceData = attendanceSnap.data() || {};
    const studentData = studentSnap.data() || {};
    const parentIds = Array.isArray(studentData.parents)
      ? studentData.parents as string[]
      : [];

    if (!parentIds.includes(parentId)) {
      throw new HttpsError("permission-denied", "This student is not linked to your account.");
    }

    const currentAttendance = Array.isArray(attendanceData.attendance)
      ? attendanceData.attendance as string[]
      : [];

    if (!currentAttendance.includes(studentId)) {
      return {
        didRemoveStudent: false,
        tokenAwarded: false,
      };
    }

    const attendanceDate = timestampToDate(attendanceData.date);
    if (!attendanceDate) {
      throw new HttpsError("failed-precondition", "Attendance date is missing or invalid.");
    }

    const tokenAwarded = shouldAwardAbsenceLessonToken(attendanceDate);
    const classDay = classData.day as string || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";
    const attDateStr = formatSydneyAttendanceDate(attendanceDate, classDay);
    const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

    transaction.update(attendanceRef, {
      attendance: FieldValue.arrayRemove(studentId),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: parentId,
      notificationAction: {
        type: "notify_absence",
        studentId,
        parentId,
      },
    });

    if (tokenAwarded) {
      transaction.update(parentRef, {
        lessonTokens: FieldValue.increment(1),
      });
    }

    return {
      didRemoveStudent: true,
      tokenAwarded,
      classDay,
      classTime,
      attDateStr,
      studentName,
    };
  });

  if (result.didRemoveStudent) {
    try {
      const tokens = await getAdminTokens();
      if (tokens.length) {
        await sendAdminStudentAbsentNotification({
          tokens,
          classId,
          studentId,
          studentName: result.studentName,
          classDay: result.classDay,
          classTime: result.classTime,
          attDateStr: result.attDateStr,
        });
      }
    } catch (error) {
      console.error("Error sending notify-absence admin notification:", error);
    } finally {
      try {
        await attendanceRef.update({
          notificationAction: FieldValue.delete(),
        });
      } catch (error) {
        console.error("Error clearing notify-absence notification action:", error);
      }
    }
  }

  return {
    tokenAwarded: result.tokenAwarded,
    alreadyAbsent: !result.didRemoveStudent,
  };
});

export const onAttendanceChangeNotifyAdmins = onDocumentUpdated(
  "classes/{classId}/attendance/{attendanceId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const beforeAttendance = event.data.before.data().attendance as string[] || [];
    const afterAttendance = event.data.after.data().attendance as string[] || [];
    const notificationAction = event.data.after.data().notificationAction as NotifyAbsenceAction | undefined;

    const addedStudentIds = attendanceAddedStudentIdsForNotification(
      beforeAttendance,
      afterAttendance,
      notificationAction,
    );
    const removedStudentIds = beforeAttendance
      .filter(id => !afterAttendance.includes(id))
      .filter(id => {
        return !(
          notificationAction?.type === "notify_absence" &&
          notificationAction.studentId === id
        );
      });
    if (!addedStudentIds.length && !removedStudentIds.length) return;

    const db = getFirestore();
    const classId = event.params.classId;

    const classSnap = await db.collection("classes").doc(classId).get();
    if (!classSnap.exists) return;
    const classData = classSnap.data() || {};
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";

    const attDate = timestampToDate(event.data.after.data().date);
    const attDateStr = formatSydneyAttendanceDate(attDate, classDay);

    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    if (adminsSnap.empty) return;
    let tokens: string[] = [];
    for (const adminDoc of adminsSnap.docs) {
      const uid = adminDoc.id;
      const tokensSnap = await db.collection("userTokens").doc(uid).collection("tokens").get();
      tokens.push(...tokensSnap.docs.map(d => d.data().token as string).filter(Boolean));
    }
    if (!tokens.length) return;

    for (const studentId of addedStudentIds) {
      const studentSnap = await db.collection("students").doc(studentId).get();
      const studentData = studentSnap.data() || {};
      const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

      await sendAdminStudentAddedNotification({
        tokens,
        classId,
        studentId,
        studentName,
        classDay,
        classTime,
        attDateStr,
      });
    }

    for (const studentId of removedStudentIds) {
      const studentSnap = await db.collection("students").doc(studentId).get();
      const studentData = studentSnap.data() || {};
      const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

      await sendAdminStudentAbsentNotification({
        tokens,
        classId,
        studentId,
        studentName,
        classDay,
        classTime,
        attDateStr,
      });
    }
  }
);
