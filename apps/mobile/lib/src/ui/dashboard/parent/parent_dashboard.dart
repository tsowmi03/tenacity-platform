import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/components/screen_skeletons.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_view.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:tenacity/src/ui/home_navigation.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/tab_visibility.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/refresh_throttle.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

/// Loads the parent dashboard's data and hands it to [ParentDashboardView].
///
/// Every read is best-effort: a family should still see today's classes when,
/// say, the feedback query fails. Only a failure to load the timetable — the
/// dashboard's main content — surfaces as an error state.
class ParentDashboard extends StatefulWidget {
  final String parentId;
  final String parentName;
  final List<String> readAnnouncementIds;
  final void Function(AppDestination) onNavigate;

  /// Injectable so widget tests can drive a second load without waiting out
  /// the real interval. Left null it throttles as it does in the app.
  final RefreshThrottle? refreshThrottle;

  const ParentDashboard({
    super.key,
    required this.parentId,
    required this.parentName,
    required this.readAnnouncementIds,
    required this.onNavigate,
    this.refreshThrottle,
  });

  @override
  State<ParentDashboard> createState() => _ParentDashboardState();
}

class _ParentDashboardState extends State<ParentDashboard>
    with TabVisibilityAware<ParentDashboard> {
  Future<ParentDashboardViewData>? _dashboardFuture;

  /// The last data that loaded cleanly, kept so a background refresh has
  /// something to render behind it. Without this the dashboard fell back to a
  /// full-screen spinner every time it reloaded.
  ParentDashboardViewData? _lastData;

  late final RefreshThrottle _refreshThrottle =
      widget.refreshThrottle ?? RefreshThrottle();

  /// Loads on first build, and refreshes each time the user comes back to the
  /// Home tab — which no longer remounts this widget.
  @override
  void onTabVisible() {
    if (!_refreshThrottle.shouldRefresh) return;
    // Forced, deliberately: `_loadTimetable`'s skip-if-loaded guard is right
    // for a cold start, but with the tab kept alive it would otherwise leave
    // the dashboard showing the same numbers indefinitely.
    _startLoad(force: true);
  }

  @override
  void didUpdateWidget(covariant ParentDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.parentId != widget.parentId) {
      // A different family: what is on screen belongs to the previous one.
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

  Future<ParentDashboardViewData> _loadDashboard({bool force = false}) async {
    final timetableController = context.read<TimetableController>();
    final chatController = context.read<ChatController>();
    final announcementsController = context.read<AnnouncementsController>();
    final invoiceController = context.read<InvoiceController>();
    final feedbackController = context.read<FeedbackController>();
    final authController = context.read<AuthController>();

    // Kick off the independent reads together — they do not depend on the
    // timetable and each other, and a family dashboard should not take the sum
    // of six round trips.
    final unreadFuture = _orDefault(chatController.getUnreadCount(), 0);
    final childrenFuture = _orDefault(
      authController.fetchStudentsForParent(widget.parentId),
      const <Student>[],
    );
    final invoicesFuture = _orDefault(
      invoiceController.fetchInvoicesForParent(widget.parentId),
      const <Invoice>[],
    );
    final announcementsFuture = announcementsController
        .loadAnnouncements(
          onlyActive: true,
          audienceFilter: const ['all', 'parent'],
          forceReload: force,
        )
        .catchError((_) {});

    await _loadTimetable(timetableController, force: force);

    final children = await childrenFuture;
    final latestFeedback =
        await _latestFeedbackFor(feedbackController, children);
    final tutorNames = latestFeedback == null
        ? const <String, String>{}
        : await _orDefault(
            authController.fetchTutorNamesByIds([latestFeedback.tutorId]),
            const <String, String>{},
          );

    final unreadMessages = await unreadFuture;
    final invoices = await invoicesFuture;
    await announcementsFuture;

    final data = buildParentDashboardViewData(
      parentName: widget.parentName,
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      currentWeek: timetableController.currentWeek,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      children: children,
      unreadMessages: unreadMessages,
      invoices: invoices,
      announcements: announcementsController.announcements,
      readAnnouncementIds: widget.readAnnouncementIds,
      latestFeedback: latestFeedback,
      tutorNamesById: tutorNames,
    );

    _lastData = data;
    _refreshThrottle.markRefreshed();
    return data;
  }

  Future<void> _loadTimetable(
    TimetableController controller, {
    required bool force,
  }) async {
    if (force || controller.activeTerm == null) {
      await controller.loadActiveTerm(silent: true);
    }
    if (force || controller.allClasses.isEmpty) {
      await controller.loadAllClasses(silent: true);
    }

    final activeTerm = controller.activeTerm;
    if (activeTerm == null) return;

    final expectedAttendanceDocId =
        '${activeTerm.id}_W${controller.currentWeek}';
    if (force || controller.loadedAttendanceDocId != expectedAttendanceDocId) {
      await controller.loadAttendanceForWeek(silent: true);
    }
  }

  /// The most recent note across all of the parent's children.
  Future<StudentFeedback?> _latestFeedbackFor(
    FeedbackController controller,
    List<Student> children,
  ) async {
    if (children.isEmpty) return null;

    final perChild = await Future.wait(
      children.map(
        (child) => _orDefault(
          controller.getFeedbackByStudentId(child.id).first,
          const <StudentFeedback>[],
        ),
      ),
    );

    final all = perChild.expand((list) => list).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    return all.isEmpty ? null : all.first;
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

  void _openFeedback(String studentId) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => FeedbackScreen(studentId: studentId)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ParentDashboardViewData>(
      future: _dashboardFuture,
      builder: (context, snapshot) {
        // The last good load wins over an in-flight or failed refresh: a
        // background reload should never replace a working dashboard with a
        // spinner, and a refresh that fails should not replace it with an
        // error screen either. Both only show when there is nothing to fall
        // back to.
        final data = snapshot.data ?? _lastData;

        if (data == null && snapshot.hasError) {
          return _ParentDashboardError(
            reason: presentError(
              snapshot.error!,
              action: 'load your dashboard',
              operation: Operation.read,
              stackTrace: snapshot.stackTrace,
            ).reason,
            onRetry: _retry,
          );
        }

        if (data == null) {
          return const DashboardSkeleton(
            key: Key('parent-dashboard-loading'),
            metricCount: 3,
          );
        }

        return ParentDashboardView(
          data: data,
          onRefresh: _refresh,
          onOpenClasses: () => widget.onNavigate(AppDestination.classes),
          onOpenMessages: () => widget.onNavigate(AppDestination.messages),
          onOpenAnnouncements: () =>
              widget.onNavigate(AppDestination.announcements),
          onOpenInvoices: () => widget.onNavigate(AppDestination.invoices),
          onOpenProfile: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            );
          },
          onOpenFeedback: () {
            final feedback = data.latestFeedback;
            if (feedback != null) _openFeedback(feedback.studentId);
          },
        );
      },
    );
  }
}

/// Falls back to [fallback] rather than failing the whole dashboard when one
/// supporting read fails.
Future<T> _orDefault<T>(Future<T> future, T fallback) async {
  try {
    return await future;
  } catch (_) {
    return fallback;
  }
}

class _ParentDashboardError extends StatelessWidget {
  /// Why the load failed, already made safe to show. The heading above says
  /// what failed, so this is the reason on its own.
  final String reason;
  final Future<void> Function() onRetry;

  const _ParentDashboardError({required this.reason, required this.onRetry});

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
