import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/timetable/tutor/tutor_classes_data.dart';

const _tutorId = 'tutor-1';

Term _term({int totalWeeks = 10}) {
  return Term(
    id: 'T3',
    year: '2026',
    termNumber: 3,
    startDate: DateTime(2026, 7, 20),
    endDate: DateTime(2026, 9, 25),
    totalWeeks: totalWeeks,
    isActive: true,
  );
}

ClassModel _class({
  String id = 'c1',
  String day = 'Monday',
  String startTime = '16:00',
  String endTime = '17:00',
  List<String> tutors = const [_tutorId],
  List<String> enrolled = const ['s1', 's2'],
}) {
  return ClassModel(
    id: id,
    type: 'stdmath11',
    dayOfWeek: day,
    startTime: startTime,
    endTime: endTime,
    capacity: 6,
    enrolledStudents: enrolled,
    tutors: tutors,
  );
}

Attendance _attendance({
  String id = 'T3_W1',
  DateTime? date,
  List<String> attending = const ['s1', 's2'],
  List<String> tutors = const [_tutorId],
  bool cancelled = false,
  DateTime? rollCompletedAt,
  String updatedBy = 'system',
}) {
  return Attendance(
    id: id,
    date: date ?? DateTime(2026, 7, 20, 16),
    termId: 'T3',
    cancelled: cancelled,
    updatedAt: DateTime(2026, 7, 20),
    updatedBy: updatedBy,
    weekNumber: 1,
    attendance: attending,
    tutors: tutors,
    rollCompletedAt: rollCompletedAt,
    rollCompletedBy: rollCompletedAt == null ? null : _tutorId,
  );
}

TutorClassesViewData _build({
  DateTime? now,
  Term? term,

  /// Explicit, because `term ?? _term()` would silently discard a deliberate
  /// null and test the wrong thing.
  bool withTerm = true,
  int week = 1,
  List<ClassModel>? classes,
  Map<String, Attendance>? attendanceByClass,
  DateTime? selectedDay,
  String? errorMessage,
}) {
  return buildTutorClassesViewData(
    now: now ?? DateTime(2026, 7, 20, 12),
    activeTerm: withTerm ? (term ?? _term()) : null,
    week: week,
    tutorId: _tutorId,
    classes: classes ?? [_class()],
    attendanceByClass: attendanceByClass ?? {'c1': _attendance()},
    selectedDay: selectedDay,
    errorMessage: errorMessage,
  );
}

