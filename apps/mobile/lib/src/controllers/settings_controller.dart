import 'package:flutter/material.dart';
import 'package:tenacity/src/services/settings_service.dart';

class SettingsController extends ChangeNotifier {
  SettingsController({SettingsRepository? settingsService})
      : _settingsService = settingsService ?? SettingsService();

  final SettingsRepository _settingsService;

  bool isLoading = false;
  bool spotOpenedNotif = true;
  bool lessonReminderNotif = true;
  String? errorMessage;
  String? loadedUserId;
  final Set<String> _updatingKeys = {};
  int _loadGeneration = 0;
  bool _isDisposed = false;

  bool isUpdating(String key) => _updatingKeys.contains(key);

  Future<void> loadSettings(String userId) async {
    final generation = ++_loadGeneration;
    isLoading = true;
    errorMessage = null;
    loadedUserId = userId;
    spotOpenedNotif = true;
    lessonReminderNotif = true;
    _updatingKeys.clear();
    notifyListeners();

    try {
      final settings = await _settingsService.fetchUserSettings(userId);
      if (generation != _loadGeneration) return;
      if (settings != null) {
        spotOpenedNotif = settings['spotOpened'] ?? true;
        lessonReminderNotif = settings['lessonReminder'] ?? true;
      }
    } catch (e) {
      if (generation != _loadGeneration) return;
      errorMessage = 'Notification settings could not be loaded.';
    } finally {
      if (generation == _loadGeneration) {
        isLoading = false;
        notifyListeners();
      }
    }
  }

  Future<bool> updateSetting(String userId, String key, bool value) async {
    if (loadedUserId != userId || _updatingKeys.contains(key)) return false;

    errorMessage = null;
    _updatingKeys.add(key);
    notifyListeners();
    try {
      await _settingsService.updateUserSetting(userId, key, value);
      if (loadedUserId != userId) return false;
      if (key == "spotOpened") spotOpenedNotif = value;
      if (key == "lessonReminder") lessonReminderNotif = value;
      return true;
    } catch (e) {
      if (loadedUserId == userId) {
        errorMessage =
            'That notification setting could not be saved. Please try again.';
      }
      return false;
    } finally {
      _updatingKeys.remove(key);
      if (!_isDisposed) notifyListeners();
    }
  }

  @override
  void dispose() {
    _isDisposed = true;
    _loadGeneration++;
    super.dispose();
  }
}
