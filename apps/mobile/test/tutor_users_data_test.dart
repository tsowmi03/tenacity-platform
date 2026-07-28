import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/users/tutor/tutor_users_data.dart';

const _tutorId = 'tutor-1';

ClassModel _class({
  String id = 'c1',
  String type = 'stdmath11',
  String day = 'Monday',
  List<String> tutors = const [_tutorId],
  List<String> enrolled = const ['s1'],
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: '16:00',
    endTime: '17:00',
    capacity: 6,
    enrolledStudents: enrolled,
    tutors: tutors,
  );
}

Attendance _attendance({
  String id = 'T3_W1',
  List<String> attending = const ['s1'],
  List<String> tutors = const [_tutorId],
}) {
  return Attendance(
    id: id,
    date: DateTime(2026, 7, 20, 16),
    termId: 'T3',
    cancelled: false,
    updatedAt: DateTime(2026, 7, 20),
    updatedBy: 'system',
    weekNumber: 1,
    attendance: attending,
    tutors: tutors,
  );
}

Student _student({
  required String id,
  String firstName = 'Ava',
  String lastName = 'Smith',
  String grade = '9',
  List<String> parents = const ['p1'],
}) {
  return Student(
    id: id,
    firstName: firstName,
    lastName: lastName,
    parents: parents,
    grade: grade,
    subjects: const [],
  );
}

Parent _parent({required String uid, String firstName = 'Cara'}) {
  return Parent(
    uid: uid,
    firstName: firstName,
    lastName: 'Smith',
    email: '$uid@example.com',
    fcmTokens: const [],
    students: const [],
    phone: '',
    unreadChats: const {},
    activeChats: const [],
  );
}

TutorUsersViewData _build({
  List<ClassModel>? classes,
  Map<String, Attendance> attendanceByClass = const {},
  List<Student>? allStudents,
  List<AppUser>? allUsers,
  TutorUsersTab tab = TutorUsersTab.students,
  String query = '',
}) {
  return buildTutorUsersViewData(
    tutorId: _tutorId,
    classes: classes ?? [_class()],
    attendanceByClass: attendanceByClass,
    allStudents: allStudents ?? [_student(id: 's1')],
    allUsers: allUsers ?? [_parent(uid: 'p1')],
    tab: tab,
    query: query,
  );
}

