import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/feedback/feedback_history_data.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

/// One class the student is enrolled in.
@immutable
class StudentClassRow {
  final String classId;
  final String title;

  /// `Wednesday, 4:30 PM`.
  final String whenLabel;

  /// True when the viewing tutor teaches this class, so their own sessions are
  /// distinguishable from the rest of the student's timetable.
  final bool isMine;

  const StudentClassRow({
    required this.classId,
    required this.title,
    required this.whenLabel,
    required this.isMine,
  });
}

/// A parent on the student's record.
@immutable
class StudentFamilyRow {
  final String uid;
  final String name;
  final String initials;

  /// Email, or empty when the account has none stored.
  final String email;

  /// The account the student record names as the primary contact. Marked so a
  /// tutor with two guardians on file knows which one to reach first.
  final bool isPrimary;

  const StudentFamilyRow({
    required this.uid,
    required this.name,
    required this.initials,
    required this.email,
    required this.isPrimary,
  });
}

@immutable
class StudentDetailData {
  final String name;
  final String initials;

  /// `Year 9`, or empty when the record has no grade.
  final String yearLabel;

  /// The subjects on the student's record, as stored. Empty when none are set.
  final List<String> subjects;

  /// The most recent progress status a tutor recorded, if any.
  final StudentProgress? latestProgress;

  final List<StudentClassRow> classes;
  final List<StudentFamilyRow> family;

  /// The most recent note, shown in full so the tutor sees where the student
  /// was left without opening the history.
  final FeedbackNote? latestFeedback;

  final int feedbackCount;

  const StudentDetailData({
    required this.name,
    required this.initials,
    required this.yearLabel,
    required this.subjects,
    required this.classes,
    required this.family,
    required this.feedbackCount,
    this.latestProgress,
    this.latestFeedback,
  });

  /// `Maths · English`, or empty when the record names none.
  String get subjectsLabel => subjects.join(' · ');

  /// True when there is anything to put in the details block. A record with no
  /// year, subjects or progress has nothing to say, and an empty section is
  /// worse than none.
  bool get hasDetails =>
      yearLabel.isNotEmpty || subjects.isNotEmpty || latestProgress != null;

  /// `Year 9 · 2 classes`, under the name in the header.
  String get subtitle {
    final parts = <String>[
      if (yearLabel.isNotEmpty) yearLabel,
      if (classes.isNotEmpty)
        '${classes.length} ${classes.length == 1 ? 'class' : 'classes'}',
    ];
    return parts.join(' · ');
  }
}

/// Builds the student's detail from the records already loaded elsewhere.
///
/// Pure, so the ordering and attribution rules are testable without Firestore.
StudentDetailData buildStudentDetailData({
  required Student student,
  required String tutorId,
  required List<ClassModel> classes,
  required List<AppUser> allUsers,
  required List<StudentFeedback> feedback,
  required Map<String, String> tutorNamesById,
  required DateTime now,
}) {
  final name = '${student.firstName} ${student.lastName}'.trim();

  final classRows = <StudentClassRow>[
    for (final classModel in classes)
      if (classModel.enrolledStudents.contains(student.id))
        StudentClassRow(
          classId: classModel.id,
          title: formatDashboardClassType(classModel.type),
          whenLabel:
              '${classModel.dayOfWeek}, ${_timeLabel(classModel.startTime)}',
          isMine: classModel.tutors.contains(tutorId),
        ),
  ]..sort((a, b) {
      // The tutor's own classes first; the rest is context.
      if (a.isMine != b.isMine) return a.isMine ? -1 : 1;
      return a.title.compareTo(b.title);
    });

  final familyRows = <StudentFamilyRow>[
    for (final parentId in student.parents)
      ...allUsers.where((user) => user.uid == parentId).map((user) {
        final parentName = '${user.firstName} ${user.lastName}'.trim();
        return StudentFamilyRow(
          uid: user.uid,
          name: parentName.isEmpty ? 'Unknown' : parentName,
          initials: initialsFor(parentName),
          email: user.email,
          isPrimary: user.uid == student.primaryParentId,
        );
      }),
  ]..sort((a, b) {
      // The primary contact leads; the rest alphabetically.
      if (a.isPrimary != b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });

  final history = buildFeedbackHistory(
    feedback: feedback,
    tutorNamesById: tutorNamesById,
    now: now,
  );

  // Taken from the newest note rather than stored on the student: progress is
  // recorded per session, so the latest one is the current picture.
  final latestProgress = history.notes
      .map((note) => note.progress)
      .firstWhere((progress) => progress != null, orElse: () => null);

  return StudentDetailData(
    name: name.isEmpty ? 'Unknown' : name,
    initials: initialsFor(name),
    yearLabel: yearLabelFor(student.grade),
    subjects: student.subjects
        .map((subject) => subject.trim())
        .where((subject) => subject.isNotEmpty)
        .toList(growable: false),
    latestProgress: latestProgress,
    classes: classRows,
    family: familyRows,
    latestFeedback: history.notes.isEmpty ? null : history.notes.first,
    feedbackCount: history.notes.length,
  );
}

/// `16:30` as stored becomes `4:30 PM`; an unparseable value is shown as
/// stored rather than breaking the screen that reports it.
String _timeLabel(String startTime) {
  try {
    return DateFormat('h:mm a').format(DateFormat('HH:mm').parse(startTime));
  } catch (_) {
    return startTime;
  }
}