void main() {
  group('assignment', () {
    test('shows only classes this tutor is assigned to', () {
      final data = _build(
        classes: [
          _class(),
          _class(id: 'c2', tutors: const ['someone-else']),
        ],
        attendanceByClass: {
          'c1': _attendance(),
          'c2': _attendance(id: 'T3_W1', tutors: const ['someone-else']),
        },
      );

      expect(
        data.days.expand((d) => d.sessions).map((s) => s.classId),
        ['c1'],
      );
    });

    test("the week's cover assignment wins over the standing one", () {
      // A substitute sees the session; the usual tutor does not.
      final covered = _build(
        classes: [
          _class(tutors: const ['usual-tutor'])
        ],
        attendanceByClass: {
          'c1': _attendance(tutors: const [_tutorId])
        },
      );
      expect(covered.days, isNotEmpty);

      final handedOver = _build(
        classes: [
          _class(tutors: const [_tutorId])
        ],
        attendanceByClass: {
          'c1': _attendance(tutors: const ['cover-tutor'])
        },
      );
      expect(handedOver.days, isEmpty);
    });

    test('falls back to the class roster before the week is generated', () {
      final data = _build(attendanceByClass: const {});
      expect(data.days.single.sessions.single.classId, 'c1');
      // No attendance document means no roll to open yet.
      expect(data.days.single.sessions.single.sessionId, isNull);
      expect(data.days.single.sessions.single.canOpenRoll, isFalse);
    });
  });

  group('status', () {
    TutorSessionStatus statusFor({
      Attendance? attendance,
      required DateTime now,
    }) {
      return tutorSessionStatus(
        attendance: attendance,
        startsAt: DateTime(2026, 7, 20, 16),
        now: now,
      );
    }

    test('a stamped roll is done', () {
      expect(
        statusFor(
          attendance: _attendance(rollCompletedAt: DateTime(2026, 7, 20, 17)),
          now: DateTime(2026, 7, 20, 18),
        ),
        TutorSessionStatus.done,
      );
    });

    test('a started session with no stamp needs marking', () {
      expect(
        statusFor(
          attendance: _attendance(),
          now: DateTime(2026, 7, 20, 16, 30),
        ),
        TutorSessionStatus.markRoll,
      );
    });

    test('an edited but unconfirmed roll still needs marking', () {
      // The old rule read `updatedBy == 'system'`, so an admin adding a
      // student to the session marked the roll as done on the tutor's behalf.
      expect(
        statusFor(
          attendance: _attendance(updatedBy: 'admin-1'),
          now: DateTime(2026, 7, 20, 18),
        ),
        TutorSessionStatus.markRoll,
      );
    });

    test('later today is upcoming, another day is confirmed', () {
      expect(
        statusFor(
          attendance: _attendance(),
          now: DateTime(2026, 7, 20, 9),
        ),
        TutorSessionStatus.upcoming,
      );
      expect(
        statusFor(
          attendance: _attendance(),
          now: DateTime(2026, 7, 19, 9),
        ),
        TutorSessionStatus.confirmed,
      );
    });

    test('a cancelled session outranks everything else', () {
      expect(
        statusFor(
          attendance: _attendance(
            cancelled: true,
            rollCompletedAt: DateTime(2026, 7, 20, 17),
          ),
          now: DateTime(2026, 7, 20, 18),
        ),
        TutorSessionStatus.cancelled,
      );
    });

    test('a cancelled session cannot be opened', () {
      final data = _build(
        attendanceByClass: {'c1': _attendance(cancelled: true)},
      );
      expect(data.days.single.sessions.single.canOpenRoll, isFalse);
    });
  });

  group('counts', () {
    test('counts everyone the tutor must mark, not just those attending', () {
      // The roll screen counts the roster plus visitors; the list must agree,
      // or the row says 2 students and the roll it opens shows 3.
      final data = _build(
        classes: [
          _class(enrolled: const ['s1', 's2'])
        ],
        attendanceByClass: {
          'c1': _attendance(attending: const ['s1', 'visitor']),
        },
      );

      expect(data.days.single.sessions.single.studentCount, 3);
      expect(data.days.single.sessions.single.subtitle, '3 students');
    });

    test('uses the singular for one student', () {
      final data = _build(
        classes: [
          _class(enrolled: const ['s1'])
        ],
        attendanceByClass: {
          'c1': _attendance(attending: const ['s1'])
        },
      );
      expect(data.days.single.sessions.single.subtitle, '1 student');
    });

    test('rollsToMark counts only the actionable sessions', () {
      final data = _build(
        now: DateTime(2026, 7, 22, 12),
        classes: [
          _class(),
          _class(id: 'c2', day: 'Tuesday'),
          _class(id: 'c3', day: 'Friday'),
        ],
        attendanceByClass: {
          'c1': _attendance(date: DateTime(2026, 7, 20, 16)),
          'c2': _attendance(
            id: 'T3_W1',
            date: DateTime(2026, 7, 21, 16),
            rollCompletedAt: DateTime(2026, 7, 21, 17),
          ),
          'c3': _attendance(id: 'T3_W1', date: DateTime(2026, 7, 24, 16)),
        },
      );

      expect(data.rollsToMark, 1);
    });
  });

  group('week summary', () {
    test('totals classes and hours across the week', () {
      final data = _build(
        classes: [
          _class(),
          _class(
              id: 'c2', day: 'Tuesday', startTime: '16:00', endTime: '18:00'),
        ],
        attendanceByClass: {
          'c1': _attendance(date: DateTime(2026, 7, 20, 16)),
          'c2': _attendance(id: 'T3_W1', date: DateTime(2026, 7, 21, 16)),
        },
      );

      expect(data.weekTitle, 'Week 1 · 20 – 26 Jul');
      expect(data.weekSubtitle, 'Term 3 · 2 classes · 3 hrs');
    });

    test('omits the hours when there is nothing on', () {
      final data = _build(classes: const [], attendanceByClass: const {});
      expect(data.weekSubtitle, 'Term 3 · 0 classes');
      expect(data.isEmpty, isTrue);
    });

    test('names the day group and marks today', () {
      final data = _build(now: DateTime(2026, 7, 20, 12));
      final day = data.days.single;

      expect(day.label, 'MONDAY 20');
      expect(day.isToday, isTrue);
      expect(day.trailingLabel, 'Today · 1 class');
    });

    test('a day that is not today carries no trailing label', () {
      final data = _build(now: DateTime(2026, 7, 21, 12));
      expect(data.days.single.trailingLabel, isNull);
    });

    test('paging is bounded by the term', () {
      expect(_build(week: 1).canGoToPreviousWeek, isFalse);
      expect(_build(week: 1).canGoToNextWeek, isTrue);
      expect(
        _build(week: 10, term: _term(totalWeeks: 10)).canGoToNextWeek,
        isFalse,
      );
    });

    test('reports no active term rather than an empty week', () {
      final data = _build(withTerm: false);
      expect(data.weekTitle, 'No active term');
      expect(data.days, isEmpty);
    });
  });

  group('day filter', () {
    test('narrows to the selected day but keeps the week total', () {
      final data = _build(
        classes: [
          _class(),
          _class(id: 'c2', day: 'Tuesday'),
        ],
        attendanceByClass: {
          'c1': _attendance(date: DateTime(2026, 7, 20, 16)),
          'c2': _attendance(id: 'T3_W1', date: DateTime(2026, 7, 21, 16)),
        },
        selectedDay: DateTime(2026, 7, 21),
      );

      expect(data.days.length, 1);
      expect(data.days.single.sessions.single.classId, 'c2');
      // Filtering a day must not appear to halve the week's workload.
      expect(data.weekSubtitle, contains('2 classes'));
      expect(data.daysWithSessions, {DateTime.monday, DateTime.tuesday});
    });
  });
}
