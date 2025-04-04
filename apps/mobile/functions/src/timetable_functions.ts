import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

// Helper to compute the first session date for a class in a term.
function computeFirstSessionDate(termStart: Date, classDay: string): Date {
  const dayOffsets: { [key: string]: number } = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    thursday: 3,
    friday: 4,
    saturday: 5,
    sunday: 6,
  };
  const offset = dayOffsets[classDay.toLowerCase()] ?? 0;
  const firstSession = new Date(termStart);
  firstSession.setDate(termStart.getDate() + offset);
  return firstSession;
}

// Helper: Pre-generate attendance docs for a class for a given term.
async function generateAttendanceDocsForTerm(
  classModel: any,
  term: any,
  firstSessionDate: Date
): Promise<void> {
  const classRef = admin.firestore().collection('classes').doc(classModel.id);
  const attendanceColl = classRef.collection('attendance');

  for (let w = 1; w <= term.weeksNum; w++) {
    // Create doc ID in format "YYYY_TN_WN"
    const attendanceDocId = `${term.id}_W${w}`;
    // Session date: firstSessionDate + (w-1)*7 days
    const sessionDate = new Date(firstSessionDate);
    sessionDate.setDate(firstSessionDate.getDate() + (w - 1) * 7);

    const newAttendance = {
      id: attendanceDocId,
      termId: term.id,
      weekNumber: w,
      date: admin.firestore.Timestamp.fromDate(sessionDate),
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: 'system',
      // Pre-fill with permanently enrolled students.
      attendance: classModel.enrolledStudents || [],
    };

    await attendanceColl.doc(attendanceDocId).set(newAttendance);
  }
}

// Cloud Function that runs daily at 00:05.
export const rolloverTermData = onSchedule(
    {
      schedule: "every day 00:05",
      // optional: timeZone: "Australia/Sydney"
    },
    async (context) => {
    const db = admin.firestore();
    const now = new Date();
    
    // Define a window for "yesterday" – the day the term ended.
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const tomorrow = new Date(yesterday);
    tomorrow.setDate(yesterday.getDate() + 1);

    try {
      // 1. Find the term that ended yesterday.
      const endedTermQuery = await db.collection('terms')
        .where('endDate', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('endDate', '<', admin.firestore.Timestamp.fromDate(tomorrow))
        .get();
      
      if (endedTermQuery.empty) {
        console.log("No term ended yesterday. Exiting.");
        return;
      }
      
      let endedTerm: any;
      endedTermQuery.forEach(doc => {
        endedTerm = { id: doc.id, ...doc.data() };
      });
      
      // 2. Mark the ended term as inactive.
      await db.collection('terms').doc(endedTerm.id).update({ status: 'inactive' });
      console.log(`Term ${endedTerm.id} marked as inactive.`);
      
      // 3. Find the next term.
      // query for the term with the earliest startDate that is greater than the ended term's endDate.
      const newTermQuery = await db.collection('terms')
        .where('startDate', '>', endedTerm.endDate)
        .orderBy('startDate', 'asc')
        .limit(1)
        .get();
      
      if (newTermQuery.empty) {
        console.log("No new term found.");
        return;
      }
      
      let newTerm: any;
      newTermQuery.forEach(doc => {
        newTerm = { id: doc.id, ...doc.data() };
      });
      
      // 4. Determine the status for the new term.
      const newTermStart = newTerm.startDate.toDate();
      const newStatus = (now >= newTermStart) ? 'active' : 'upcoming';
      await db.collection('terms').doc(newTerm.id).update({ status: newStatus });
      console.log(`Term ${newTerm.id} marked as ${newStatus}.`);
      
      // 5. For each class, generate attendance docs for the new term.
      const classesSnapshot = await db.collection('classes').get();
      const promises: Promise<void>[] = [];
      classesSnapshot.forEach(doc => {
        const classData = doc.data();
        // Compute the first session date for this class in the new term.
        const firstSessionDate = computeFirstSessionDate(newTermStart, classData.day);
        promises.push(
          generateAttendanceDocsForTerm(
            { id: doc.id, ...classData },
            newTerm,
            firstSessionDate
          )
        );
      });
      
      await Promise.all(promises);
      console.log("Attendance docs generated for new term on all classes.");
      
      return;
    } catch (error) {
      console.error("Error during term rollover:", error);
      throw new Error("Term rollover failed");
    }
  });
