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
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Loads the admin dashboard's data and hands it to [AdminDashboardView].
///
/// Follows the parent dashboard's contract: supporting reads are best-effort so
/// one failing query cannot blank the console, and only a failure to load the
/// timetable — the dashboard's main content — surfaces as an error.
class AdminDashboard extends StatefulWidget {
  final String adminId;
  final String adminName;
  final void Function(AppDestination) onNavigate;

  const AdminDashboard({
    super.key,
    required this.adminId,
    required this.adminName,
    required this.onNavigate,
  });

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  Future<AdminDashboardViewData>? _dashboardFuture;
  bool _dashboardLoadScheduled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_dashboardFuture == null) _scheduleDashboardLoad();
  }

  @override
  void didUpdateWidget(covariant AdminDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.adminId != widget.adminId) {
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

    return buildAdminDashboardViewData(
      adminName: widget.adminName,
      now: DateTime.now(),
      activeTerm: timetableController.activeTerm,
      currentWeek: timetableController.currentWeek,
      classes: timetableController.allClasses,
      attendanceByClass: timetableController.attendanceByClass,
      tutorNamesById: tutorNames,
      invoices: await invoicesFuture,
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

  Future<void> _refresh() async {
    final future = _loadDashboard(force: true);
    setState(() => _dashboardFuture = future);
    await future;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<AdminDashboardViewData>(
      future: _dashboardFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _AdminDashboardError(onRetry: _refresh);
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
          // Class creation and enrolment both live behind the classes screen
          // today — the add-class dialog is the admin FAB there. Routing to it
          // takes an admin where the work happens; both get direct entry points
          // when A02 and S08 rebuild class management.
          onAddClass: openClasses,
          onNewEnrol: openClasses,
          onCreateInvoice: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => const AdminCreateInvoiceScreen(),
              ),
            );
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
