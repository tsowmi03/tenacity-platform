import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/services/tutor_session_service.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_view.dart';
import 'package:tenacity/src/ui/home_navigation.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Loads the tutor dashboard's data and hands it to [TutorDashboardView].
///
/// Keeping the loading here means the view stays pure and testable, and the
/// data derivation stays in `buildTutorDashboardViewData`.
class TutorDashboard extends StatefulWidget {
  final String tutorId;
  final String tutorName;
  final void Function(AppDestination) onNavigate;

  /// Injectable so widget tests can supply a stub. Left null it is created
  /// lazily, on the first load that actually has a session to check, which
  /// keeps a test that never reaches that point clear of Firebase.
  final TutorSessionService? sessionService;

  const TutorDashboard({
    super.key,
    required this.tutorId,
    required this.tutorName,
    required this.onNavigate,
    this.sessionService,
  });

  @override
  State<TutorDashboard> createState() => _TutorDashboardState();
}

class _TutorDashboardState extends State<TutorDashboard> {
  late final TutorSessionService _sessionService =
      widget.sessionService ?? TutorSessionService();
  Future<TutorDashboardViewData>? _dashboardFuture;
  bool _dashboardLoadScheduled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_dashboardFuture == null) _scheduleDashboardLoad();
  }

  @override
  void didUpdateWidget(covariant TutorDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tutorId != widget.tutorId) {
      _dashboardFuture = null;
      _scheduleDashboardLoad();
    }
  }

  void _scheduleDashboardLoad() {
    if (_dashboardLoadScheduled) return;
    _dashboardLoadScheduled = true;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _dashboardLoadScheduled = false;
      if (!mounted || _dashboardFuture != null) return;

      setState(() {
        _dashboardFuture = _loadDashboard();
      });
    });
  }

  Future<TutorDashboardViewData> _loadDashboard({bool force = false}) async {
    final timetableController = context.read<TimetableController>();
    final chatController = context.read<ChatController>();
    final announcementsController = context.read<AnnouncementsController>();

    final unreadFuture = chatController.getUnreadCount();
    final announcementsFuture = announcementsController.loadAnnouncements(
      onlyActive: true,
      audienceFilter: const ['all', 'tutor'],
      forceReload: force,
    );

    if (force || timetableController.activeTerm == null) {
      await timetableController.loadActiveTerm(silent: true);
    }
    if (force || timetableController.allClasses.isEmpty) {
      await timetableController.loadAllClasses(silent: true);
    }
    final activeTerm = timetableController.activeTerm;
    final expectedAttendanceDocId = activeTerm == null
        ? null
        : '${activeTerm.id}_W${timetableController.currentWeek}';
    if (activeTerm != null &&
        (force ||
            timetableController.loadedAttendanceDocId !=
                expectedAttendanceDocId)) {
      await timetableController.loadAttendanceForWeek(silent: true);
    }

    final unreadMessages = await unreadFuture;
    await announcementsFuture;
    final announcements = announcementsController.announcements;

    // Best-effort, like the other supporting reads. Null on failure, not an
    // empty map: empty would read as "nothing written yet" and raise a
    // feedback-due row against every finished roll.
    Map<String, Set<String>>? feedbackStudentIdsByClass;
    if (expectedAttendanceDocId != null) {
      try {
        feedbackStudentIdsByClass = await _sessionService
            .feedbackStudentIdsForSession(sessionId: expectedAttendanceDocId);
      } catch (_) {
        feedbackStudentIdsByClass = null;
      }
    }

    return buildTutorDashboardViewData(
      tutorId: widget.tutorId,
      tutorName: widget.tutorName,
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      currentWeek: timetableController.currentWeek,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      unreadMessages: unreadMessages,
      latestAnnouncement: announcements.isEmpty ? null : announcements.first,
      feedbackStudentIdsByClass: feedbackStudentIdsByClass,
    );
  }

  Future<void> _refresh() async {
    final future = _loadDashboard(force: true);
    setState(() => _dashboardFuture = future);
    await future;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<TutorDashboardViewData>(
      future: _dashboardFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _DashboardMessage(onRetry: _refresh);
        }

        final data = snapshot.data;
        if (data == null) {
          return const ColoredBox(
            color: AppColors.ink,
            child: SafeArea(
              child: Center(
                child: CircularProgressIndicator(color: AppColors.blue300),
              ),
            ),
          );
        }

        return TutorDashboardView(
          data: data,
          onRefresh: _refresh,
          onOpenClasses: () => widget.onNavigate(AppDestination.classes),
          onOpenMessages: () => widget.onNavigate(AppDestination.messages),
          onOpenAnnouncements: () =>
              widget.onNavigate(AppDestination.announcements),
          onOpenProfile: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            );
          },
        );
      },
    );
  }
}

/// Full-screen failure state, styled for the navy dashboard background rather
/// than the white content sheet.
class _DashboardMessage extends StatelessWidget {
  final Future<void> Function() onRetry;

  const _DashboardMessage({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.ink,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.cloud_off_outlined,
                  size: 38,
                  color: Colors.white70,
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  'Dashboard unavailable',
                  style: AppText.display(fontSize: 20, color: Colors.white),
                ),
                const SizedBox(height: 6),
                Text(
                  'Check your connection and try again.',
                  textAlign: TextAlign.center,
                  style: AppText.body(fontSize: 14, color: Colors.white70),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: onRetry,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.blue,
                  ),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
