const admin = require('firebase-admin');

process.env.GOOGLE_CLOUD_PROJECT = "tenacity-tutoring-b8eb2";
admin.initializeApp();

const db = admin.firestore();

async function migrateLessonTokens() {
  // Set lessonTokens: 0 for all parents
  const parentsSnap = await db.collection('users').where('role', '==', 'parent').get();
  for (const parentDoc of parentsSnap.docs) {
    await parentDoc.ref.update({ lessonTokens: 0 });
    console.log(`Parent ${parentDoc.id}: set lessonTokens to 0`);
  }

  // Remove lessonTokens from all students
  const studentsSnap = await db.collection('students').get();
  for (const studentDoc of studentsSnap.docs) {
    await studentDoc.ref.update({ lessonTokens: admin.firestore.FieldValue.delete() });
    console.log(`Student ${studentDoc.id}: removed lessonTokens`);
  }
}

migrateLessonTokens().then(() => {
  console.log('Migration complete');
  process.exit(0);
}).catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});