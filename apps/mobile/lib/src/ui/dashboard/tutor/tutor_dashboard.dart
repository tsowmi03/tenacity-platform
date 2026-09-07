import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/services/tutor_session_service.dart';
import 'package:tenacity/src/ui/components/screen_skeletons.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_view.dart';
import 'package:tenacity/src/ui/home_navigation.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/tab_visibility.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/refresh_throttle.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

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

  /// Injectable so widget tests can drive a second load without waiting out
  /// the real interval. Left null it throttles as it does in the app.
  final RefreshThrottle? refreshThrottle;

  const TutorDashboard({
    super.key,
    required this.tutorId,
    required this.tutorName,
    required this.onNavigate,
    this.sessionService,
    this.refreshThrottle,
  });

  @override
  State<TutorDashboard> createState() => _TutorDashboardState();
}

class _TutorDashboardState extends State<TutorDashboard>
    with TabVisibilityAware<TutorDashboard> {
  /// The builders below re-present the same snapshot on every rebuild;
  /// this keeps one failure to one log entry.
  final _errorPresentation = ErrorPresentationCache();
  late final TutorSessionService _sessionService =
      widget.sessionService ?? TutorSessionService();
  Future<TutorDashboardViewData>? _dashboardFuture;

  /// The last data that loaded cleanly, kept so a background refresh has
  /// something to render behind it. Without this the dashboard fell back to a
  /// full-screen spinner every time it reloaded.
  TutorDashboardViewData? _lastData;

  late final RefreshThrottle _refreshThrottle =
      widget.refreshThrottle ?? RefreshThrottle();

  /// Loads on first build, and refreshes each time the user comes back to the
  /// Home tab — which no longer remounts this widget.
  @override
  void onTabVisible() {
    if (!_refreshThrottle.shouldRefresh) return;
    // Forced, deliberately: the skip-if-loaded guards below are right for a
    // cold start, but with the tab kept alive they would otherwise leave the
    // dashboard showing the same rolls indefinitely.
    _startLoad(force: true);
  }

  @override
  void didUpdateWidget(covariant TutorDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tutorId != widget.tutorId) {
      // A different tutor: what is on screen belongs to the previous one.
      _lastData = null;
      _refreshThrottle.reset();
      _startLoad(force: true);
    }
  }

  void _startLoad({required bool force}) {
    // Started outside setState: the call returns a Future, and setState
    // rejects a closure that hands one back.
    final future = _loadDashboard(force: force);
    // The FutureBuilder below is what reports a failure. This second listener
    // only stops the same error *also* being reported as an unhandled async
    // error, which it otherwise is whenever the load fails before the builder
    // has had a frame to subscribe.
    unawaited(future.then((_) {}, onError: (Object _) {}));
    setState(() {
      _dashboardFuture = future;
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

    final data = buildTutorDashboardViewData(
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

    _lastData = data;
    _refreshThrottle.markRefreshed();
    return data;
  }

  Future<void> _refresh() async {
    final future = _loadDashboard(force: true);
    setState(() {
      _dashboardFuture = future;
    });
    await future;
  }

  Future<void> _retry() async {
    // An explicit retry should not be turned away by the throttle.
    _refreshThrottle.reset();
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<TutorDashboardViewData>(
      future: _dashboardFuture,
      builder: (context, snapshot) {
        // The last good load wins over an in-flight or failed refresh: a
        // background reload should never replace a working dashboard with a
        // spinner, and a refresh that fails should not replace it with an
        // error screen either. Both only show when there is nothing to fall
        // back to.
        final data = snapshot.data ?? _lastData;

        if (data == null && snapshot.hasError) {
          return _DashboardMessage(
            reason: _errorPresentation
                .present(
                  snapshot.error!,
                  action: 'load your dashboard',
                  operation: Operation.read,
                  stackTrace: snapshot.stackTrace,
                )
                .reason,
            onRetry: _retry,
          );
        }

        if (data == null) {
          return const DashboardSkeleton(
            key: Key('tutor-dashboard-loading'),
            metricCount: 3,
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
  /// Why the load failed, already made safe to show. The heading above says
  /// what failed, so this is the reason on its own.
  final String reason;
  final Future<void> Function() onRetry;

  const _DashboardMessage({required this.reason, required this.onRetry});

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
                  Icons.error_outline_rounded,
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
                  reason,
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
