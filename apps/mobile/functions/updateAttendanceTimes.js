const admin = require('firebase-admin');
const { DateTime } = require('luxon');

process.env.GOOGLE_CLOUD_PROJECT = "tenacity-tutoring-b8eb2";
admin.initializeApp();

const db = admin.firestore();
const SYDNEY_TZ = 'Australia/Sydney';

async function updateAttendanceTimes() {
  const classesSnap = await db.collection('classes').get();
  for (const classDoc of classesSnap.docs) {
    const classId = classDoc.id;
    const classData = classDoc.data();
    const startTime = classData.startTime; // e.g., "17:00"
    if (!startTime || !startTime.includes(':')) {
      console.log(`Skipping class ${classId} (no startTime)`);
      continue;
    }
    const [hour, minute] = startTime.split(':').map(Number);

    // Query only FUTURE attendance docs (date >= now)
    const attendanceSnap = await db
      .collection(`classes/${classId}/attendance`)
      .where('date', '>=', admin.firestore.Timestamp.now())
      .get();

    for (const attDoc of attendanceSnap.docs) {
      const attData = attDoc.data();
      if (!attData.date) {
        console.log(`Attendance doc ${attDoc.id} in class ${classId} has no date; skipping.`);
        continue;
      }
      const oldDate = attData.date.toDate(); // JS Date (usually at midnight)
      const localDate = DateTime.fromJSDate(oldDate, { zone: SYDNEY_TZ });
      // Combine date with startTime, keeping the date, setting the correct time
      const newDateTimeSydney = localDate.set({ hour, minute, second: 0, millisecond: 0 });
      // Convert to UTC for Firestore
      const newTimestamp = admin.firestore.Timestamp.fromDate(newDateTimeSydney.toUTC().toJSDate());

      // Only update if necessary
      if (attData.date.seconds !== newTimestamp.seconds) {
        await attDoc.ref.update({ date: newTimestamp });
        console.log(`✅ Updated ${attDoc.ref.path}: ${oldDate} → ${newDateTimeSydney.toISO()}`);
      } else {
        console.log(`— No change needed for ${attDoc.ref.path}`);
      }
    }
  }
  console.log('🎉 Done updating all future attendance docs!');
}

updateAttendanceTimes().catch((err) => {
  console.error('Error updating attendance docs:', err);
  process.exit(1);
});