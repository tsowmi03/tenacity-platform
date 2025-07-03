import 'package:cloud_firestore/cloud_firestore.dart';

class SettingsService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  Future<Map<String, dynamic>?> fetchUserSettings(String userId) async {
    try {
      final doc = await _db.collection('userSettings').doc(userId).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (e) {
      rethrow;
    }
  }

  Future<void> updateUserSetting(String userId, String key, bool value) async {
    try {
      await _db.collection('userSettings').doc(userId).set(
        {key: value},
        SetOptions(merge: true),
      );
    } catch (e) {
      rethrow;
    }
  }
}
