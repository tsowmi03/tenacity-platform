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
    _isLoading = true;
    notifyListeners();

    _announcements = await _service.fetchAnnouncements(
      onlyActive: onlyActive,
      audienceFilter: audienceFilter,
    );

    _announcements.sort((a, b) => b.createdAt.compareTo(a.createdAt));

    _isLoading = false;
    notifyListeners();
  }

  Future<void> addAnnouncement({
    required String title,
    required String body,
    required bool archived,
    required String audience,
  }) async {
    _isLoading = true;
    notifyListeners();

    try {
      final newDocId = await _service.addAnnouncement(
        title: title,
        body: body,
        archived: archived,
        audience: audience,
      );

      // Construct a local model instance.
      final newAnnouncement = Announcement(
        id: newDocId,
        title: title,
        body: body,
        archived: archived,
        audience: audience,
        createdAt: DateTime.now(),
      );

      //Insert into local list so UI shows it right away
      _announcements.insert(0, newAnnouncement);

    } catch (error) {
      debugPrint("Error adding announcement: $error");
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<void> deleteAnnouncement(String docId) async {
    _isLoading = true;
    notifyListeners();

    try {
      await _service.deleteAnnouncement(docId);

      // Remove it from the local list
      _announcements.removeWhere((a) => a.id == docId);

    } catch (error) {
      debugPrint("Error deleting announcement: $error");
    }

    _isLoading = false;
    notifyListeners();
  }

  Future<Announcement?> fetchAnnouncementById(String announcementId) async {
    return _service.fetchAnnouncementById(announcementId);
  }

  Future<Announcement?> fetchSingleLatest() async {
    try {
      return await _service.fetchLatestAnnouncement();
    } catch (e) {
      debugPrint("Error fetching latest announcement: $e");
      return null;
    }
  }
}
