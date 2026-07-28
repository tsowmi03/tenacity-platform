import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/feedback_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/feedback_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/tutor/parent_detail_screen.dart';
import 'package:tenacity/src/ui/users/tutor/student_detail_data.dart';
import 'package:tenacity/src/ui/users/tutor/student_detail_view.dart';

/// A student's record, as a tutor sees it.
class StudentDetailScreen extends StatefulWidget {
  final Student student;

  const StudentDetailScreen({super.key, required this.student});

  @override
  State<StudentDetailScreen> createState() => _StudentDetailScreenState();
}

class _StudentDetailScreenState extends State<StudentDetailScreen> {
  Map<String, String> _tutorNames = const {};

  /// Subscribed once — see the note in `FeedbackScreen`.
  Stream<List<StudentFeedback>>? _feedback;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(() {
        _feedback = context
            .read<FeedbackController>()
            .getFeedbackByStudentId(widget.student.id);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.read<AuthController>();
    final timetableController = context.watch<TimetableController>();
    final usersController = context.watch<UsersController>();

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: StreamBuilder<List<StudentFeedback>>(
        stream: _feedback,
        builder: (context, snapshot) {
          final feedback = snapshot.data ?? const <StudentFeedback>[];
          _resolveTutorNames(authController, feedback);

          final data = buildStudentDetailData(
            student: widget.student,
            tutorId: authController.currentUser?.uid ?? '',
            classes: timetableController.allClasses,
            allUsers: usersController.allUsers,
            feedback: feedback,
            tutorNamesById: _tutorNames,
            now: DateTime.now(),
          );

          return StudentDetailView(
            data: data,
            isLoading: _feedback == null ||
                snapshot.connectionState == ConnectionState.waiting,
            onBack: () => Navigator.of(context).pop(),
            onOpenFeedback: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => FeedbackScreen(
                  studentId: widget.student.id,
                  studentName: widget.student.firstName,
                ),
              ),
            ),
            onOpenParent: (row) {
              final parent = usersController.getUserById(row.uid);
              if (parent == null) return;
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ParentDetailScreen(parent: parent),
                ),
              );
            },
          );
        },
      ),
    );
  }

  /// Resolves feedback authors once per new set, then rebuilds.
  void _resolveTutorNames(
    AuthController authController,
    List<StudentFeedback> feedback,
  ) {
    final missing = feedback
        .map((entry) => entry.tutorId)
        .where((id) => id.isNotEmpty && !_tutorNames.containsKey(id))
        .toSet();
    if (missing.isEmpty) return;

    authController.fetchTutorNamesByIds(missing.toList()).then((names) {
      if (!mounted) return;
      setState(() => _tutorNames = {..._tutorNames, ...names});
    }).catchError((Object error) {
      debugPrint('[StudentDetailScreen] tutor name lookup failed: $error');
    });
  }
}
