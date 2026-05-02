import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { DateTime } from "luxon";
import { to12Hour } from "./shared";

export const onAttendanceChangeNotifyAdmins = onDocumentUpdated(
  "classes/{classId}/attendance/{attendanceId}",
  async (event) => {
    if (!event.data?.before || !event.data?.after) return;

    const beforeAttendance = event.data.before.data().attendance as string[] || [];
    const afterAttendance = event.data.after.data().attendance as string[] || [];

    const addedStudentIds = afterAttendance.filter(id => !beforeAttendance.includes(id));
    const removedStudentIds = beforeAttendance.filter(id => !afterAttendance.includes(id));
    if (!addedStudentIds.length && !removedStudentIds.length) return;

    const db = getFirestore();
    const messaging = getMessaging();
    const classId = event.params.classId;

    const classSnap = await db.collection("classes").doc(classId).get();
    if (!classSnap.exists) return;
    const classData = classSnap.data() || {};
    const classDay = classData.day || "Unknown day";
    const classTime = classData.startTime
      ? to12Hour(classData.startTime as string)
      : "Unknown time";

    const attDateRaw = event.data.after.data().date;
    let attDate: Date | null = null;
    if (attDateRaw && typeof attDateRaw.toDate === "function") {
      attDate = attDateRaw.toDate();
    } else if (attDateRaw instanceof Date) {
      attDate = attDateRaw;
    } else if (attDateRaw && attDateRaw._seconds) {
      attDate = new Date(attDateRaw._seconds * 1000);
    }
    const attDateStr = attDate
      ? DateTime.fromJSDate(attDate).setZone("Australia/Sydney").toFormat("cccc d LLLL")
      : classDay;

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

      const notifBody = `${studentName} has been added to ${classDay} at ${classTime} on ${attDateStr}.`;

      const msg: MulticastMessage = {
        notification: {
          title: "Student Added",
          body: notifBody,
        },
        data: {
          type: "student_added",
          classId,
          studentId,
        },
        tokens,
      };
      await messaging.sendEachForMulticast(msg);
    }

    for (const studentId of removedStudentIds) {
      const studentSnap = await db.collection("students").doc(studentId).get();
      const studentData = studentSnap.data() || {};
      const studentName = `${studentData.firstName ?? ""} ${studentData.lastName ?? ""}`.trim() || studentId;

      const notifBody = `${studentName} will be absent from ${classDay} at ${classTime} on ${attDateStr}.`;

      const msg: MulticastMessage = {
        notification: {
          title: "Student Absent",
          body: notifBody,
        },
        data: {
          type: "student_absent",
          classId,
          studentId,
        },
        tokens,
      };
      await messaging.sendEachForMulticast(msg);
    }
  }
);
