import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/user_details_screen.dart';
import 'package:tenacity/src/ui/users/tutor/tutor_users_data.dart';
import 'package:tenacity/src/ui/users/tutor/tutor_users_view.dart';

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
  TutorUsersTab _tab = TutorUsersTab.students;

  bool _isLoadingClasses = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<UsersController>().fetchAllUsers();

      // A tutor's directory is scoped by the classes they teach, and this tab
      // can be opened without ever visiting Classes — in which case the
      // timetable controller is empty and every student is filtered out.
      if (context.read<AuthController>().currentUser?.role == 'tutor') {
        _ensureClassesLoaded();
      }
    });
  }

  Future<void> _ensureClassesLoaded() async {
    final controller = context.read<TimetableController>();
    if (controller.allClasses.isNotEmpty || _isLoadingClasses) return;

    setState(() => _isLoadingClasses = true);
    try {
      // Ordered: the week's attendance needs the active term, and the cover
      // assignments in it are what let a substitute see the class they are
      // standing in for.
      await controller.loadActiveTerm(silent: true);
      await controller.loadAllClasses(silent: true);
      if (controller.activeTerm != null) {
        await controller.loadAttendanceForWeek(silent: true);
      }
    } catch (e) {
      debugPrint('[UsersScreen] class load failed: $e');
    } finally {
      if (mounted) setState(() => _isLoadingClasses = false);
    }
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
      attendanceByClass: timetableController.attendanceByClass,
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
        onRetry: () => context.read<UsersController>().fetchAllUsers(),
        onFeedbackTapped: (row) => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => FeedbackScreen(studentId: row.id),
          ),
        ),
        onRowTapped: (row) {
          // A student row opens their feedback, which is the only detail a
          // tutor has authority over. A parent row opens the account.
          if (row.account == null) {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => FeedbackScreen(studentId: row.id),
              ),
            );
            return;
          }
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => UserDetailScreen(user: row.account!),
            ),
          );
        },
      ),
    );
  }
}
