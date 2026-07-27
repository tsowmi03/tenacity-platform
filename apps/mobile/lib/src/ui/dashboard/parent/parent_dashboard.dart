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
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_view.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:tenacity/src/ui/home_navigation.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

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

  const ParentDashboard({
    super.key,
    required this.parentId,
    required this.parentName,
    required this.readAnnouncementIds,
    required this.onNavigate,
  });

  @override
  State<ParentDashboard> createState() => _ParentDashboardState();
}

class _ParentDashboardState extends State<ParentDashboard> {
  Future<ParentDashboardViewData>? _dashboardFuture;
  bool _dashboardLoadScheduled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_dashboardFuture == null) _scheduleDashboardLoad();
  }

  @override
  void didUpdateWidget(covariant ParentDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.parentId != widget.parentId) {
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

    return buildParentDashboardViewData(
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
    setState(() => _dashboardFuture = future);
    await future;
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
        if (snapshot.hasError) {
          return _ParentDashboardError(onRetry: _refresh);
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
  final Future<void> Function() onRetry;

  const _ParentDashboardError({required this.onRetry});

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
