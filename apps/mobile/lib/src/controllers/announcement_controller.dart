import 'package:flutter/material.dart';
import '../models/announcement_model.dart';
import '../services/announcement_service.dart';

class AnnouncementsController extends ChangeNotifier {
  final AnnouncementService _service = AnnouncementService();

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  List<Announcement> _announcements = [];
  List<Announcement> get announcements => _announcements;

  Future<void> loadAnnouncements() async {
    _isLoading = true;
    notifyListeners();

    _announcements = await _service.fetchAnnouncements(onlyActive: true);

    _isLoading = false;
    notifyListeners();
  }
}
