import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/controllers/users_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/users/tutor/parent_detail_view.dart';
import 'package:tenacity/src/ui/users/tutor/person_routes.dart';
import 'package:tenacity/src/ui/users/tutor/student_detail_screen.dart';
import 'package:tenacity/src/ui/users/tutor/tutor_users_data.dart';

/// A parent's record, as a tutor sees it.
class ParentDetailScreen extends StatelessWidget {
  final AppUser parent;

  /// See [StudentDetailScreen.openRoutes].
  final List<String> openRoutes;

  const ParentDetailScreen({
    super.key,
    required this.parent,
    this.openRoutes = const [],
  });

  @override
  Widget build(BuildContext context) {
    final usersController = context.watch<UsersController>();
    final timetableController = context.watch<TimetableController>();

    final children =
        usersController.parentStudents[parent.uid] ?? const <Student>[];
    final name = '${parent.firstName} ${parent.lastName}'.trim();

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: ParentDetailView(
        name: name.isEmpty ? 'Unknown' : name,
        initials: initialsFor(name),
        email: parent.email,
        phone: parent.phone,
        isLoading: usersController.isLoading && children.isEmpty,
        children: [
          for (final student in children)
            ParentChildRow(
              studentId: student.id,
              name: '${student.firstName} ${student.lastName}'.trim(),
              initials: initialsFor(
                '${student.firstName} ${student.lastName}',
              ),
              subtitle: studentSubtitle(
                grade: student.grade,
                classes: timetableController.allClasses
                    .where((c) => c.enrolledStudents.contains(student.id))
                    .toList(growable: false),
              ),
            ),
        ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase())),
        onBack: () => Navigator.of(context).pop(),
        onMessage: () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ChatScreen(
              chatId: null,
              otherUserName: name.isEmpty ? 'Parent' : name,
              receipientId: parent.uid,
            ),
          ),
        ),
        onOpenChild: (row) {
          final student = children
              .where((candidate) => candidate.id == row.studentId)
              .firstOrNull;
          if (student == null) return;
          pushPersonRoute(
            context,
            openRoutes: openRoutes,
            routeName: studentRouteName(student.id),
            builder: (routes) => StudentDetailScreen(
              student: student,
              openRoutes: routes,
            ),
          );
        },
        onCopy: (value) {
          Clipboard.setData(ClipboardData(text: value));
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Copied'),
              backgroundColor: AppColors.ink,
            ),
          );
        },
      ),
    );
  }
}
