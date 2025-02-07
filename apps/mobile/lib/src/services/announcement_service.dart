import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/announcement_model.dart';

class AnnouncementService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  Future<List<Announcement>> fetchAnnouncements({bool onlyActive = true}) async {
    Query query = _db.collection('announcements');
    if (onlyActive) {
      query = query.where('archived', isEqualTo: false);
    }

    final snapshot = await query.get();
    return snapshot.docs
        .map((doc) => Announcement.fromFirestore(doc.data() as Map<String, dynamic>, doc.id))
        .toList();
  }

  Future<String> addAnnouncement({
    required String title,
    required String body,
    required bool archived,
    required String audience,
  }) async {
    final docRef = await _db.collection('announcements').add({
      'title': title,
      'body': body,
      'archived': archived,
      'audience': audience,
      'createdAt': FieldValue.serverTimestamp(),
    });

    return docRef.id;
  }

  /// Permanently deletes an announcement document by ID.
  Future<void> deleteAnnouncement(String docId) async {
    await _db.collection('announcements').doc(docId).delete();
  }

  Future<Announcement?> fetchAnnouncementById(String docId) async {
    final doc = await _db.collection('announcements').doc(docId).get();
    if (!doc.exists) return null;
    return Announcement.fromFirestore(doc.data() as Map<String, dynamic>, doc.id);
  }
}
