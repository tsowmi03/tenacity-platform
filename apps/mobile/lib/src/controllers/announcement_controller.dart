import 'package:flutter/material.dart';
import '../models/announcement_model.dart';
import '../services/audit_service.dart';
import '../services/announcement_service.dart';
import '../utils/error_presenter.dart';

class AnnouncementsController extends ChangeNotifier {
  final AnnouncementService _service;
  final AuditService _auditService;

  AnnouncementsController({
    AnnouncementService? service,
    AuditService? auditService,
  })  : _service = service ?? AnnouncementService(),
        _auditService = auditService ?? AuditService();

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  /// Why the last load failed, as a sentence safe to show. Writes do not set
  /// it: each screen reports its own write failure, and this one is rendered
  /// under 'Announcements could not be loaded', which a failed create has not
  /// made true.
  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  List<Announcement> _announcements = [];
  List<Announcement> get announcements => _announcements;

  bool? _loadedOnlyActive;
  List<String>? _loadedAudienceFilter;

  Future<void> loadAnnouncements({
    required bool onlyActive,
    List<String>? audienceFilter,
    bool forceReload = false,
  }) async {
    final normalisedAudience = [...?audienceFilter]..sort();
    final sameQuery = _loadedOnlyActive == onlyActive &&
        _sameList(_loadedAudienceFilter, normalisedAudience);

    if (_announcements.isNotEmpty && sameQuery && !forceReload) {
      return;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final announcements = await _service.fetchAnnouncements(
        onlyActive: onlyActive,
        audienceFilter: normalisedAudience,
      );

      announcements.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      _announcements = announcements;
      _loadedOnlyActive = onlyActive;
      _loadedAudienceFilter = normalisedAudience;
    } catch (error, stackTrace) {
      // Pairs with the list's 'Announcements could not be loaded' heading when
      // there is nothing to show, so the reason alone.
      _errorMessage = presentError(
        error,
        action: 'load the announcements',
        operation: Operation.read,
        stackTrace: stackTrace,
      ).reason;
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  static bool _sameList(List<String>? left, List<String> right) {
    if (left == null || left.length != right.length) return false;
    for (var index = 0; index < left.length; index++) {
      if (left[index] != right[index]) return false;
    }
    return true;
  }

  Future<Announcement> addAnnouncement({
    required String title,
    required String body,
    required bool archived,
    required String audience,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final newDocId = await _service.addAnnouncement(
        title: title,
        body: body,
        archived: archived,
        audience: audience,
      );

      final newAnnouncement = Announcement(
        id: newDocId,
        title: title,
        body: body,
        archived: archived,
        audience: audience,
        createdAt: DateTime.now(),
      );

      _announcements.insert(0, newAnnouncement);
      _auditService.record(
        action: 'announcement.create',
        targetType: 'announcement',
        targetId: newDocId,
        targetName: title,
        payloadSummary: {
          'title': title,
          'audience': audience,
          'archived': archived,
        },
      );
      return newAnnouncement;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> deleteAnnouncement(String docId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      Announcement? announcement;
      for (final item in _announcements) {
        if (item.id == docId) {
          announcement = item;
          break;
        }
      }
      await _service.deleteAnnouncement(docId);

      // Remove it from the local list
      _announcements.removeWhere((a) => a.id == docId);
      _auditService.record(
        action: 'announcement.delete',
        targetType: 'announcement',
        targetId: docId,
        targetName: announcement?.title ?? docId,
        payloadSummary: {
          'title': announcement?.title,
          'audience': announcement?.audience,
        },
        before: {
          'archived': announcement?.archived,
        },
        after: {
          'deleted': true,
        },
      );
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<Announcement> updateAnnouncement({
    required Announcement announcement,
    required String title,
    required String body,
    required bool archived,
    required String audience,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.updateAnnouncement(
        docId: announcement.id,
        title: title,
        body: body,
        archived: archived,
        audience: audience,
      );

      final updated = announcement.copyWith(
        title: title,
        body: body,
        archived: archived,
        audience: audience,
      );
      _replaceAnnouncement(updated);
      _auditService.record(
        action: 'announcement.update',
        targetType: 'announcement',
        targetId: announcement.id,
        targetName: title,
        payloadSummary: {
          'changedFields': AuditService.changedFields(
            {
              'title': announcement.title,
              'body': announcement.body,
              'audience': announcement.audience,
              'archived': announcement.archived,
            },
            {
              'title': title,
              'body': body,
              'audience': audience,
              'archived': archived,
            },
          ),
        },
        before: {
          'title': announcement.title,
          'body': announcement.body,
          'audience': announcement.audience,
          'archived': announcement.archived,
        },
        after: {
          'title': title,
          'body': body,
          'audience': audience,
          'archived': archived,
        },
      );
      return updated;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<Announcement> setAnnouncementArchived({
    required Announcement announcement,
    required bool archived,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      await _service.setAnnouncementArchived(announcement.id, archived);
      final updated = announcement.copyWith(archived: archived);
      _replaceAnnouncement(updated);
      _auditService.record(
        action: archived ? 'announcement.archive' : 'announcement.restore',
        targetType: 'announcement',
        targetId: announcement.id,
        targetName: announcement.title,
        before: {'archived': announcement.archived},
        after: {'archived': archived},
      );
      return updated;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void _replaceAnnouncement(Announcement updated) {
    final index = _announcements.indexWhere((item) => item.id == updated.id);
    if (index == -1) {
      _announcements.insert(0, updated);
    } else {
      _announcements[index] = updated;
    }
    _announcements.sort((a, b) => b.createdAt.compareTo(a.createdAt));
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
