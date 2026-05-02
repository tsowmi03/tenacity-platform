import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";
import { to12Hour } from "./shared";

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
      const settings = (await db.collection("userSettings").doc(p.id).get()).data() || {};
      if (settings.spotOpened === false) continue;

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

    const newStudentIds = afterArr.filter(id => !beforeArr.includes(id));
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