void main() {
  group('scope', () {
    test('includes students from a standing assignment', () {
      final data = _build();
      expect(data.rows.single.name, 'Ava Smith');
      expect(data.studentCount, 1);
      expect(data.coverOnly, isFalse);
    });

    test('excludes students from classes this tutor does not teach', () {
      final data = _build(
        classes: [
          _class(tutors: const ['someone-else'], enrolled: const ['s1']),
        ],
      );
      expect(data.rows, isEmpty);
    });

    test('adds cover for the loaded week without losing standing classes', () {
      // The timetable treats the week's document as an override; the
      // directory must not, or handing over one week would empty it.
      final data = _build(
        classes: [
          _class(id: 'c1', enrolled: const ['s1']),
          _class(
            id: 'c2',
            tutors: const ['other-tutor'],
            enrolled: const ['s2'],
          ),
        ],
        attendanceByClass: {
          // Handed this week's own class to someone else...
          'c1': _attendance(tutors: const ['cover-tutor']),
          // ...and picked up cover on another.
          'c2': _attendance(id: 'T3_W1', tutors: const [_tutorId]),
        },
        allStudents: [
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'Ben'),
        ],
      );

      expect(data.rows.map((r) => r.name), ['Ava Smith', 'Ben Smith']);
    });

    test('flags a tutor whose work is all cover', () {
      final data = _build(
        classes: [
          _class(tutors: const ['other-tutor'], enrolled: const ['s1'])
        ],
        attendanceByClass: {
          'c1': _attendance(tutors: const [_tutorId])
        },
      );

      expect(data.rows, hasLength(1));
      expect(data.coverOnly, isTrue);
    });

    test('includes a visitor booked into the session this week', () {
      final data = _build(
        classes: [
          _class(enrolled: const ['s1'])
        ],
        attendanceByClass: {
          'c1': _attendance(attending: const ['s1', 's2']),
        },
        allStudents: [
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'Ben'),
        ],
      );

      expect(data.rows.map((r) => r.name), ['Ava Smith', 'Ben Smith']);
    });

    test('parents are those of the scoped students only', () {
      final data = _build(
        classes: [
          _class(enrolled: const ['s1'])
        ],
        allStudents: [
          _student(id: 's1', parents: const ['p1']),
          _student(id: 's2', parents: const ['p2']),
        ],
        allUsers: [_parent(uid: 'p1'), _parent(uid: 'p2', firstName: 'Dana')],
        tab: TutorUsersTab.parents,
      );

      expect(data.rows.map((r) => r.id), ['p1']);
      expect(data.parentCount, 1);
    });

    test('a parent row names their children and has no feedback action', () {
      final data = _build(
        classes: [
          _class(enrolled: const ['s1', 's2'])
        ],
        allStudents: [
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'Ben'),
        ],
        tab: TutorUsersTab.parents,
      );

      final parent = data.rows.single;
      expect(parent.subtitle, 'Ava · Ben');
      expect(parent.hasFeedbackAction, isFalse);
      expect(parent.account, isNotNull);
    });

    test('a student row carries a feedback action and no account', () {
      final row = _build().rows.single;
      expect(row.hasFeedbackAction, isTrue);
      expect(row.account, isNull);
    });

    test('counts both sides regardless of the visible tab', () {
      final data = _build(tab: TutorUsersTab.parents);
      expect(data.studentCount, 1);
      expect(data.parentCount, 1);
    });
  });

  group('search', () {
    test('matches a student by name or year', () {
      expect(_build(query: 'ava').rows, hasLength(1));
      expect(_build(query: 'zzz').rows, isEmpty);
      expect(_build(query: '9').rows, hasLength(1));
    });

    test("matches a parent by their child's name", () {
      final data = _build(
        allStudents: [_student(id: 's1', firstName: 'Ava')],
        allUsers: [_parent(uid: 'p1', firstName: 'Cara')],
        tab: TutorUsersTab.parents,
        query: 'ava',
      );

      expect(data.rows, hasLength(1));
    });
  });

  group('studentSubtitle', () {
    test('names the year, subject and days', () {
      expect(
        studentSubtitle(
          grade: '9',
          classes: [
            _class(type: 'stdmath11', day: 'Wednesday'),
            _class(type: 'advmath11', day: 'Saturday'),
          ],
        ),
        'Year 9 · Maths · Wed & Sat',
      );
    });

    test('does not repeat a subject taught on two days', () {
      expect(
        studentSubtitle(
          grade: '9',
          classes: [
            _class(type: 'stdmath11', day: 'Wednesday'),
            _class(type: 'stdmath11', day: 'Friday'),
          ],
        ),
        'Year 9 · Maths · Wed & Fri',
      );
    });

    test('omits a subject it cannot name rather than printing a code', () {
      // The junior class code covers several subjects at once.
      expect(
        studentSubtitle(grade: '7', classes: [_class(type: '5-10')]),
        'Year 7 · Mon',
      );
    });

    test('survives a student with no grade and no classes', () {
      expect(studentSubtitle(grade: '', classes: const []), '');
    });
  });

  group('subjectLabelFor', () {
    test('reads the subject out of the class label', () {
      expect(subjectLabelFor('stdmath11'), 'Maths');
      expect(subjectLabelFor('ex2math12'), 'Maths');
      expect(subjectLabelFor('adveng12'), 'English');
    });

    test('is empty for a code with no single subject', () {
      expect(subjectLabelFor('5-10'), '');
      expect(subjectLabelFor('something-new'), '');
    });
  });
}
