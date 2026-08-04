import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';
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

    final invoicesFuture = _orDefault(
      invoiceController.getAllInvoices(),
      const <Invoice>[],
    );

    await _loadTimetable(timetableController, force: force);

    // Only the tutors actually assigned this week are named, rather than every
    // tutor on the books.
    final tutorIds = <String>{
      for (final classModel in timetableController.allClasses) ...[
        ...classModel.tutors,
        ...?timetableController.attendanceByClass[classModel.id]?.tutors,
      ],
    }.toList(growable: false);

    final tutorNames = tutorIds.isEmpty
        ? const <String, String>{}
        : await _orDefault(
            authController.fetchTutorNamesByIds(tutorIds),
            const <String, String>{},
          );

    final data = buildAdminDashboardViewData(
      adminName: widget.adminName,
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      currentWeek: timetableController.currentWeek,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      tutorNamesById: tutorNames,
      invoices: await invoicesFuture,
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
          return const ColoredBox(
            color: AppColors.ink,
            child: SafeArea(
              child: Center(
                child: CircularProgressIndicator(color: AppColors.blue300),
              ),
            ),
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
          // Sessions and outstanding rolls open the timetable rather than a
          // per-class route, which A02 introduces.
          onOpenClass: (_) => openClasses(),
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
