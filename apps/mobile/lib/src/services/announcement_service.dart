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
}
