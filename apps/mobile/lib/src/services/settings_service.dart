import 'package:cloud_firestore/cloud_firestore.dart';

abstract class SettingsRepository {
  Future<Map<String, dynamic>?> fetchUserSettings(String userId);

  Future<void> updateUserSetting(String userId, String key, bool value);
}

class SettingsService implements SettingsRepository {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  @override
  Future<Map<String, dynamic>?> fetchUserSettings(String userId) async {
    try {
      final doc = await _db.collection('userSettings').doc(userId).get();
      if (!doc.exists) return null;
      return doc.data();
    } catch (e) {
      rethrow;
    }
  }

  @override
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
