import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_data.dart';

final _now = DateTime(2026, 7, 28);

void main() {
  group('kind', _kind);
  group('students', _students);
  group('invoices', _invoices);
  group('destructive copy', _destructive);
}

void _kind() {
  test('a parent offers tokens; a tutor does not', () {
    final parent = _build(user: _parent(tokens: 8));
    expect(parent.isParent, isTrue);
    expect(parent.lessonTokens, 8);
    expect(parent.canEditTokens, isTrue);
    expect(parent.roleLabel, 'Parent');

    final tutor = _build(user: _tutor());
    expect(tutor.isParent, isFalse);
    expect(tutor.lessonTokens, isNull);
    expect(tutor.canEditTokens, isFalse);
    expect(tutor.roleLabel, 'Tutor');
  });

  test('zero tokens is shown, not treated as absent', () {
    // A family with no credits left is exactly who an admin is looking at.
    final data = _build(user: _parent(tokens: 0));
    expect(data.lessonTokens, 0);
    expect(data.canEditTokens, isTrue);
  });
}

void _students() {
  test('children carry their year and enrolled classes', () {
    final data = _build(
      students: [_student(id: 's1', first: 'Ella', grade: '9')],
      classes: [
        _class(
            id: 'c1',
            type: 'advmath11',
            day: 'Wednesday',
            start: '16:00',
            enrolled: const ['s1']),
        _class(
            id: 'c2',
            type: '5-10',
            day: 'Saturday',
            start: '10:00',
            enrolled: const ['s1']),
        _class(
            id: 'c3',
            type: '5-10',
            day: 'Monday',
            start: '16:00',
            enrolled: const ['other']),
      ],
    );

    final ella = data.students.single;
    expect(ella.yearLabel, 'Year 9');
    expect(ella.subtitle, 'Year 9 · 2 classes');
    expect(ella.enrolments.map((e) => e.classId), ['c1', 'c2']);
    expect(ella.enrolments.first.whenLabel, 'Wed 4:00 PM');
  });

  test('a child with no classes still reads correctly', () {
    final data = _build(
      students: [_student(id: 's1', first: 'Ella', grade: 'Year 9')],
    );

    expect(data.students.single.subtitle, 'Year 9');
    expect(data.students.single.enrolments, isEmpty);
  });

  test('children are sorted by name', () {
    final data = _build(
      students: [
        _student(id: 's2', first: 'Max'),
        _student(id: 's1', first: 'Ella'),
      ],
    );

    expect(data.students.map((s) => s.name), ['Ella Nguyen', 'Max Nguyen']);
  });
}

void _invoices() {
  test('only this person\'s invoices appear', () {
    // The controller holds whatever was last loaded, which may be another
    // family's billing.
    final data = _build(
      invoices: [
        _invoice(id: 'mine', parentId: 'p1', dueIn: -3),
        _invoice(id: 'theirs', parentId: 'other', dueIn: -3),
      ],
    );

    expect(data.invoices.map((i) => i.id), ['mine']);
  });

  test('an unpaid invoice past its due date reads OVERDUE', () {
    final data = _build(
      invoices: [_invoice(id: 'a', parentId: 'p1', dueIn: -1)],
    );

    expect(data.invoices.single.statusLabel, 'OVERDUE');
    expect(data.hasOverdueInvoice, isTrue);
  });

  test('an unpaid invoice not yet due reads UNPAID', () {
    final data = _build(
      invoices: [_invoice(id: 'a', parentId: 'p1', dueIn: 5)],
    );

    expect(data.invoices.single.statusLabel, 'UNPAID');
    expect(data.invoices.single.dateLabel, 'Due 2 Aug');
    expect(data.hasOverdueInvoice, isFalse);
  });

  test('a paid invoice is never overdue and shows when it was paid', () {
    final data = _build(
      invoices: [
        _invoice(
          id: 'a',
          parentId: 'p1',
          dueIn: -30,
          status: InvoiceStatus.paid,
          paidDaysAgo: 2,
        ),
      ],
    );

    expect(data.invoices.single.statusLabel, 'PAID');
    expect(data.invoices.single.isOverdue, isFalse);
    expect(data.invoices.single.dateLabel, 'Paid 26 Jul');
  });

  test('newest first', () {
    final data = _build(
      invoices: [
        _invoice(id: 'old', parentId: 'p1', dueIn: -1, createdDaysAgo: 40),
        _invoice(id: 'new', parentId: 'p1', dueIn: -1, createdDaysAgo: 2),
      ],
    );

    expect(data.invoices.map((i) => i.id), ['new', 'old']);
  });
}

void _destructive() {
  test('removing a parent warns that it takes their children too', () {
    final data = _build(user: _parent());

    expect(data.removeLabel, 'Remove parent & students');
    expect(data.removeWarning, contains('every student linked to them'));
    expect(data.removeWarning, contains('cannot be undone'));
  });

  test('removing a tutor does not claim to remove students', () {
    final data = _build(user: _tutor());

    expect(data.removeLabel, 'Remove tutor');
    expect(data.removeWarning, isNot(contains('student')));
    expect(data.removeWarning, contains('cannot be undone'));
  });
}

AdminPersonViewData _build({
  AppUser? user,
  List<Student> students = const [],
  List<ClassModel> classes = const [],
  List<Invoice> invoices = const [],
}) {
  return buildAdminPersonViewData(
    user: user ?? _parent(),
    students: students,
    classes: classes,
    invoices: invoices,
    now: _now,
  );
}

Parent _parent({int tokens = 4}) => Parent(
      uid: 'p1',
      firstName: 'Sarah',
      lastName: 'Nguyen',
      email: 'sarah@example.com',
      fcmTokens: const [],
      students: const [],
      phone: '0400 000 000',
      unreadChats: const {},
      activeChats: const [],
      lessonTokens: tokens,
    );

AppUser _tutor() => Tutor(
      uid: 't1',
      role: 'tutor',
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'jordan@example.com',
      fcmTokens: const [],
      phone: '',
      unreadChats: const {},
      activeChats: const [],
    );

Student _student({
  required String id,
  required String first,
  String last = 'Nguyen',
  String grade = 'Year 9',
}) =>
    Student(
      id: id,
      firstName: first,
      lastName: last,
      parents: const ['p1'],
      grade: grade,
      subjects: const [],
    );

ClassModel _class({
  required String id,
  required String type,
  required String day,
  required String start,
  required List<String> enrolled,
}) =>
    ClassModel(
      id: id,
      type: type,
      dayOfWeek: day,
      startTime: start,
      endTime: '17:00',
      capacity: 8,
      enrolledStudents: enrolled,
      tutors: const ['t1'],
    );

Invoice _invoice({
  required String id,
  required String parentId,
  required int dueIn,
  InvoiceStatus status = InvoiceStatus.unpaid,
  int paidDaysAgo = 0,
  int createdDaysAgo = 30,
}) =>
    Invoice(
      id: id,
      parentId: parentId,
      parentName: 'Sarah Nguyen',
      parentEmail: '',
      lineItems: const [],
      weeks: 1,
      amountDue: 180,
      status: status,
      dueDate: _now.add(Duration(days: dueIn)),
      createdAt: _now.subtract(Duration(days: createdDaysAgo)),
      invoiceNumber: 'INV-0${id.hashCode.abs() % 900 + 100}',
      paidAt: status == InvoiceStatus.paid
          ? _now.subtract(Duration(days: paidDaysAgo))
          : null,
    );
