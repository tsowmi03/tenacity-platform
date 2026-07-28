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
  bool cancelled = false,
}) {
  return Attendance(
    id: id,
    date: DateTime(2026, 7, 20, 16),
    termId: 'T3',
    cancelled: cancelled,
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
  Map<String, Attendance> weekAttendanceByClass = const {},
  List<Student>? allStudents,
  List<AppUser>? allUsers,
  TutorUsersTab tab = TutorUsersTab.thisWeek,
  String query = '',
}) {
  return buildTutorUsersViewData(
    tutorId: _tutorId,
    classes: classes ?? [_class()],
    weekAttendanceByClass: weekAttendanceByClass,
    allStudents: allStudents ?? [_student(id: 's1')],
    allUsers: allUsers ?? [_parent(uid: 'p1')],
    tab: tab,
    query: query,
  );
}

void main() {
  group('this week', () {
    test('lists the students in a standing class', () {
      final data = _build();
      expect(data.rows.single.name, 'Ava Smith');
      expect(data.thisWeekCount, 1);
    });

    test('lists students in a class covered this week', () {
      final data = _build(
        classes: [
          _class(tutors: const ['other-tutor'], enrolled: const ['s1'])
        ],
        weekAttendanceByClass: {
          'c1': _attendance(tutors: const [_tutorId])
        },
      );

      expect(data.rows, hasLength(1));
    });

    test('keeps a standing class handed to a substitute this week', () {
      // The timetable removes it from this tutor's week; the directory does
      // not, because they have not stopped teaching the class.
      final data = _build(
        weekAttendanceByClass: {
          'c1': _attendance(tutors: const ['cover'])
        },
      );

      expect(data.rows, hasLength(1));
    });

    test('excludes a cancelled session', () {
      final data = _build(
        weekAttendanceByClass: {
          'c1': _attendance(cancelled: true),
        },
      );

      expect(data.rows, isEmpty);
      expect(data.thisWeekCount, 0);
    });

    test('includes a visitor booked into the session this week', () {
      final data = _build(
        classes: [
          _class(enrolled: const ['s1'])
        ],
        weekAttendanceByClass: {
          'c1': _attendance(attending: const ['s1', 's2']),
        },
        allStudents: [
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'Ben'),
        ],
      );

      expect(data.rows.map((r) => r.name), ['Ava Smith', 'Ben Smith']);
    });

    test('excludes students from classes this tutor does not teach', () {
      final data = _build(
        classes: [
          _class(tutors: const ['someone-else'], enrolled: const ['s1'])
        ],
      );

      expect(data.rows, isEmpty);
    });

    test('carries no marker, since every row is theirs', () {
      expect(_build().rows.single.isThisWeek, isTrue);
    });
  });

  group('full directory', () {
    test('every student is reachable, not only the ones taught', () {
      // Tutors may look anyone up; the tabs order attention, not access.
      final data = _build(
        classes: [
          _class(tutors: const ['someone-else'], enrolled: const ['s1'])
        ],
        allStudents: [
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'Ben'),
        ],
        tab: TutorUsersTab.students,
      );

      expect(data.rows, hasLength(2));
      expect(data.studentCount, 2);
    });

    test('every parent is reachable', () {
      final data = _build(
        classes: [
          _class(tutors: const ['someone-else'], enrolled: const ['s1'])
        ],
        allUsers: [_parent(uid: 'p1'), _parent(uid: 'p2', firstName: 'Dana')],
        tab: TutorUsersTab.parents,
      );

      expect(data.rows, hasLength(2));
      expect(data.parentCount, 2);
    });

    test("the tutor's own students sort first and are marked", () {
      final data = _build(
        classes: [
          _class(enrolled: const ['s2'])
        ],
        allStudents: [
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'Zoe'),
        ],
        tab: TutorUsersTab.students,
      );

      // Zoe is taught by this tutor, so she leads despite the alphabet.
      expect(data.rows.map((r) => r.name), ['Zoe Smith', 'Ava Smith']);
      expect(data.rows.first.isThisWeek, isTrue);
      expect(data.rows.last.isThisWeek, isFalse);
    });

    test('a parent is marked when any of their children is taught', () {
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

      expect(data.rows.first.id, 'p1');
      expect(data.rows.first.isThisWeek, isTrue);
      expect(data.rows.last.isThisWeek, isFalse);
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

    test('counts every tab regardless of which is visible', () {
      final data = _build(
        allStudents: [
          _student(id: 's1'),
          _student(id: 's2', firstName: 'Ben'),
        ],
        tab: TutorUsersTab.parents,
      );

      expect(data.thisWeekCount, 1);
      expect(data.studentCount, 2);
      expect(data.parentCount, 1);
    });

    test('names its scope in the subtitle', () {
      expect(
        _build(tab: TutorUsersTab.thisWeek).subtitle,
        'Students in your classes this week',
      );
      expect(
        _build(tab: TutorUsersTab.students).subtitle,
        'Every student at Tenacity',
      );
    });

    test('a student in nobody\'s class still gets a subtitle', () {
      final data = _build(
        classes: [
          _class(enrolled: const ['s1'], day: 'Wednesday')
        ],
        allStudents: [_student(id: 's1', grade: '9')],
        tab: TutorUsersTab.students,
      );

      expect(data.rows.single.subtitle, 'Year 9 · Maths · Wed');
    });
  });

  group('search', () {
    test('matches a student by name or year', () {
      expect(_build(query: 'ava').rows, hasLength(1));
      expect(_build(query: 'zzz').rows, isEmpty);
      expect(_build(query: '9').rows, hasLength(1));
    });

    test('searches the whole directory, not just this week', () {
      final data = _build(
        classes: [
          _class(tutors: const ['someone-else'], enrolled: const ['s1'])
        ],
        allStudents: [_student(id: 's1', firstName: 'Ava')],
        tab: TutorUsersTab.students,
        query: 'ava',
      );

      expect(data.rows, hasLength(1));
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

    test('orders days Monday first, whatever order the classes arrive in', () {
      // Read straight from the class list this came out as "Tue & Mon".
      expect(
        studentSubtitle(
          grade: '10',
          classes: [
            _class(type: '5-10', day: 'Tuesday'),
            _class(type: '5-10', day: 'Monday'),
          ],
        ),
        'Year 10 · Mon & Tue',
      );
    });

    test('drops a day it cannot place rather than guessing', () {
      expect(
        studentSubtitle(grade: '9', classes: [_class(type: '5-10', day: '')]),
        'Year 9',
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
