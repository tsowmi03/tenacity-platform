import 'package:flutter/material.dart';
import '../models/announcement_model.dart';
import '../services/announcement_service.dart';

class AnnouncementsController extends ChangeNotifier {
  final AnnouncementService _service = AnnouncementService();

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  List<Announcement> _announcements = [];
  List<Announcement> get announcements => _announcements;

  Future<void> loadAnnouncements({
    required bool onlyActive,
    List<String>? audienceFilter,
  }) async {
    debugPrint(
        '🔵 [loadAnnouncements] called with onlyActive=$onlyActive, audienceFilter=$audienceFilter');
    _isLoading = true;
    notifyListeners();

    try {
      debugPrint(
          '🟡 [loadAnnouncements] Fetching announcements from service...');
      _announcements = await _service.fetchAnnouncements(
        onlyActive: onlyActive,
        audienceFilter: audienceFilter,
      );
      debugPrint(
          '🟢 [loadAnnouncements] Fetched ${_announcements.length} announcements');
    } catch (e, st) {
      debugPrint('🔴 [loadAnnouncements] ERROR: $e\n$st');
    } finally {
      _isLoading = false;
      notifyListeners();
      debugPrint('⚪ [loadAnnouncements] Done. isLoading=$_isLoading');
    }
  }

  Future<void> addAnnouncement({
    required String title,
    required String body,
    required bool archived,
    required String audience,
  }) async {
    debugPrint(
        '🔵 [addAnnouncement] called with title="$title", archived=$archived, audience="$audience"');
    _isLoading = true;
    notifyListeners();

    try {
      debugPrint('🟡 [addAnnouncement] Adding announcement to service...');
      final newDocId = await _service.addAnnouncement(
        title: title,
        body: body,
        archived: archived,
        audience: audience,
      );
      debugPrint('🟢 [addAnnouncement] Added announcement with id=$newDocId');

      final newAnnouncement = Announcement(
        id: newDocId,
        title: title,
        body: body,
        archived: archived,
        audience: audience,
        createdAt: DateTime.now(),
      );

      _announcements.insert(0, newAnnouncement);
      debugPrint('🟢 [addAnnouncement] Inserted new announcement locally');
    } catch (error, st) {
      debugPrint("🔴 [addAnnouncement] ERROR: $error\n$st");
    }

    _isLoading = false;
    notifyListeners();
    debugPrint('⚪ [addAnnouncement] Done. isLoading=$_isLoading');
  }

  Future<void> deleteAnnouncement(String docId) async {
    debugPrint('🔵 [deleteAnnouncement] called with docId="$docId"');
    _isLoading = true;
    notifyListeners();

    try {
      debugPrint(
          '🟡 [deleteAnnouncement] Deleting announcement from service...');
      await _service.deleteAnnouncement(docId);
      debugPrint('🟢 [deleteAnnouncement] Deleted from service');

      _announcements.removeWhere((a) => a.id == docId);
      debugPrint('🟢 [deleteAnnouncement] Removed from local list');
    } catch (error, st) {
      debugPrint("🔴 [deleteAnnouncement] ERROR: $error\n$st");
    }

    _isLoading = false;
    notifyListeners();
    debugPrint('⚪ [deleteAnnouncement] Done. isLoading=$_isLoading');
  }

  Future<Announcement?> fetchAnnouncementById(String announcementId) async {
    debugPrint('🔵 [fetchAnnouncementById] called with id="$announcementId"');
    try {
      final result = await _service.fetchAnnouncementById(announcementId);
      debugPrint('🟢 [fetchAnnouncementById] Result: $result');
      return result;
    } catch (e, st) {
      debugPrint("🔴 [fetchAnnouncementById] ERROR: $e\n$st");
      return null;
    }
  }

  Future<Announcement?> fetchSingleLatest() async {
    debugPrint('🔵 [fetchSingleLatest] called');
    try {
      final result = await _service.fetchLatestAnnouncement();
      debugPrint('🟢 [fetchSingleLatest] Result: $result');
      return result;
    } catch (e, st) {
      debugPrint("🔴 [fetchSingleLatest] ERROR: $e\n$st");
      return null;
    }
  }

  Future<int> getUnreadAnnouncementsCount(
      String userId, String userRole) async {
    debugPrint(
        '🔵 [getUnreadAnnouncementsCount] called with userId="$userId", userRole="$userRole"');
    await loadAnnouncements(
        onlyActive: true, audienceFilter: ['all', userRole]);
    final allAnnouncements = _announcements;
    debugPrint(
        '🟡 [getUnreadAnnouncementsCount] Announcements loaded: ${allAnnouncements.length}');
    final readIds = await _service.fetchReadAnnouncementIdsForUser(userId);
    debugPrint('🟡 [getUnreadAnnouncementsCount] Read IDs: $readIds');
    final unreadCount =
        allAnnouncements.where((a) => !readIds.contains(a.id)).length;
    debugPrint('🟢 [getUnreadAnnouncementsCount] Unread count: $unreadCount');
    return unreadCount;
  }

  Future<void> markAnnouncementAsRead(
      String userId, String announcementId) async {
    debugPrint(
        '🔵 [markAnnouncementAsRead] called with userId="$userId", announcementId="$announcementId"');
    try {
      await _service.markAnnouncementAsRead(userId, announcementId);
      debugPrint('🟢 [markAnnouncementAsRead] Marked as read');
    } catch (e, st) {
      debugPrint('🔴 [markAnnouncementAsRead] ERROR: $e\n$st');
    }
  }
}
