import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';
import 'package:tenacity/src/ui/users/admin/admin_users_data.dart';

final _now = DateTime(2026, 7, 28, 10);

void main() {
  group('tabs', _tabs);
  group('overdue status', _overdue);
  group('search', _search);
  group('summary', _summary);
  group('exclusions', _exclusions);
}

void _tabs() {
  test('parents carry their children and token balance', () {
    final data = _build(tab: AdminUsersTab.parents);

    final sarah = data.rows.firstWhere((r) => r.name == 'Sarah Nguyen');
    expect(sarah.subtitle, 'Parent · Ella & Max · 8 tokens');
    expect(sarah.account, isNotNull);
  });

  test('a single token reads in the singular', () {
    final data = _build(
      tab: AdminUsersTab.parents,
      users: [_parent(uid: 'p9', first: 'Solo', last: 'Token', tokens: 1)],
      studentsByParent: const {},
    );

    expect(data.rows.single.subtitle, 'Parent · 1 token');
  });

  test('students are deduplicated across parents who share them', () {
    // Ella belongs to both parents; she must appear once.
    final data = _build(
      tab: AdminUsersTab.students,
      studentsByParent: {
        'p1': [_student(id: 's1', first: 'Ella')],
        'p2': [_student(id: 's1', first: 'Ella')],
      },
    );

    expect(data.rows, hasLength(1));
    expect(data.studentCount, 1);
  });

  test('a student subtitle carries year and subjects', () {
    final data = _build(tab: AdminUsersTab.students);

    final ella = data.rows.firstWhere((r) => r.name == 'Ella Nguyen');
    expect(ella.subtitle, 'Year 9 · Years 5–10');
    // No account behind a student, so nothing admin-only can be opened.
    expect(ella.canOpenAccount, isFalse);
  });

  test('tutors list with an account and no token line', () {
    final data = _build(tab: AdminUsersTab.tutors);

    expect(data.rows.single.name, 'Jordan Lee');
    expect(data.rows.single.subtitle, 'Tutor');
    expect(data.rows.single.canOpenAccount, isTrue);
  });

  test('rows are sorted by name', () {
    final data = _build(tab: AdminUsersTab.parents);

    final names = data.rows.map((r) => r.name).toList();
    final sorted = [...names]..sort();
    expect(names, sorted);
  });
}

void _overdue() {
  test('a family past its due date is marked overdue', () {
    final data = _build(
      tab: AdminUsersTab.parents,
      invoices: [
        _invoice(parentId: 'p1', due: DateTime(2026, 7, 20)),
      ],
    );

    expect(data.rows.firstWhere((r) => r.id == 'p1').isOverdue, isTrue);
    expect(data.rows.firstWhere((r) => r.id == 'p2').isOverdue, isFalse);
    expect(data.overdueCount, 1);
  });

  test('a paid invoice never marks a family overdue', () {
    final data = _build(
      tab: AdminUsersTab.parents,
      invoices: [
        _invoice(
          parentId: 'p1',
          due: DateTime(2026, 7, 1),
          status: InvoiceStatus.paid,
        ),
      ],
    );

    expect(data.rows.firstWhere((r) => r.id == 'p1').isOverdue, isFalse);
    expect(data.overdueCount, 0);
  });

  test('an invoice due today is not yet overdue', () {
    final data = _build(
      tab: AdminUsersTab.parents,
      invoices: [_invoice(parentId: 'p1', due: DateTime(2026, 7, 28))],
    );

    expect(data.rows.firstWhere((r) => r.id == 'p1').isOverdue, isFalse);
  });

  test('with no invoices loaded, nobody is marked', () {
    // The invoice read is best-effort; failing it must not accuse families of
    // being behind.
    final data = _build(tab: AdminUsersTab.parents, invoices: const []);

    expect(data.rows.every((r) => !r.isOverdue), isTrue);
    expect(data.overdueCount, 0);
  });
}

