import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_screen.dart';
import 'package:tenacity/src/ui/components/screen_skeletons.dart';
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard_view.dart';
import 'package:tenacity/src/ui/home_navigation.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/tab_visibility.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_enrolment_flow.dart';
import 'package:tenacity/src/utils/refresh_throttle.dart';

/// Loads the admin dashboard's data and hands it to [AdminDashboardView].
///
/// Follows the parent dashboard's contract: supporting reads are best-effort so
/// one failing query cannot blank the console, and only a failure to load the
/// timetable — the dashboard's main content — surfaces as an error.
class AdminDashboard extends StatefulWidget {
  final String adminId;
  final String adminName;
  final void Function(AppDestination) onNavigate;

  /// Injectable so widget tests can drive a second load without waiting out
  /// the real interval. Left null it throttles as it does in the app.
  final RefreshThrottle? refreshThrottle;

  const AdminDashboard({
    super.key,
    required this.adminId,
    required this.adminName,
    required this.onNavigate,
    this.refreshThrottle,
  });

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard>
    with TabVisibilityAware<AdminDashboard> {
  Future<AdminDashboardViewData>? _dashboardFuture;

  /// The last data that loaded cleanly, kept so a background refresh has
  /// something to render behind it. Without this the console fell back to a
  /// full-screen spinner every time it reloaded.
  AdminDashboardViewData? _lastData;

  late final RefreshThrottle _refreshThrottle =
      widget.refreshThrottle ?? RefreshThrottle();

  /// Loads on first build, and refreshes each time the user comes back to the
  /// Home tab — which no longer remounts this widget.
  @override
  void onTabVisible() {
    if (!_refreshThrottle.shouldRefresh) return;
    // Forced, deliberately: `_loadTimetable`'s skip-if-loaded guard is right
    // for a cold start, but with the tab kept alive it would otherwise leave
    // the console showing the same counts indefinitely.
    _startLoad(force: true);
  }

  @override
  void didUpdateWidget(covariant AdminDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.adminId != widget.adminId) {
      // A different admin: what is on screen belongs to the previous one.
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

  Future<AdminDashboardViewData> _loadDashboard({bool force = false}) async {
    final timetableController = context.read<TimetableController>();
    final invoiceController = context.read<InvoiceController>();
    final authController = context.read<AuthController>();

    final invoicesRead = _tryRead(
      invoiceController.getAllInvoices(),
      const <Invoice>[],
    );

    final rollsLoaded = await _loadTimetable(timetableController, force: force);

    // Only the tutors actually assigned this week are named, rather than every
    // tutor on the books.
    final tutorIds = <String>{
      for (final classModel in timetableController.allClasses) ...[
        ...classModel.tutors,
        ...?timetableController.attendanceByClass[classModel.id]?.tutors,
      ],
    }.toList(growable: false);

    // Only this week's one-off visitors, for the same reason: the drill-down
    // names the people who booked, not the whole student body.
    final oneOffStudentIds = <String>{
      for (final classModel in timetableController.allClasses)
        ...?timetableController.attendanceByClass[classModel.id]?.attendance
            .where((id) => !classModel.enrolledStudents.contains(id)),
    }.toList(growable: false);

    final tutorNamesRead = _tryRead(
      tutorIds.isEmpty
          ? Future.value(const <String, String>{})
          : authController.fetchTutorNamesByIds(tutorIds),
      const <String, String>{},
    );

    final studentNamesRead = _tryRead(
      oneOffStudentIds.isEmpty
          ? Future.value(const <String, String>{})
          : authController.fetchStudentNamesByIds(oneOffStudentIds),
      const <String, String>{},
    );

    final invoices = await invoicesRead;

    final data = buildAdminDashboardViewData(
      adminName: widget.adminName,
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      currentWeek: timetableController.currentWeek,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      tutorNamesById: (await tutorNamesRead).value,
      studentNamesById: (await studentNamesRead).value,
      invoices: invoices.value,
      billingUnavailable: invoices.failed,
      rollsUnavailable: !rollsLoaded,
    );

    _lastData = data;
    _refreshThrottle.markRefreshed();
    return data;
  }

  /// Loads the term, classes and this week's attendance, returning whether the
  /// attendance behind the roll counts can be trusted.
  Future<bool> _loadTimetable(
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
    // No term means no sessions to have rolls for, which is a quiet week
    // rather than a failed read.
    if (activeTerm == null) return true;

    final expectedAttendanceDocId =
        '${activeTerm.id}_W${controller.currentWeek}';
    if (force || controller.loadedAttendanceDocId != expectedAttendanceDocId) {
      return controller.loadAttendanceForWeek(silent: true);
    }

    // Already holding the week asked for.
    return true;
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

  void _reportEnrolment(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.danger : null,
      ),
    );
  }

  /// Opens the timetable on [day].
  ///
  /// The outstanding-roll rows used to switch to the Classes tab and leave the
  /// admin to find the session for themselves, on whichever day the timetable
  /// happened to be showing. Every outstanding roll is in the displayed week,
  /// so selecting the day is enough — no week change is involved.
  void _openDay(DateTime day) {
    context.read<TimetableController>().requestAdminDate(day);
    widget.onNavigate(AppDestination.classes);
  }

  /// Opens one session's roll — the same V3 roll screen tutors use, which is
  /// also where the admin timetable's `Mark roll` action leads.
  Future<void> _openRoll(String classId, String attendanceDocId) async {
    final controller = context.read<TimetableController>();
    final classInfo =
        controller.allClasses.where((c) => c.id == classId).firstOrNull;
    if (classInfo == null) {
      // The class has gone since the dashboard was built; the timetable is the
      // only destination left that makes sense.
      widget.onNavigate(AppDestination.classes);
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ClassRollScreen(
          classInfo: classInfo,
          attendanceDocId: attendanceDocId,
        ),
      ),
    );
    // Marking the roll changes both the counts and the rows behind this, so
    // the console reloads rather than trusting what it drew before.
    if (mounted) await _refresh();
  }

