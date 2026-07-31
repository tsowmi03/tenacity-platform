import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/classes/tutor/class_roll_data.dart';

ClassModel _class({List<String> enrolled = const ['s1', 's2', 's3']}) {
  return ClassModel(
    id: 'c1',
    type: 'stdmath11',
    dayOfWeek: 'Monday',
    startTime: '16:00',
    endTime: '17:00',
    capacity: 6,
    enrolledStudents: enrolled,
    tutors: const ['tutor-1'],
  );
}

Student _student({
  required String id,
  String firstName = 'Ada',
  String lastName = 'Lovelace',
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

StudentFeedback _feedback({
  required String studentId,
  String text = 'Great work today.',
  StudentProgress? progress,
}) {
  return StudentFeedback(
    id: 'f-$studentId',
    studentId: studentId,
    tutorId: 'tutor-1',
    parentIds: const ['p1'],
    feedback: text,
    subject: 'Year 11 Standard Maths',
    createdAt: DateTime(2026, 7, 20, 17),
    isUnread: true,
    classId: 'c1',
    sessionId: 'T3_W1',
    progress: progress,
  );
}

/// Every student marked here.
const _allHere = {
  's1': RollMark.here,
  's2': RollMark.here,
  's3': RollMark.here,
};

/// Ava turned up, the other two did not.
const _oneHereTwoAway = {
  's1': RollMark.here,
  's2': RollMark.away,
  's3': RollMark.away,
};

const _allAway = {
  's1': RollMark.away,
  's2': RollMark.away,
  's3': RollMark.away,
};

ClassRollViewData _build({
  List<Student>? roster,
  Map<String, RollMark> marks = const {'s1': RollMark.here},
  List<StudentFeedback> sessionFeedback = const [],
  DateTime? now,
  bool cancelled = false,
}) {
  return buildClassRollViewData(
    classInfo: _class(),
    roster: roster ??
        [
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'Ben'),
          _student(id: 's3', firstName: 'Cleo'),
        ],
    marks: marks,
    sessionFeedback: sessionFeedback,
    sessionStart: DateTime(2026, 7, 20, 16),
    sessionEnd: DateTime(2026, 7, 20, 17),
    now: now ?? DateTime(2026, 7, 20, 18),
    cancelled: cancelled,
  );
}

void main() {
  group('attendance derivation', () {
    test('a student marked here is here', () {
      final data = _build(marks: const {'s1': RollMark.here});
      expect(data.students.first.attendance, RollAttendance.here);
    });

    test('a student with no mark is unmarked, not away', () {
      // The two used to be indistinguishable — one list held present students
      // only, so "nobody marked yet" and "everybody was away" looked alike and
      // the screen had to be told which it was.
      final data = _build(marks: const {'s1': RollMark.here});
      final ben = data.students.firstWhere((s) => s.studentId == 's2');

      expect(ben.attendance, RollAttendance.unmarked);
      expect(data.unmarkedCount, 2);
      expect(data.isAttendanceComplete, isFalse);
    });

    test('a student marked away is away', () {
      final data = _build(marks: _oneHereTwoAway);
      final ben = data.students.firstWhere((s) => s.studentId == 's2');

      expect(ben.attendance, RollAttendance.away);
      expect(data.unmarkedCount, 0);
      expect(data.isAttendanceComplete, isTrue);
    });

    test('two tutors marking opposite halves merge into one roll', () {
      // The scenario the marks map exists for: each tutor writes only their
      // own keys, so the document ends up holding both sets.
      final data = _build(
        marks: const {
          's1': RollMark.here,
          's2': RollMark.away,
          's3': RollMark.here,
        },
      );

      expect(
        data.students.map((s) => s.attendance),
        [RollAttendance.here, RollAttendance.away, RollAttendance.here],
      );
      expect(data.isAttendanceComplete, isTrue);
    });

    test('a mark for someone off the roster is ignored', () {
      // A student removed from the class after being marked. They are not on
      // the roll, so they neither appear nor block completion.
      final data = _build(
        marks: const {..._allHere, 'departed': RollMark.here},
      );

      expect(data.students, hasLength(3));
      expect(data.isAttendanceComplete, isTrue);
    });

    test('sorts by name so the roll reads the same every time', () {
      final data = _build(
        roster: [
          _student(id: 's3', firstName: 'zoe'),
          _student(id: 's1', firstName: 'Ava'),
          _student(id: 's2', firstName: 'ben'),
        ],
      );

      expect(
        data.students.map((s) => s.studentId),
        ['s1', 's2', 's3'],
      );
    });
  });

  group('completion', () {
    test('an away student is complete without feedback', () {
      final data = _build(marks: _allAway);

      expect(data.students.every((s) => s.isAway), isTrue);
      expect(data.completeCount, 3);
      expect(data.progressLabel, '3 of 3 complete');
      expect(data.outstandingLabel, isNull);
    });

    test('a present student is incomplete until written about', () {
      final data = _build(marks: _oneHereTwoAway);
      final ava = data.students.firstWhere((s) => s.studentId == 's1');

      expect(ava.needsFeedback, isTrue);
      expect(ava.isComplete, isFalse);
      expect(data.progressLabel, '2 of 3 complete');
    });

    test('feedback already sent counts as complete', () {
      final data = _build(
        marks: _oneHereTwoAway,
        sessionFeedback: [_feedback(studentId: 's1')],
      );
      final ava = data.students.firstWhere((s) => s.studentId == 's1');

      expect(ava.feedbackAlreadySent, isTrue);
      expect(ava.needsFeedback, isFalse);
      expect(ava.isComplete, isTrue);
      expect(data.progressLabel, '3 of 3 complete');
    });

    test('an unmarked student never counts as awaiting feedback', () {
      // Nothing is owed for someone who has not been marked yet — that is a
      // different, earlier question.
      final data = _build(marks: const {});

      expect(data.awaitingFeedback, isEmpty);
      expect(data.unmarkedCount, 3);
      expect(data.outstandingLabel, '3 still to mark');
    });

    test('reports both kinds of outstanding work', () {
      final data = _build(marks: const {'s1': RollMark.here});
      expect(data.outstandingLabel, '2 still to mark · 1 awaiting feedback');
    });

    test('attendance completeness ignores outstanding feedback', () {
      // A tutor marks the roll at the start of class and writes feedback
      // later, so the roll can be finished while notes are still owed.
      final data = _build(marks: _oneHereTwoAway);

      expect(data.isAttendanceComplete, isTrue);
      expect(data.awaitingFeedback, hasLength(1));
    });

    test('an empty roster is not complete', () {
      final data = _build(roster: const [], marks: const {});
      expect(data.isAttendanceComplete, isFalse);
      expect(data.students, isEmpty);
    });
  });

  group('existing feedback', () {
    test('carries the progress recorded with it', () {
      final data = _build(
        sessionFeedback: [
          _feedback(studentId: 's1', progress: StudentProgress.needsSupport),
        ],
      );
      final ava = data.students.firstWhere((s) => s.studentId == 's1');

      expect(ava.progress, StudentProgress.needsSupport);
      expect(ava.feedback, 'Great work today.');
    });

    test('leaves students with no record untouched', () {
      final data = _build(sessionFeedback: [_feedback(studentId: 's1')]);
      final ben = data.students.firstWhere((s) => s.studentId == 's2');

      expect(ben.feedbackAlreadySent, isFalse);
      expect(ben.feedback, isEmpty);
      expect(ben.progress, isNull);
    });
  });

  group('header', () {
    test('names the session and its size', () {
      expect(_build().whenLabel, 'Mon 4:00 – 5:00 · 3 students');
    });

    test('uses the singular for one student', () {
      final data = _build(roster: [_student(id: 's1')]);
      expect(data.whenLabel, contains('1 student'));
    });

    test('reports where the session sits', () {
      expect(
        _build(now: DateTime(2026, 7, 20, 15)).statusLabel,
        'UPCOMING',
      );
      expect(
        _build(now: DateTime(2026, 7, 20, 16, 30)).statusLabel,
        'IN SESSION',
      );
      expect(_build(now: DateTime(2026, 7, 20, 18)).statusLabel, 'FINISHED');
      expect(_build(cancelled: true).statusLabel, 'CANCELLED');
    });
  });

  group('yearLabelFor', () {
    test('prefixes a bare grade', () {
      expect(yearLabelFor('9'), 'Year 9');
    });

    test('leaves an already-prefixed grade alone', () {
      // Both forms are in the data; prefixing unconditionally produced
      // "Year Year 7" on device.
      expect(yearLabelFor('Year 7'), 'Year 7');
      expect(yearLabelFor('year 7'), 'year 7');
    });

    test('is empty for a missing grade', () {
      expect(yearLabelFor(''), '');
      expect(yearLabelFor('   '), '');
    });
  });

  group('feedbackSubjectFor', () {
    test('names the class, so parent attribution stays accurate', () {
      expect(feedbackSubjectFor(_class()), 'Year 11 Standard Maths');
    });
  });
}
