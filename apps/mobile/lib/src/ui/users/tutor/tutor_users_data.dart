import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_data.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

/// Which side of the list is showing.
enum TutorUsersTab { students, parents }

/// One person in the tutor's directory.
@immutable
class TutorUserRow {
  /// The student id, or the parent's uid.
  final String id;

  final String name;
  final String initials;

  /// `Year 9 · Maths · Wed & Sat` for a student; the children's names for a
  /// parent.
  final String subtitle;

  /// Students carry a shortcut into their feedback history; parents do not.
  final bool hasFeedbackAction;

  /// Set for a parent row, so the detail screen can be opened with the real
  /// account rather than a lookup.
  final AppUser? account;

  const TutorUserRow({
    required this.id,
    required this.name,
    required this.initials,
    required this.subtitle,
    required this.hasFeedbackAction,
    this.account,
  });
}

@immutable
class TutorUsersViewData {
  final TutorUsersTab tab;
  final List<TutorUserRow> rows;

  /// `Students in your classes`.
  final String subtitle;

  final int studentCount;
  final int parentCount;
  final String? errorMessage;

  /// True when this tutor holds no standing class assignment, so everything
  /// they teach is week-by-week cover. Their directory then depends on which
  /// week is loaded, and an empty list needs explaining rather than implying
  /// they teach nobody.
  final bool coverOnly;

  const TutorUsersViewData({
    required this.tab,
    required this.rows,
    required this.subtitle,
    required this.studentCount,
    required this.parentCount,
    required this.coverOnly,
    this.errorMessage,
  });

  bool get isEmpty => rows.isEmpty;
}

/// The people a tutor can see: the students in the classes they teach, and
/// those students' parents.
///
/// **Scope decision.** The Firestore rules let a tutor read every student and
/// every staff account, so this narrowing is the app's choice rather than
/// something enforced underneath it. The reference design states the rule in
/// its own subtitle — "Students in your classes" — and a tutor has no reason
/// to browse families they do not teach.
///
/// Pure, so the scoping is testable without Firestore.
TutorUsersViewData buildTutorUsersViewData({
  required String tutorId,
  required List<ClassModel> classes,
  required Map<String, Attendance> attendanceByClass,
  required List<Student> allStudents,
  required List<AppUser> allUsers,
  required TutorUsersTab tab,
  String query = '',
  String? errorMessage,
}) {
  final trimmedQuery = query.trim().toLowerCase();

  // Classes this tutor teaches: the standing assignment *plus* any cover in
  // the loaded week.
  //
  // Deliberately a union, where the timetable uses the week's document as an
  // override. The timetable answers "who is teaching this session", so a
  // handover must remove it from the usual tutor's week. A directory answers
  // "whose students are these", and a tutor who handed over one week has not
  // stopped teaching the class — scoping by override emptied the directory of
  // every tutor whose current week happened to be covered by someone else.
  //
  // **Known limitation.** Cover comes from whichever week is loaded, which is
  // `TimetableController.currentWeek` — global state shared with the Classes
  // pager. A tutor's standing classes are therefore stable, but their cover
  // students follow the week open in Classes. Scoping cover across the whole
  // term would mean reading every week's attendance for every class; see
  // [TutorUsersViewData.coverOnly] for how the empty state explains this.
  final standing = classes
      .where((classModel) => classModel.tutors.contains(tutorId))
      .toList(growable: false);

  final myClasses = classes.where((classModel) {
    if (classModel.tutors.contains(tutorId)) return true;
    return attendanceByClass[classModel.id]?.tutors.contains(tutorId) ?? false;
  }).toList(growable: false);

  final classesByStudent = <String, List<ClassModel>>{};
  for (final classModel in myClasses) {
    final roster = <String>{
      ...classModel.enrolledStudents,
      ...?attendanceByClass[classModel.id]?.attendance,
    };
    for (final studentId in roster) {
      classesByStudent.putIfAbsent(studentId, () => []).add(classModel);
    }
  }

  final students = allStudents
      .where((student) => classesByStudent.containsKey(student.id))
      .toList(growable: false);

  final parentIds = {
    for (final student in students) ...student.parents,
  };
  final parents = allUsers
      .where((user) =>
          user.role.toLowerCase() == 'parent' && parentIds.contains(user.uid))
      .toList(growable: false);

  final studentsByParent = <String, List<Student>>{};
  for (final student in students) {
    for (final parentId in student.parents) {
      studentsByParent.putIfAbsent(parentId, () => []).add(student);
    }
  }

  final rows = <TutorUserRow>[];
  if (tab == TutorUsersTab.students) {
    for (final student in students) {
      final name = '${student.firstName} ${student.lastName}'.trim();
      if (!_matchesStudent(student, name, trimmedQuery)) continue;

      rows.add(
        TutorUserRow(
          id: student.id,
          name: name.isEmpty ? 'Unknown' : name,
          initials: initialsFor(name),
          subtitle: studentSubtitle(
            grade: student.grade,
            classes: classesByStudent[student.id] ?? const [],
          ),
          hasFeedbackAction: true,
        ),
      );
    }
  } else {
    for (final parent in parents) {
      final name = '${parent.firstName} ${parent.lastName}'.trim();
      final children = studentsByParent[parent.uid] ?? const <Student>[];
      if (!_matchesParent(name, children, trimmedQuery)) continue;

      rows.add(
        TutorUserRow(
          id: parent.uid,
          name: name.isEmpty ? 'Unknown' : name,
          initials: initialsFor(name),
          subtitle: children.map((c) => c.firstName).join(' · '),
          hasFeedbackAction: false,
          account: parent,
        ),
      );
    }
  }

  rows.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  return TutorUsersViewData(
    tab: tab,
    rows: rows,
    subtitle: 'Students in your classes',
    studentCount: students.length,
    parentCount: parents.length,
    coverOnly: standing.isEmpty,
    errorMessage: errorMessage,
  );
}

