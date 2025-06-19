const admin = require('firebase-admin');

process.env.GOOGLE_CLOUD_PROJECT = "tenacity-tutoring-b8eb2";
admin.initializeApp();

const db = admin.firestore();

async function markAllAnnouncementsRead() {
  // Fetch all announcement IDs
  const announcementsSnap = await db.collection('announcements').get();
  const announcementIds = announcementsSnap.docs.map(doc => doc.id);

  if (announcementIds.length === 0) {
    console.log('No announcements found.');
    process.exit(0);
  }

  // Fetch all users
  const usersSnap = await db.collection('users').get();
  let updatedCount = 0;

  for (const userDoc of usersSnap.docs) {
    await userDoc.ref.update({
      readAnnouncements: announcementIds
    });
    updatedCount++;
    console.log(`Updated user ${userDoc.id} with ${announcementIds.length} announcements.`);
  }

  console.log(`Done. Updated ${updatedCount} users.`);
  process.exit(0);
}

markAllAnnouncementsRead().catch(err => {
  console.error('Script failed', err);
  process.exit(1);
});