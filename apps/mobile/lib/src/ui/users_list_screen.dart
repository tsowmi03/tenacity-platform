import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_screen.dart';
import 'package:tenacity/src/ui/users/admin/admin_users_data.dart';
import 'package:tenacity/src/ui/users/admin/admin_users_view.dart';
import 'package:tenacity/src/ui/users/tutor/parent_detail_screen.dart';
import 'package:tenacity/src/ui/users/tutor/person_routes.dart';
import 'package:tenacity/src/ui/users/tutor/student_detail_screen.dart';
import 'package:tenacity/src/ui/users/tutor/tutor_users_data.dart';
import 'package:tenacity/src/ui/users/tutor/tutor_users_view.dart';
import 'package:tenacity/src/utils/class_session_dates.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  /// Tutor-only state. Held here rather than on the shared controller, so a
  /// query cannot outlive the screen or re-filter the admin list.
  String _searchQuery = '';
  TutorUsersTab _tab = TutorUsersTab.thisWeek;

  /// Admin-only state, held here for the same reason.
  AdminUsersTab _adminTab = AdminUsersTab.parents;
  List<Invoice> _invoices = const [];

  bool _isLoadingClasses = false;

  /// This calendar week's attendance, keyed by class.
  ///
  /// Loaded here rather than read from `TimetableController.attendanceByClass`,
  /// which holds whichever week the Classes pager was last left on. The
  /// `This week` tab has to mean this week regardless of where the user has
  /// been navigating.
  Map<String, Attendance> _weekAttendance = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<UsersController>().fetchAllUsers();

      // This tab can be opened without ever visiting Classes, in which case
      // the timetable controller is empty and nothing is marked as taught.
      final role = context.read<AuthController>().currentUser?.role;
      if (role == 'tutor') {
        _loadTeachingWeek();
      } else if (role == 'admin') {
        _loadAdminContext();
      }
    });
  }

  /// Classes and invoices for the admin directory. Best-effort: the list still
  /// renders without them, just without subjects or an overdue marker.
  Future<void> _loadAdminContext() async {
    final timetableController = context.read<TimetableController>();
    final invoiceController = context.read<InvoiceController>();

    try {
      if (timetableController.allClasses.isEmpty) {
        await timetableController.loadAllClasses(silent: true);
      }
    } catch (e) {
      debugPrint('[UsersScreen] admin class load failed: $e');
    }

    try {
      final invoices = await invoiceController.getAllInvoices();
      if (!mounted) return;
      setState(() => _invoices = invoices);
    } catch (e) {
      // An overdue marker is worth having but not worth failing the directory
      // for; without it every row simply carries no status.
      debugPrint('[UsersScreen] admin invoice load failed: $e');
    }
  }

  Future<void> _loadTeachingWeek() async {
    if (_isLoadingClasses) return;
    final controller = context.read<TimetableController>();

    setState(() => _isLoadingClasses = true);
    try {
      if (controller.activeTerm == null) {
        await controller.loadActiveTerm(silent: true);
      }
      if (controller.allClasses.isEmpty) {
        await controller.loadAllClasses(silent: true);
      }

      final term = controller.activeTerm;
      if (term == null) return;

      final week = currentTermWeek(
        termStart: term.startDate,
        totalWeeks: term.totalWeeks,
        now: DateTime.now(),
      );
      final attendance = await _fetchWeekAttendance(
        controller: controller,
        docId: '${term.id}_W$week',
      );

      if (mounted) setState(() => _weekAttendance = attendance);
    } catch (e) {
      debugPrint('[UsersScreen] teaching week load failed: $e');
    } finally {
      if (mounted) setState(() => _isLoadingClasses = false);
    }
  }

  /// One read per class, in parallel. Reuses the controller's cache when it
  /// already holds this same week, which is the common case.
  Future<Map<String, Attendance>> _fetchWeekAttendance({
    required TimetableController controller,
    required String docId,
  }) async {
    if (controller.loadedAttendanceDocId == docId) {
      return Map<String, Attendance>.from(controller.attendanceByClass);
    }

    final results = <String, Attendance>{};
    await Future.wait(
      controller.allClasses.map((classModel) async {
        final attendance = await controller.fetchAttendanceDocFor(
          classId: classModel.id,
          attendanceDocId: docId,
        );
        if (attendance != null) results[classModel.id] = attendance;
      }),
    );
    return results;
  }

  /// The loaded student record behind a directory row.
  Student? _studentById(UsersController controller, String studentId) {
    for (final students in controller.parentStudents.values) {
      for (final student in students) {
        if (student.id == studentId) return student;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final usersController = context.watch<UsersController>();
    final role = context.watch<AuthController>().currentUser?.role;

    // Tutors get the V3 directory ordered around the classes they teach, admins
    // the full V3 people directory. No other role reaches this tab: `Users` is
    // absent from a parent's destinations, and HomeScreen turns an unrecognised
    // role away before the shell is built.
    if (role == 'tutor') return _buildTutorUsers(usersController);
    if (role == 'admin') return _buildAdminUsers(usersController);
    return const SizedBox.shrink();
  }

  /// The admin people directory. Opening a person routes into the existing
  /// detail screen, so lesson tokens, enrolments, the invoice PDF, unenrolment
  /// and account removal keep the behaviour and confirmations they already had.
  Widget _buildAdminUsers(UsersController usersController) {
    final timetableController = context.watch<TimetableController>();

    final data = buildAdminUsersViewData(
      allUsers: usersController.allUsers,
      studentsByParent: usersController.parentStudents,
      classes: timetableController.allClasses,
      invoices: _invoices,
      now: DateTime.now(),
      tab: _adminTab,
      query: _searchQuery,
      errorMessage: usersController.errorMessage,
    );

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: AdminUsersView(
        data: data,
        isLoading: usersController.isLoading,
        onSearchChanged: (query) => setState(() => _searchQuery = query),
        onTabChanged: (tab) => setState(() => _adminTab = tab),
        onRefresh: () async {
          await context.read<UsersController>().fetchAllUsers();
          await _loadAdminContext();
        },
        onRetry: () {
          context.read<UsersController>().fetchAllUsers();
          _loadAdminContext();
        },
        onPersonTapped: (row) {
          // Students have no account, so there is nothing for the account
          // screen to show or act on.
          final account = row.account;
          if (account == null) return;

          Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => AdminPersonScreen(user: account)),
          );
        },
      ),
    );
  }

  Widget _buildTutorUsers(UsersController usersController) {
    final authController = context.read<AuthController>();
    final timetableController = context.watch<TimetableController>();

    // Students come from the parent map the controller already loads, so this
    // adds no further reads. Duplicates are possible when two parents share a
    // child, which the id keying removes.
    final allStudents = <String, Student>{
      for (final students in usersController.parentStudents.values)
        for (final student in students) student.id: student,
    }.values.toList(growable: false);

    final data = buildTutorUsersViewData(
      tutorId: authController.currentUser?.uid ?? '',
      classes: timetableController.allClasses,
      weekAttendanceByClass: _weekAttendance,
      allStudents: allStudents,
      allUsers: usersController.allUsers,
      tab: _tab,
      query: _searchQuery,
      errorMessage: usersController.errorMessage,
    );

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: TutorUsersView(
        data: data,
        isLoading: usersController.isLoading || _isLoadingClasses,
        onSearchChanged: (query) => setState(() => _searchQuery = query),
        onTabChanged: (tab) => setState(() => _tab = tab),
        onRetry: () {
          context.read<UsersController>().fetchAllUsers();
          _loadTeachingWeek();
        },
        // The row opens the person; the Feedback button skips straight to
        // their history, which is the reason a tutor most often opens a
        // student at all.
        onFeedbackTapped: (row) {
          final student = _studentById(usersController, row.id);
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => FeedbackScreen(
                studentId: row.id,
                studentName: student?.firstName,
              ),
            ),
          );
        },
        onRowTapped: (row) {
          final account = row.account;
          if (account != null) {
            pushPersonRoute(
              context,
              openRoutes: const [],
              routeName: parentRouteName(account.uid),
              builder: (routes) => ParentDetailScreen(
                parent: account,
                openRoutes: routes,
              ),
            );
            return;
          }

          final student = _studentById(usersController, row.id);
          if (student == null) return;
          pushPersonRoute(
            context,
            openRoutes: const [],
            routeName: studentRouteName(student.id),
            builder: (routes) => StudentDetailScreen(
              student: student,
              openRoutes: routes,
            ),
          );
        },
      ),
    );
  }
}
