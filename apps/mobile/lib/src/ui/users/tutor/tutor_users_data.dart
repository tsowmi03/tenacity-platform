import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

/// Which side of the directory is showing.
///
/// [thisWeek] is the working set — the students the tutor actually sees this
/// week. The other two are the full directory, so anyone is reachable.
enum TutorUsersTab { thisWeek, students, parents }

/// One person in the directory.
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

  /// True when this student is in one of the tutor's own sessions this week.
  /// Used to mark them in the full student list, so the people they are about
  /// to teach are recognisable without switching tabs.
  final bool isThisWeek;

  /// Set for a parent row, so the detail screen opens with the real account
  /// rather than another lookup.
  final AppUser? account;

  const TutorUserRow({
    required this.id,
    required this.name,
    required this.initials,
    required this.subtitle,
    required this.hasFeedbackAction,
    this.isThisWeek = false,
    this.account,
  });
}

@immutable
class TutorUsersViewData {
  final TutorUsersTab tab;
  final List<TutorUserRow> rows;

  /// Changes with the tab, because the scope does.
  final String subtitle;

  final int thisWeekCount;
  final int studentCount;
  final int parentCount;
  final String? errorMessage;

  const TutorUsersViewData({
    required this.tab,
    required this.rows,
    required this.subtitle,
    required this.thisWeekCount,
    required this.studentCount,
    required this.parentCount,
    this.errorMessage,
  });

  bool get isEmpty => rows.isEmpty;
}

/// The tutor's directory.
///
/// **Scope.** Tutors can see every student and every parent. The Firestore
/// rules already allow this — `students` and `users` both grant staff reads —
/// so nothing here is enforcing a restriction; the tabs are about ordering
/// attention, not about access.
///
/// [weekAttendanceByClass] must be the **current calendar week's** attendance,
/// not whatever week the Classes pager happens to be showing. The `This week`
/// tab means this week; deriving it from shared pager state made the directory
/// change depending on where the user had last navigated.
///
/// Pure, so the scoping and ordering rules are testable without Firestore.
TutorUsersViewData buildTutorUsersViewData({
  required String tutorId,
  required List<ClassModel> classes,
  required Map<String, Attendance> weekAttendanceByClass,
  required List<Student> allStudents,
  required List<AppUser> allUsers,
  required TutorUsersTab tab,
  String query = '',
  String? errorMessage,
}) {
  final trimmedQuery = query.trim().toLowerCase();

  // Every class a student is in, for the subtitle. Drawn from all classes
  // rather than only the tutor's, so a student they do not teach still reads
  // as a person with a timetable rather than a bare name.
  final classesByStudent = <String, List<ClassModel>>{};
  for (final classModel in classes) {
    for (final studentId in classModel.enrolledStudents) {
      classesByStudent.putIfAbsent(studentId, () => []).add(classModel);
    }
  }

  // The tutor's own sessions this week: standing assignment, or cover recorded
  // on this week's attendance document.
  final thisWeekStudentIds = <String>{};
  for (final classModel in classes) {
    final attendance = weekAttendanceByClass[classModel.id];
    final teachesIt = classModel.tutors.contains(tutorId) ||
        (attendance?.tutors.contains(tutorId) ?? false);
    if (!teachesIt) continue;
    if (attendance?.cancelled ?? false) continue;

    thisWeekStudentIds.addAll(classModel.enrolledStudents);
    // Visitors booked into this session only.
    thisWeekStudentIds.addAll(attendance?.attendance ?? const []);
  }

  final parents = allUsers
      .where((user) => user.role.toLowerCase() == 'parent')
      .toList(growable: false);

  final studentsByParent = <String, List<Student>>{};
  for (final student in allStudents) {
    for (final parentId in student.parents) {
      studentsByParent.putIfAbsent(parentId, () => []).add(student);
    }
  }

  TutorUserRow rowForStudent(Student student) {
    final name = '${student.firstName} ${student.lastName}'.trim();
    return TutorUserRow(
      id: student.id,
      name: name.isEmpty ? 'Unknown' : name,
      initials: initialsFor(name),
      subtitle: studentSubtitle(
        grade: student.grade,
        classes: classesByStudent[student.id] ?? const [],
      ),
      hasFeedbackAction: true,
      isThisWeek: thisWeekStudentIds.contains(student.id),
    );
  }

  final rows = <TutorUserRow>[];
  switch (tab) {
    case TutorUsersTab.thisWeek:
      for (final student in allStudents) {
        if (!thisWeekStudentIds.contains(student.id)) continue;
        final name = '${student.firstName} ${student.lastName}'.trim();
        if (!_matchesStudent(student, name, trimmedQuery)) continue;
        rows.add(rowForStudent(student));
      }

    case TutorUsersTab.students:
      for (final student in allStudents) {
        final name = '${student.firstName} ${student.lastName}'.trim();
        if (!_matchesStudent(student, name, trimmedQuery)) continue;
        rows.add(rowForStudent(student));
      }

    case TutorUsersTab.parents:
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
            isThisWeek: children.any((c) => thisWeekStudentIds.contains(c.id)),
            account: parent,
          ),
        );
      }
  }

  rows.sort((a, b) {
    // In the full lists the tutor's own people come first: the directory is
    // for looking anyone up, but the people they teach are the likely target.
    if (tab != TutorUsersTab.thisWeek && a.isThisWeek != b.isThisWeek) {
      return a.isThisWeek ? -1 : 1;
    }
    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });

  return TutorUsersViewData(
    tab: tab,
    rows: rows,
    subtitle: switch (tab) {
      TutorUsersTab.thisWeek => 'Students in your classes this week',
      TutorUsersTab.students => 'Every student at Tenacity',
      TutorUsersTab.parents => 'Every parent at Tenacity',
    },
    thisWeekCount: thisWeekStudentIds
        .where((id) => allStudents.any((student) => student.id == id))
        .length,
    studentCount: allStudents.length,
    parentCount: parents.length,
    errorMessage: errorMessage,
  );
}

