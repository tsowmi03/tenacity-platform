import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';

/// Which side of the directory is showing.
enum AdminUsersTab { parents, students, tutors }

/// One person in the admin directory.
@immutable
class AdminUserRow {
  /// The account uid, or the student id on the students tab.
  final String id;

  final String name;
  final String initials;

  /// `Parent · Ella & Max · 8 tokens`, `Year 9 · Maths`, or `Tutor`.
  final String subtitle;

  /// Whether this family has an invoice past its due date.
  ///
  /// The only status V3 shows. The reference also carries `ACTIVE` and `TRIAL`;
  /// neither exists anywhere in the data, so neither is invented (§7, §11).
  final bool isOverdue;

  /// The account behind a parent or tutor row, so the detail screen opens
  /// without a second lookup. Null on a student row, which has no account.
  final AppUser? account;

  const AdminUserRow({
    required this.id,
    required this.name,
    required this.initials,
    required this.subtitle,
    this.isOverdue = false,
    this.account,
  });

  /// Students have no account, so nothing admin-only can be done to them from
  /// the directory; their row is informational.
  bool get canOpenAccount => account != null;
}

@immutable
class AdminUsersViewData {
  final AdminUsersTab tab;
  final List<AdminUserRow> rows;

  /// `248 students · 132 parents · 18 tutors`, from the whole directory rather
  /// than the filtered tab, so searching does not appear to lose people.
  final String summary;

  final int parentCount;
  final int studentCount;
  final int tutorCount;

  /// How many families are behind on an invoice, across the whole directory.
  final int overdueCount;

  final String? errorMessage;

  const AdminUsersViewData({
    required this.tab,
    required this.rows,
    required this.summary,
    required this.parentCount,
    required this.studentCount,
    required this.tutorCount,
    required this.overdueCount,
    this.errorMessage,
  });

  bool get isEmpty => rows.isEmpty;
}

/// The admin people directory.
///
/// Pure, so the scoping, search and status rules are testable without
/// Firestore.
///
/// Status is deliberately narrow. [invoices] is the whole invoice list, from
/// which a family counts as overdue when it holds an unpaid invoice past its
/// due date — the one status the data can actually support. Creating accounts
/// is out of scope, so the reference's `+` button is not shipped.
AdminUsersViewData buildAdminUsersViewData({
  required List<AppUser> allUsers,
  required Map<String, List<Student>> studentsByParent,
  required List<ClassModel> classes,
  required List<Invoice> invoices,
  required DateTime now,
  required AdminUsersTab tab,
  String query = '',
  String? errorMessage,
}) {
  final trimmed = query.trim().toLowerCase();

  final parents = allUsers.whereType<Parent>().toList(growable: false);
  final tutors =
      allUsers.where((user) => user.role == 'tutor').toList(growable: false);

  // Deduplicated, because two parents sharing a child appear in both lists.
  final students = <String, Student>{
    for (final list in studentsByParent.values)
      for (final student in list) student.id: student,
  };

  final overdueParentIds = _overdueParentIds(invoices, now);

  // Every class a student is enrolled in, for the student subtitle.
  final subjectsByStudent = <String, Set<String>>{};
  for (final classModel in classes) {
    for (final studentId in classModel.enrolledStudents) {
      subjectsByStudent
          .putIfAbsent(studentId, () => <String>{})
          .add(formatDashboardClassType(classModel.type));
    }
  }

  final childNames = <String, List<String>>{
    for (final entry in studentsByParent.entries)
      entry.key: entry.value
          .map((student) => student.firstName)
          .where((name) => name.trim().isNotEmpty)
          .toList(growable: false),
  };

  final rows = switch (tab) {
    AdminUsersTab.parents => [
        for (final parent in parents)
          AdminUserRow(
            id: parent.uid,
            name: '${parent.firstName} ${parent.lastName}'.trim(),
            initials: initialsFor('${parent.firstName} ${parent.lastName}'),
            subtitle:
                _parentSubtitle(parent, childNames[parent.uid] ?? const []),
            isOverdue: overdueParentIds.contains(parent.uid),
            account: parent,
          ),
      ],
    AdminUsersTab.students => [
        for (final student in students.values)
          AdminUserRow(
            id: student.id,
            name: '${student.firstName} ${student.lastName}'.trim(),
            initials: initialsFor('${student.firstName} ${student.lastName}'),
            subtitle: _studentSubtitle(
              student,
              subjectsByStudent[student.id] ?? const {},
            ),
          ),
      ],
    AdminUsersTab.tutors => [
        for (final tutor in tutors)
          AdminUserRow(
            id: tutor.uid,
            name: '${tutor.firstName} ${tutor.lastName}'.trim(),
            initials: initialsFor('${tutor.firstName} ${tutor.lastName}'),
            subtitle: 'Tutor',
            account: tutor,
          ),
      ],
  };

  rows.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  final visible = trimmed.isEmpty
      ? rows
      : rows
          .where((row) =>
              row.name.toLowerCase().contains(trimmed) ||
              row.subtitle.toLowerCase().contains(trimmed))
          .toList(growable: false);

  return AdminUsersViewData(
    tab: tab,
    rows: visible,
    summary: _summary(students.length, parents.length, tutors.length),
    parentCount: parents.length,
    studentCount: students.length,
    tutorCount: tutors.length,
    overdueCount: overdueParentIds.length,
    errorMessage: errorMessage,
  );
}

String _summary(int students, int parents, int tutors) {
  String part(int count, String singular) =>
      '$count $singular${count == 1 ? '' : 's'}';

  return [
    part(students, 'student'),
    part(parents, 'parent'),
    part(tutors, 'tutor'),
  ].join(' · ');
}

String _parentSubtitle(Parent parent, List<String> children) {
  final tokens = parent.lessonTokens;
  return [
    'Parent',
    if (children.isNotEmpty) joinNames(children),
    '$tokens ${tokens == 1 ? 'token' : 'tokens'}',
  ].join(' · ');
}

String _studentSubtitle(Student student, Set<String> subjects) {
  final year = student.grade.trim();
  return [
    if (year.isNotEmpty)
      year.toLowerCase().startsWith('year') ? year : 'Year $year',
    if (subjects.isNotEmpty) subjects.join(', '),
  ].join(' · ');
}

/// Families holding an unpaid invoice past its due date.
Set<String> _overdueParentIds(List<Invoice> invoices, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);

  return {
    for (final invoice in invoices)
      if (invoice.status != InvoiceStatus.paid &&
          _dueBefore(invoice.dueDate, today))
        invoice.parentId,
  };
}

bool _dueBefore(DateTime dueDate, DateTime today) {
  final due = dueDate.toLocal();
  return DateTime(due.year, due.month, due.day).isBefore(today);
}
