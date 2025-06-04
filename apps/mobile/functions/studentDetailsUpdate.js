const admin = require('firebase-admin');

process.env.GOOGLE_CLOUD_PROJECT = "tenacity-tutoring-b8eb2";
admin.initializeApp();

const db = admin.firestore();

async function migrateStudentData() {
  const enrolmentsSnap = await db.collection('enrolments').get();
  let updatedCount = 0;

  for (const enrolmentDoc of enrolmentsSnap.docs) {
    const enrolment = enrolmentDoc.data();
    const { studentFirstName, studentLastName, studentDOB, studentSubjects, carerEmail } = enrolment;

    if (!studentFirstName || !studentLastName || !carerEmail) {
      console.log(`Skipping enrolment ${enrolmentDoc.id}: missing student or parent info`);
      continue;
    }

    // Find parent user by email
    const parentSnap = await db.collection('users')
      .where('email', '==', carerEmail)
      .where('role', '==', 'parent')
      .get();

    if (parentSnap.empty) {
      console.log(`No parent found for enrolment ${enrolmentDoc.id} (${carerEmail})`);
      continue;
    }

    // For each parent, check their students array
    for (const parentDoc of parentSnap.docs) {
      const parent = parentDoc.data();
      const studentIds = parent.students || [];
      for (const studentId of studentIds) {
        const studentRef = db.collection('students').doc(studentId);
        const studentDoc = await studentRef.get();
        if (!studentDoc.exists) continue;
        const student = studentDoc.data();

        // Match by name (case-insensitive, trimmed)
        if (
          student.firstName?.trim().toLowerCase() === studentFirstName.trim().toLowerCase() &&
          student.lastName?.trim().toLowerCase() === studentLastName.trim().toLowerCase()
        ) {
          // Prepare update
          const updateData = {};
          if (studentDOB) updateData.dob = studentDOB;
          if (studentSubjects) updateData.subjects = studentSubjects;
          if (Object.keys(updateData).length > 0) {
            await studentRef.update(updateData);
            updatedCount++;
            console.log(`Updated student ${studentId} from enrolment ${enrolmentDoc.id}`);
          }
        }
      }
    }
  }
  console.log(`Migration complete. Updated ${updatedCount} student docs.`);
  process.exit(0);
}

migrateStudentData().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});