/// `Year 9 · Maths · Wed & Sat` — who they are and when they are taught.
String studentSubtitle({
  required String grade,
  required List<ClassModel> classes,
}) {
  final parts = <String>[];

  final year = yearLabelFor(grade);
  if (year.isNotEmpty) parts.add(year);

  // Subjects rather than full class names: the level is already in the year,
  // and `Year 9 · Year 9 Maths · Wed` reads badly.
  final subjects = <String>{
    for (final classModel in classes) subjectLabelFor(classModel.type),
  }..removeWhere((subject) => subject.isEmpty);
  if (subjects.isNotEmpty) parts.add(subjects.join(' & '));

  // Ordered Monday-first rather than by whichever class was read first, so a
  // student taught Monday and Tuesday does not read as "Tue & Mon".
  final weekdays = <int>{
    for (final classModel in classes) _weekdayIndex(classModel.dayOfWeek),
  }.where((index) => index > 0).toList()
    ..sort();
  if (weekdays.isNotEmpty) {
    parts.add(weekdays.map((index) => _dayNames[index - 1]).join(' & '));
  }

  return parts.join(' · ');
}

const _dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// 1 for Monday through 7 for Sunday, or 0 for a day this build cannot place.
int _weekdayIndex(String dayOfWeek) {
  final normalized = dayOfWeek.trim().toLowerCase();
  for (var i = 0; i < _dayNames.length; i++) {
    if (normalized.startsWith(_dayNames[i].toLowerCase())) return i + 1;
  }
  return 0;
}

/// `Maths` or `English` from a stored class type code.
///
/// Derived from the full label rather than a second lookup table, so a new
/// class code only has to be added in one place.
String subjectLabelFor(String type) {
  final label = formatDashboardClassType(type).toLowerCase();
  if (label.contains('math')) return 'Maths';
  if (label.contains('english')) return 'English';
  // A code with no single subject contributes nothing, rather than printing a
  // raw code at staff.
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