  /// New enrol starts from the student, then the class — the mirror of the
  /// class-side flow, which already knows its class. A successful enrolment
  /// changes the dashboard's own session and roll counts, so it refreshes.
  Future<void> _startNewEnrol() async {
    final enrolled = await showAdminEnrolFromStudent(
      context: context,
      onMessage: _reportEnrolment,
    );
    if (enrolled && mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AdminDashboardViewData>(
      future: _dashboardFuture,
      builder: (context, snapshot) {
        // The last good load wins over an in-flight or failed refresh: a
        // background reload should never replace a working console with a
        // spinner, and a refresh that fails should not replace it with an
        // error screen either. Both only show when there is nothing to fall
        // back to.
        final data = snapshot.data ?? _lastData;

        if (data == null && snapshot.hasError) {
          return _AdminDashboardError(onRetry: _retry);
        }

        if (data == null) {
          return const DashboardSkeleton(
            key: Key('admin-dashboard-loading'),
            metricCount: 3,
          );
        }

        void openClasses() => widget.onNavigate(AppDestination.classes);

        return AdminDashboardView(
          data: data,
          onRefresh: _refresh,
          onOpenClasses: openClasses,
          onOpenInvoices: () => widget.onNavigate(AppDestination.invoices),
          onOpenUsers: () => widget.onNavigate(AppDestination.users),
          onOpenProfile: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            );
          },
          // Class creation still routes to Classes, where the add-class sheet
          // is the admin FAB.
          onAddClass: openClasses,
          onNewEnrol: _startNewEnrol,
          onCreateInvoice: () async {
            await Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => const AdminCreateInvoiceScreen(),
              ),
            );
            if (mounted) await _refresh();
          },
          onOpenRoll: _openRoll,
          onOpenDay: _openDay,
        );
      },
    );
  }
}

/// Falls back to [fallback] rather than failing the whole dashboard when one
/// supporting read fails, reporting whether it had to.
///
/// The flag is the point. Swallowing the failure silently let a broken invoice
/// read render as `0 need action` and an empty NEEDS ACTION list — a console
/// that looked reassuringly clear precisely when it knew least.
Future<({T value, bool failed})> _tryRead<T>(
    Future<T> future, T fallback) async {
  try {
    return (value: await future, failed: false);
  } catch (_) {
    return (value: fallback, failed: true);
  }
}

class _AdminDashboardError extends StatelessWidget {
  final Future<void> Function() onRetry;

  const _AdminDashboardError({required this.onRetry});

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
