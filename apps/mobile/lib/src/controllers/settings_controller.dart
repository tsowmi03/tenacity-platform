import 'package:flutter/material.dart';
import 'package:tenacity/src/services/settings_service.dart';

class SettingsController extends ChangeNotifier {
  final SettingsService _settingsService = SettingsService();

  bool isLoading = false;
  bool spotOpenedNotif = true;
  bool lessonReminderNotif = true;
  String? errorMessage;

  Future<void> loadSettings(String userId) async {
    isLoading = true;
    errorMessage = null;
    notifyListeners();

    try {
      final settings = await _settingsService.fetchUserSettings(userId);
      if (settings != null) {
        spotOpenedNotif = settings['spotOpened'] ?? true;
        lessonReminderNotif = settings['lessonReminder'] ?? true;
      }
    } catch (e) {
      errorMessage = "Failed to load notification settings. Please try again.";
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> updateSetting(String userId, String key, bool value) async {
    errorMessage = null;
    notifyListeners();
    try {
      await _settingsService.updateUserSetting(userId, key, value);
      if (key == "spotOpened") spotOpenedNotif = value;
      if (key == "lessonReminder") lessonReminderNotif = value;
    } catch (e) {
      errorMessage = "Failed to update setting. Please check your connection.";
    }
    notifyListeners();
  }
}
