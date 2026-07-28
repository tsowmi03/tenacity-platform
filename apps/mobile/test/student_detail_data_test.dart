import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/users/tutor/student_detail_data.dart';

const _tutorId = 'tutor-1';
final _now = DateTime(2026, 7, 28, 12);

ClassModel _class({
  String id = 'c1',
  String type = 'stdmath11',
  String day = 'Wednesday',
  String startTime = '16:30',
  List<String> tutors = const [_tutorId],
  List<String> enrolled = const ['s1'],
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: startTime,
    endTime: '17:30',
    capacity: 6,
    enrolledStudents: enrolled,
    tutors: tutors,
  );
}

Student _student({String grade = '9', List<String> parents = const ['p1']}) {
  return Student(
    id: 's1',
    firstName: 'Ella',
    lastName: 'Nguyen',
    parents: parents,
    grade: grade,
    subjects: const [],
  );
}

Parent _parent({String uid = 'p1', String firstName = 'Sarah'}) {
  return Parent(
    uid: uid,
    firstName: firstName,
    lastName: 'Nguyen',
    email: '$uid@example.com',
    fcmTokens: const [],
    students: const ['s1'],
    phone: '0400000000',
    unreadChats: const {},
    activeChats: const [],
  );
}

StudentDetailData _build({
  Student? student,
  List<ClassModel>? classes,
  List<AppUser>? allUsers,
  List<StudentFeedback> feedback = const [],
}) {
  return buildStudentDetailData(
    student: student ?? _student(),
    tutorId: _tutorId,
    classes: classes ?? [_class()],
    allUsers: allUsers ?? [_parent()],
    feedback: feedback,
    tutorNamesById: const {_tutorId: 'Jordan Lee'},
    now: _now,
  );
}

void main() {
  group('identity', () {
    test('names the student and summarises their load', () {
      final data = _build();
      expect(data.name, 'Ella Nguyen');
      expect(data.initials, 'EN');
      expect(data.subtitle, 'Year 9 · 1 class');
    });

    test('pluralises the class count', () {
      final data = _build(
        classes: [_class(), _class(id: 'c2', day: 'Saturday')],
      );
      expect(data.subtitle, 'Year 9 · 2 classes');
    });

    test('omits a missing grade rather than printing an empty year', () {
      final data = _build(student: _student(grade: ''));
      expect(data.yearLabel, '');
      expect(data.subtitle, '1 class');
    });
  });

  group('classes', () {
    test('lists only the classes this student is in', () {
      final data = _build(
        classes: [
          _class(id: 'c1', enrolled: const ['s1']),
          _class(id: 'c2', enrolled: const ['someone-else']),
        ],
      );

      expect(data.classes.map((c) => c.classId), ['c1']);
    });

    test("marks and leads with the viewing tutor's own classes", () {
      final data = _build(
        classes: [
          _class(id: 'c1', type: 'adveng12', tutors: const ['other']),
          _class(id: 'c2', type: 'stdmath11'),
        ],
      );

      expect(data.classes.first.classId, 'c2');
      expect(data.classes.first.isMine, isTrue);
      expect(data.classes.last.isMine, isFalse);
    });

    test('names when the class runs', () {
      expect(_build().classes.single.whenLabel, 'Wednesday, 4:30 PM');
    });

    test('shows an unparseable time as stored', () {
      final data = _build(classes: [_class(startTime: 'evening')]);
      expect(data.classes.single.whenLabel, 'Wednesday, evening');
    });
  });

  group('family', () {
    test('resolves the parents on the record', () {
      final data = _build();
      expect(data.family.single.name, 'Sarah Nguyen');
      expect(data.family.single.email, 'p1@example.com');
    });

    test('skips a parent id with no loaded account', () {
      final data = _build(
        student: _student(parents: const ['p1', 'missing']),
      );
      expect(data.family.map((f) => f.uid), ['p1']);
    });

    test('sorts by name', () {
      final data = _build(
        student: _student(parents: const ['p2', 'p1']),
        allUsers: [
          _parent(uid: 'p1', firstName: 'Zoe'),
          _parent(uid: 'p2', firstName: 'Adam'),
        ],
      );

      expect(data.family.map((f) => f.uid), ['p2', 'p1']);
    });
  });

  group('latest feedback', () {
    StudentFeedback feedback({
      required String id,
      required DateTime createdAt,
    }) {
      return StudentFeedback(
        id: id,
        studentId: 's1',
        tutorId: _tutorId,
        parentIds: const ['p1'],
        feedback: 'Note $id',
        subject: 'Year 11 Standard Maths',
        createdAt: createdAt,
        isUnread: false,
      );
    }

    test('surfaces the most recent note and the total', () {
      final data = _build(
        feedback: [
          feedback(id: 'old', createdAt: DateTime(2026, 5, 1)),
          feedback(id: 'new', createdAt: DateTime(2026, 7, 1)),
        ],
      );

      expect(data.latestFeedback?.id, 'new');
      expect(data.latestFeedback?.attribution,
          'Jordan Lee · Year 11 Standard Maths');
      expect(data.feedbackCount, 2);
    });

    test('is absent when nothing has been written', () {
      final data = _build();
      expect(data.latestFeedback, isNull);
      expect(data.feedbackCount, 0);
    });
  });
}