void _search() {
  test('matches on name', () {
    final data = _build(tab: AdminUsersTab.parents, query: 'wei');

    expect(data.rows.single.name, 'Wei Chen');
  });

  test('matches on the subtitle, so a parent is findable by their child', () {
    final data = _build(tab: AdminUsersTab.parents, query: 'max');

    expect(data.rows.single.name, 'Sarah Nguyen');
  });

  test('a query with no match empties the list rather than erroring', () {
    final data = _build(tab: AdminUsersTab.parents, query: 'zzzz');

    expect(data.isEmpty, isTrue);
    // Counts still describe the whole directory, so searching does not look
    // like people have disappeared.
    expect(data.parentCount, 3);
  });
}

void _summary() {
  test('counts the whole directory, not the filtered tab', () {
    final data = _build(tab: AdminUsersTab.tutors, query: 'jordan');

    expect(data.summary, '2 students · 3 parents · 1 tutor');
  });

  test('singular and plural both read correctly', () {
    final data = _build(
      tab: AdminUsersTab.parents,
      users: [_parent(uid: 'p1', first: 'Solo', last: 'Parent')],
      studentsByParent: {
        'p1': [_student(id: 's1', first: 'One')],
      },
    );

    expect(data.summary, '1 student · 1 parent · 0 tutors');
  });
}

void _exclusions() {
  test('no row ever claims a status the data cannot support', () {
    // The reference shows ACTIVE and TRIAL pills. Neither exists anywhere in
    // the data, so only OVERDUE is derived — see §7/§11.
    final data = _build(
      tab: AdminUsersTab.parents,
      invoices: [_invoice(parentId: 'p1', due: DateTime(2026, 7, 1))],
    );

    // isOverdue is the only status the row model carries at all.
    expect(data.rows.where((r) => r.isOverdue), hasLength(1));
    expect(data.rows.where((r) => !r.isOverdue), hasLength(2));
  });
}

AdminUsersViewData _build({
  required AdminUsersTab tab,
  List<AppUser>? users,
  Map<String, List<Student>>? studentsByParent,
  List<Invoice> invoices = const [],
  String query = '',
}) {
  return buildAdminUsersViewData(
    allUsers: users ??
        [
          _parent(uid: 'p1', first: 'Sarah', last: 'Nguyen', tokens: 8),
          _parent(uid: 'p2', first: 'Wei', last: 'Chen', tokens: 0),
          _parent(uid: 'p3', first: 'Anita', last: 'Patel', tokens: 6),
          _tutor(uid: 't1', first: 'Jordan', last: 'Lee'),
        ],
    studentsByParent: studentsByParent ??
        {
          'p1': [
            _student(id: 's1', first: 'Ella', last: 'Nguyen', grade: 'Year 9'),
            _student(id: 's2', first: 'Max', last: 'Nguyen', grade: 'Year 7'),
          ],
        },
    classes: [
      ClassModel(
        id: 'c1',
        type: '5-10',
        dayOfWeek: 'Wednesday',
        startTime: '16:00',
        endTime: '17:00',
        capacity: 8,
        enrolledStudents: const ['s1'],
        tutors: const ['t1'],
      ),
    ],
    invoices: invoices,
    now: _now,
    tab: tab,
    query: query,
  );
}

Parent _parent({
  required String uid,
  required String first,
  required String last,
  int tokens = 0,
}) {
  return Parent(
    uid: uid,
    firstName: first,
    lastName: last,
    email: '$uid@example.com',
    fcmTokens: const [],
    students: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
    lessonTokens: tokens,
  );
}

AppUser _tutor({
  required String uid,
  required String first,
  required String last,
}) {
  return Tutor(
    uid: uid,
    role: 'tutor',
    firstName: first,
    lastName: last,
    email: '$uid@example.com',
    fcmTokens: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
  );
}

Student _student({
  required String id,
  required String first,
  String last = 'Nguyen',
  String grade = 'Year 9',
}) {
  return Student(
    id: id,
    firstName: first,
    lastName: last,
    parents: const [],
    grade: grade,
    subjects: const [],
  );
}

Invoice _invoice({
  required String parentId,
  required DateTime due,
  InvoiceStatus status = InvoiceStatus.unpaid,
}) {
  return Invoice(
    id: 'inv-$parentId',
    parentId: parentId,
    parentName: '',
    parentEmail: '',
    lineItems: const [],
    weeks: 1,
    amountDue: 100,
    status: status,
    dueDate: due,
    createdAt: DateTime(2026, 7, 1),
  );
}