/// `Year 9 · Maths · Wed & Sat` — who they are and when the tutor sees them.
String studentSubtitle({
  required String grade,
  required List<ClassModel> classes,
}) {
  final parts = <String>[];

  final year = yearLabelFor(grade);
  if (year.isNotEmpty) parts.add(year);

  // Subjects rather than full class names: the tutor already knows the level,
  // and `Year 9 · Year 9 Maths · Wed` reads badly.
  final subjects = <String>{
    for (final classModel in classes) subjectLabelFor(classModel.type),
  }..removeWhere((subject) => subject.isEmpty);
  if (subjects.isNotEmpty) parts.add(subjects.join(' & '));

  final days = <String>{
    for (final classModel in classes)
      if (classModel.dayOfWeek.length >= 3)
        classModel.dayOfWeek.substring(0, 3),
  };
  if (days.isNotEmpty) parts.add(days.join(' & '));

  return parts.join(' · ');
}

/// `Maths` or `English` from a stored class type code.
///
/// Derived from the full label rather than a second lookup table, so a new
/// class code only has to be added in one place.
String subjectLabelFor(String type) {
  final label = formatDashboardClassType(type).toLowerCase();
  if (label.contains('math')) return 'Maths';
  if (label.contains('english')) return 'English';
  // A code with no recognised subject contributes nothing rather than
  // printing a raw code at families or staff.
  return '';
}

bool _matchesStudent(Student student, String name, String query) {
  if (query.isEmpty) return true;
  if (name.toLowerCase().contains(query)) return true;
  return student.grade.toLowerCase().contains(query);
}

bool _matchesParent(String name, List<Student> children, String query) {
  if (query.isEmpty) return true;
  if (name.toLowerCase().contains(query)) return true;
  // Staff look a family up by the student they teach.
  return children.any((child) =>
      '${child.firstName} ${child.lastName}'.toLowerCase().contains(query));
}
