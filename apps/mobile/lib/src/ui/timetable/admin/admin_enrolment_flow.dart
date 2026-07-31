import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_data.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_class_management_sheets.dart';

/// Reports the outcome of an enrolment attempt to whichever surface started it.
typedef AdminEnrolmentReporter = void Function(
  String message, {
  bool isError,
});

String adminStudentDisplayName(Student student) =>
    '${student.firstName} ${student.lastName}'.trim();

/// Asks for the enrolment type and performs the write.
///
/// Both admin entry points end here — the class-side flow, which knows its
/// class and asks for a student, and the dashboard's New enrol, which knows
/// its student and asks for a class. Keeping the write in one place means the
/// offline guard, the already-enrolled handling and the post-write reload
/// cannot drift between them.
///
/// Returns true only when a student was actually enrolled.
Future<bool> showAdminEnrolmentTypeAndEnrol({
  required BuildContext context,
  required ClassModel classInfo,
  required Student student,
  required AdminEnrolmentReporter onMessage,
}) async {
  final timetableController = context.read<TimetableController>();
  final studentName = adminStudentDisplayName(student);

  final type = await showAppBottomSheet<AdminEnrolmentType>(
    context: context,
    builder: (typeContext) => AdminEnrolmentTypeSheet(
      studentName: studentName,
      canBookOneOff:
          timetableController.attendanceByClass.containsKey(classInfo.id),
      onSelected: (type) => Navigator.pop(typeContext, type),
      onCancel: () => Navigator.pop(typeContext),
    ),
  );
  if (type == null || !context.mounted) return false;

  try {
    if (type == AdminEnrolmentType.permanent) {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'enrol this student',
      )) {
        return false;
      }
      final outcome = await timetableController.enrollStudentPermanent(
        classId: classInfo.id,
        studentId: student.id,
      );
      if (!context.mounted) return false;
      if (outcome == AdminPermanentEnrollmentOutcome.alreadyEnrolled) {
        onMessage(
          'Student ${student.firstName} is already permanently enrolled.',
        );
        return false;
      }
      onMessage('Student ${student.firstName} enrolled permanently.');
    } else {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'book this student one-off',
      )) {
        return false;
      }
      final activeTerm = timetableController.activeTerm;
      if (activeTerm == null) {
        onMessage('No active term found.', isError: true);
        return false;
      }
      final result = await timetableController.enrollStudentOneOff(
        classId: classInfo.id,
        studentId: student.id,
        attendanceDocId: '${activeTerm.id}_W${timetableController.currentWeek}',
      );
      if (!context.mounted) return false;
      if (result == null) {
        onMessage('Unable to book this student one-off.', isError: true);
        return false;
      }
      if (result.alreadyEnrolled) {
        onMessage(
          'Student ${student.firstName} already has a booking for this class.',
        );
        return false;
      }
      onMessage('Student ${student.firstName} enrolled one-off.');
    }

    await timetableController.loadAllClasses(silent: true);
    await timetableController.loadAttendanceForWeek(silent: true);
    return true;
  } catch (error) {
    if (context.mounted) {
      onMessage('Error enrolling student: $error', isError: true);
    }
    return false;
  }
}

/// The dashboard's New enrol flow: choose a student, then a class, then the
/// enrolment type.
///
/// The class list is annotated against the chosen student, so classes they are
/// already on show as such instead of failing at the write.
Future<bool> showAdminEnrolFromStudent({
  required BuildContext context,
  required AdminEnrolmentReporter onMessage,
}) async {
  final authController = context.read<AuthController>();
  final timetableController = context.read<TimetableController>();

  final student = await showAppBottomSheet<Student>(
    context: context,
    builder: (pickerContext) => AdminStudentPickerSheet(
      students: authController.fetchAllStudents(),
      onSelected: (student) => Navigator.pop(pickerContext, student),
      onCancel: () => Navigator.pop(pickerContext),
    ),
  );
  if (student == null || !context.mounted) return false;

  Future<List<AdminClassChoice>> loadChoices() async {
    if (timetableController.allClasses.isEmpty) {
      await timetableController.loadAllClasses(silent: true);
    }
    return buildAdminClassChoices(
      classes: timetableController.allClasses,
      studentId: student.id,
    );
  }

  final choice = await showAppBottomSheet<AdminClassChoice>(
    context: context,
    builder: (classContext) => AdminClassPickerSheet(
      choices: loadChoices(),
      studentName: adminStudentDisplayName(student),
      onSelected: (choice) => Navigator.pop(classContext, choice),
      onCancel: () => Navigator.pop(classContext),
    ),
  );
  if (choice == null || !context.mounted) return false;

  return showAdminEnrolmentTypeAndEnrol(
    context: context,
    classInfo: choice.classModel,
    student: student,
    onMessage: onMessage,
  );
}
