import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/user_details_screen.dart';
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
  final TextEditingController _searchController = TextEditingController();

  /// Tutor-only state. Held here rather than on the shared controller, so a
  /// query cannot outlive the screen or re-filter the admin list.
  String _searchQuery = '';
  TutorUsersTab _tab = TutorUsersTab.thisWeek;

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
      if (context.read<AuthController>().currentUser?.role == 'tutor') {
        _loadTeachingWeek();
      }
    });
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

  void _onSearchChanged(String query) {
    context.read<UsersController>().filterUsers(query);
  }

  @override
  Widget build(BuildContext context) {
    final usersController = context.watch<UsersController>();
    final role = context.watch<AuthController>().currentUser?.role;

    // Tutors get the V3 directory, scoped to the classes they teach. Admins
    // still use the legacy list below until A04 lands.
    if (role == 'tutor') return _buildTutorUsers(usersController);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          "All Users",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        elevation: 0,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF1C71AF), Color(0xFF1B3F71)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(10),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search users...',
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide.none,
                ),
              ),
              onChanged: _onSearchChanged,
            ),
          ),
          // User list
          Expanded(
            child: usersController.isLoading
                ? const Center(child: CircularProgressIndicator())
                : usersController.errorMessage != null
                    ? Center(child: Text(usersController.errorMessage!))
                    : usersController.filteredUsers.isEmpty
                        ? const Center(child: Text('No users found.'))
                        : ListView.builder(
                            itemCount: usersController.filteredUsers.length,
                            itemBuilder: (context, index) {
                              final user = usersController.filteredUsers[index];
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor:
                                      Theme.of(context).primaryColorDark,
                                  child: Text(
                                    user.firstName.isNotEmpty
                                        ? user.firstName[0].toUpperCase()
                                        : '?',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                title: Text(
                                  '${user.firstName} ${user.lastName}',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold),
                                ),
                                subtitle: Text(
                                  user.role.isNotEmpty
                                      ? '${user.role[0].toUpperCase()}${user.role.substring(1).toLowerCase()}'
                                      : '',
                                ),
                                onTap: () {
                                  Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) =>
                                            UserDetailScreen(user: user),
                                      ));
                                },
                              );
                            },
                          ),
          ),
        ],
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
