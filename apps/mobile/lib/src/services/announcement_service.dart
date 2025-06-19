import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/announcement_model.dart';

class AnnouncementService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  Future<List<Announcement>> fetchAnnouncements({
    bool onlyActive = true,
    List<String>? audienceFilter = const [],
  }) async {
    Query query =
        _db.collection('announcements').orderBy('createdAt', descending: true);
    if (onlyActive) {
      query = query.where('archived', isEqualTo: false);
    }

    if (audienceFilter != null && audienceFilter.isNotEmpty) {
      query = query.where('audience', whereIn: audienceFilter);
    }

    final snapshot = await query.get();
    return snapshot.docs
        .map((doc) => Announcement.fromFirestore(
            doc.data() as Map<String, dynamic>, doc.id))
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
    return Announcement.fromFirestore(
        doc.data() as Map<String, dynamic>, doc.id);
  }

  Future<Announcement?> fetchLatestAnnouncement() async {
    final query = await _db
        .collection('announcements')
        .where('archived', isEqualTo: false)
        .orderBy('createdAt', descending: true)
        .limit(1)
        .get();

    if (query.docs.isEmpty) return null;
    final doc = query.docs.first;
    return Announcement.fromFirestore(doc.data(), doc.id);
  }

  Future<List<String>> fetchReadAnnouncementIdsForUser(String userId) async {
    final doc = await _db.collection('users').doc(userId).get();
    final data = doc.data();
    if (data == null) return [];
    final list = data['readAnnouncements'] as List<dynamic>? ?? [];
    return list.map((e) => e.toString()).toList();
  }

  Future<void> markAnnouncementAsRead(
      String userId, String announcementId) async {
    await _db.collection('users').doc(userId).update({
      'readAnnouncements': FieldValue.arrayUnion([announcementId])
    });
  }
}
