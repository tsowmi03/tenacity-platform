import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_classes_data.dart';

/// Term 3 opens Monday 13 Jul 2026, so week 1 runs Mon 13 – Sun 19 Jul.
final _term = Term(
  id: '2026_T3',
  year: '2026',
  termNumber: 3,
  startDate: DateTime(2026, 7, 13),
  endDate: DateTime(2026, 9, 18),
  totalWeeks: 10,
  isActive: true,
);

final _wednesday = DateTime(2026, 7, 15);

void main() {
  group('status', _status);
  group('seats', _seats);
  group('time grouping', _timeGrouping);
  group('tutor grouping', _tutorGrouping);
  group('liveness', _liveness);
  group('day', _day);
  group('week', _week);
  group('roster', _roster);
  group('overstaffing', _overstaffing);
  group('exclusions', _exclusions);
}

void _overstaffing() {
  test('a quiet session with two tutors is flagged', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 8, capacity: 8),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
          tutors: const ['t1', 't2'],
        ),
      },
    );

    expect(_only(data).isOverstaffed, isTrue);
  });

  test('the same session with one tutor is not', () {
    // Correctly staffed already. Marking it would put a badge on a row with
    // nothing to act on, which is most of them.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
          tutors: const ['t1'],
        ),
      },
    );

    expect(_only(data).isOverstaffed, isFalse);
  });

  test('a quiet session with nobody assigned is not flagged', () {
    // Not overstaffed. An unstaffed class on the day is a larger problem than
    // this badge reports.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
          tutors: const [],
        ),
      },
    );

    expect(_only(data).isOverstaffed, isFalse);
  });

  test("the week's attendance decides how quiet it is, not the enrolment", () {
    // A class of eight with seven absences is a one-tutor session on the day,
    // and the day is when the allocation is made.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 8, capacity: 8),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0'],
          tutors: const ['t1', 't2'],
        ),
      },
    );

    final session = _only(data);
    expect(session.rosterCount, 1);
    expect(session.isOverstaffed, isTrue);
  });

  test('an emptier session is flagged too, not just an exact two', () {
    for (final present in [const <String>[], const ['s0']]) {
      final data = _build(
        now: DateTime(2026, 7, 15, 9),
        classes: [_class(id: 'a', start: '16:00', end: '17:00')],
        attendance: {
          'a': _attendance(
            id: 'a',
            at: DateTime(2026, 7, 15, 16),
            present: present,
            tutors: const ['t1', 't2'],
          ),
        },
      );

      expect(
        _only(data).isOverstaffed,
        isTrue,
        reason: 'roster of ${present.length}',
      );
    }
  });

  test('a session above the ceiling is left alone, however many tutors', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1', 's2'],
          tutors: const ['t1', 't2'],
        ),
      },
    );

    expect(_only(data).isOverstaffed, isFalse);
  });

  test('a cancelled session is never flagged', () {
    // Nobody is standing in a room that is not running.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0'],
          tutors: const ['t1', 't2'],
          cancelled: true,
        ),
      },
    );

    expect(_only(data).isOverstaffed, isFalse);
  });

  test('a finished session drops the badge', () {
    // There is nobody left to stand down once the class is over, and leaving
    // the badge on every past row would make yesterday look undecided.
    final data = _build(
      now: DateTime(2026, 7, 15, 18),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
          tutors: const ['t1', 't2'],
          rollMarked: true,
        ),
      },
    );

    expect(_only(data).status, AdminSessionStatus.done);
    expect(_only(data).isOverstaffed, isFalse);
  });

  test('a session running right now still carries it', () {
    // Mid-session is late but not too late: a second tutor can still be sent
    // home, and the roll is what the row is otherwise reporting.
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
          tutors: const ['t1', 't2'],
        ),
      },
    );

    expect(_only(data).isOverstaffed, isTrue);
  });

  test('a tutor whose name did not load still counts as assigned', () {
    // tutorLabel drops the unresolved one, so counting names rather than ids
    // would read this pair as a single tutor and miss the overstaffing.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
          tutors: const ['t1', 'unknown-tutor'],
        ),
      },
      tutorNames: const {'t1': 'Jordan'},
    );

    final session = _only(data);
    expect(session.tutorLabel, 'Jordan');
    expect(session.isOverstaffed, isTrue);
  });

  test("the week's tutors win over the standing pair", () {
    // A class that normally runs with two, covered this week by one, is
    // correctly staffed for this session.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00', tutors: 2)],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
          tutors: const ['t1'],
        ),
      },
    );

    expect(_only(data).isOverstaffed, isFalse);
  });

  test('a week with no attendance document falls back to the class', () {
    // Before the week is generated there is no absence list and no weekly
    // tutor assignment, so the standing pair and roster are all there is.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 2, tutors: 2),
        _class(id: 'b', start: '16:00', end: '17:00', enrolled: 2, tutors: 1),
        _class(id: 'c', start: '16:00', end: '17:00', enrolled: 6, tutors: 2),
      ],
    );

    final sessions = data.groups.expand((group) => group.sessions).toList();
    bool flagged(String id) =>
        sessions.firstWhere((s) => s.classId == id).isOverstaffed;

    expect(flagged('a'), isTrue);
    expect(flagged('b'), isFalse);
    expect(flagged('c'), isFalse);
  });

  test('the ceiling is the number the backend sweep uses', () {
    // The 9am admin summary applies the same rule in its own language. If
    // this changes, ONE_TUTOR_ROSTER_CEILING in the functions'
    // overstaffedSessions module changes with it.
    expect(oneTutorRosterCeiling, 2);
  });
}

void _status() {
  test('a started session with no stamped roll reads NO ROLL', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {'a': _attendance(id: 'a', at: DateTime(2026, 7, 15, 16))},
    );

    expect(_only(data).statusLabel, 'NO ROLL');
  });

  test('a running session with a stamped roll reads RUNNING', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          rollMarked: true,
        ),
      },
    );

    expect(_only(data).statusLabel, 'RUNNING');
  });

  test('a finished session with a stamped roll reads DONE', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 18),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          rollMarked: true,
        ),
      },
    );

    expect(_only(data).statusLabel, 'DONE');
  });

  test('cancelled beats everything else', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          rollMarked: true,
          cancelled: true,
        ),
      },
    );

    expect(_only(data).statusLabel, 'CANCELLED');
  });

  test('an upcoming session reads seats, or FULL at capacity', () {
    final withRoom = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 5, capacity: 8),
      ],
    );
    expect(_only(withRoom).statusLabel, '3 SEATS');

    final atCapacity = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 8, capacity: 8),
      ],
    );
    expect(_only(atCapacity).statusLabel, 'FULL');
  });

  test('an absence frees the seat it was holding', () {
    // A full class where one parent has notified an absence for this week.
    // The old union counted the absent student against capacity, so the admin
    // read FULL while the parent's own booking sheet — which reads the week's
    // bookings — was correctly offering the seat.
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 8, capacity: 8),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1', 's2', 's3', 's4', 's5', 's6'],
        ),
      },
    );

    expect(_only(data).statusLabel, '1 SEAT');
  });

  test('one seat left reads in the singular', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 7, capacity: 8),
      ],
    );

    expect(_only(data).statusLabel, '1 SEAT');
  });
}

void _seats() {
  test('a visitor counts towards the seats taken', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 2, capacity: 8),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1', 'visitor'],
        ),
      },
    );

    expect(_only(data).seatsLabel, '3/8 seats');
    expect(_only(data).seatsLeft, 5);
  });

  test('an over-full class never reports negative seats', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 4, capacity: 2),
      ],
    );

    expect(_only(data).seatsLeft, 0);
    expect(_only(data).statusLabel, 'FULL');
  });
}

void _timeGrouping() {
  test('groups by start time and marks the slot running now', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00'),
        _class(id: 'b', start: '16:00', end: '17:00'),
        _class(id: 'c', start: '18:00', end: '19:00'),
      ],
      attendance: {
        'a': _attendance(id: 'a', at: DateTime(2026, 7, 15, 16)),
        'b': _attendance(id: 'b', at: DateTime(2026, 7, 15, 16)),
        'c': _attendance(id: 'c', at: DateTime(2026, 7, 15, 18)),
      },
    );

    expect(data.groups.map((g) => g.label), ['4:00 PM', '6:00 PM']);
    expect(data.groups.first.sessions, hasLength(2));
    expect(data.groups.first.isNow, isTrue);
    expect(data.groups.last.isNow, isFalse);
  });

  test('no slot is marked now outside class hours', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
    );

    expect(data.groups.single.isNow, isFalse);
    expect(_only(data).isLiveNow, isFalse);
  });
}

void _liveness() {
  test('a running class carries liveness in either grouping', () {
    // Found on device: NO ROLL covers both "on right now" and "finished
    // earlier", and the tutor grouping has no time slot to mark, so without a
    // per-session flag the two were indistinguishable there.
    for (final grouping in AdminClassesGrouping.values) {
      final data = _build(
        now: DateTime(2026, 7, 15, 16, 30),
        grouping: grouping,
        classes: [_class(id: 'a', start: '16:00', end: '17:00')],
        attendance: {'a': _attendance(id: 'a', at: DateTime(2026, 7, 15, 16))},
      );

      expect(_only(data).statusLabel, 'NO ROLL');
      expect(_only(data).isLiveNow, isTrue, reason: '$grouping');
    }
  });

  test('a class that has finished is not live, though it still reads NO ROLL',
      () {
    final data = _build(
      now: DateTime(2026, 7, 15, 18),
      grouping: AdminClassesGrouping.tutor,
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {'a': _attendance(id: 'a', at: DateTime(2026, 7, 15, 16))},
    );

    expect(_only(data).statusLabel, 'NO ROLL');
    expect(_only(data).isLiveNow, isFalse);
  });

  test('a cancelled session is never live, even during its slot', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          cancelled: true,
        ),
      },
    );

    expect(_only(data).isLiveNow, isFalse);
    expect(data.groups.single.isNow, isFalse);
  });
}

void _tutorGrouping() {
  test('a co-taught class is listed under each tutor', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      grouping: AdminClassesGrouping.tutor,
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          tutors: const ['t1', 't2'],
        ),
      },
      tutorNames: const {'t1': 'Jordan', 't2': 'Priya'},
    );

    expect(data.groups.map((g) => g.label), ['Jordan', 'Priya']);
    expect(data.groups.every((g) => g.sessions.length == 1), isTrue);
  });

  test('a class with nobody assigned falls under Unassigned, sorted last', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      grouping: AdminClassesGrouping.tutor,
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00'),
        _class(id: 'b', start: '17:00', end: '18:00'),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          tutors: const [],
        ),
        'b': _attendance(
          id: 'b',
          at: DateTime(2026, 7, 15, 17),
          tutors: const ['t1'],
        ),
      },
      tutorNames: const {'t1': 'Jordan'},
    );

    // A tutor-grouped view has to put an unassigned class somewhere; dropping
    // it would hide a real class. It sorts last because it is a bucket, not an
    // alert — cover is excluded from V3 entirely.
    expect(data.groups.map((g) => g.label), ['Jordan', 'Unassigned']);
  });

  test('an unassigned class still shows, with no tutor name', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          tutors: const [],
        ),
      },
    );

    expect(_only(data).tutorLabel, isEmpty);
    expect(data.classCount, 1);
  });
}

void _day() {
  test('summarises the day and counts students across it', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'a', start: '16:00', end: '17:00', enrolled: 4),
        _class(id: 'b', start: '18:00', end: '19:00', enrolled: 3),
      ],
    );

    expect(data.dayLabel, 'Wednesday 15 Jul');
    expect(data.daySummary, '2 classes · 7 students');
  });

  test('only the selected day appears', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'wed', start: '16:00', end: '17:00'),
        _class(id: 'thu', day: 'Thursday', start: '16:00', end: '17:00'),
      ],
    );

    expect(data.classCount, 1);
    expect(_only(data).classId, 'wed');
  });

  test('an empty day says so', () {
    final data = _build(now: DateTime(2026, 7, 15, 9));

    expect(data.isEmpty, isTrue);
    expect(data.daySummary, 'No classes scheduled');
  });

  test('no active term degrades rather than throwing', () {
    final data = buildAdminClassesViewData(
      now: DateTime(2026, 7, 15, 9),
      activeTerm: null,
      week: 0,
      selectedDate: _wednesday,
      classes: const [],
      attendanceByClass: const {},
      tutorNamesById: const {},
    );

    expect(data.weekTitle, 'No active term');
    expect(data.isEmpty, isTrue);
    expect(data.canGoToNextWeek, isFalse);
    expect(data.weekDates, isEmpty);
    // There is no day to name, so the empty state must not try to name one.
    expect(data.dayLabel, isEmpty);
  });
}

void _week() {
  test('the header names the week, its dates and the term', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'wed', start: '16:00', end: '17:00'),
        _class(id: 'thu', day: 'Thursday', start: '16:00', end: '17:00'),
      ],
    );

    expect(data.weekTitle, 'Week 1 · 13 – 19 Jul');
    expect(data.weekSubtitle, 'Term 3 · 2 classes');
  });

  test('the strip runs Monday to Sunday of the loaded week', () {
    final data = _build(now: DateTime(2026, 7, 15, 9));

    expect(data.weekDates.length, 7);
    expect(data.weekDates.first, DateTime(2026, 7, 13));
    expect(data.weekDates.last, DateTime(2026, 7, 19));
  });

  test('every day with a class is marked, not just the one on show', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'wed', start: '16:00', end: '17:00'),
        _class(id: 'thu', day: 'Thursday', start: '16:00', end: '17:00'),
      ],
    );

    expect(data.daysWithSessions, {DateTime.wednesday, DateTime.thursday});
  });

  test('the week counts every class, the day only its own', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'wed', start: '16:00', end: '17:00', enrolled: 4),
        _class(id: 'thu', day: 'Thursday', start: '16:00', end: '17:00'),
      ],
    );

    expect(data.weekSubtitle, 'Term 3 · 2 classes');
    expect(data.daySummary, '1 class · 4 students');
  });

  test('week paging is bounded by the term', () {
    final first = _build(now: DateTime(2026, 7, 15, 9));
    expect(first.canGoToPreviousWeek, isFalse);
    expect(first.canGoToNextWeek, isTrue);

    // Week 10 is the last: it opens Monday 14 Sep, so its Wednesday is 16 Sep.
    final last = _build(
      now: DateTime(2026, 9, 16, 9),
      week: 10,
      date: DateTime(2026, 9, 16),
    );
    expect(last.canGoToPreviousWeek, isTrue);
    expect(last.canGoToNextWeek, isFalse);
  });
}

void _roster() {
  test('lists standing students first, then visitors, each alphabetical', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1', 'v1'],
        ),
      },
      students: {
        's0': _student(id: 's0', first: 'Zoe', last: 'Adams'),
        's1': _student(id: 's1', first: 'Amir', last: 'Khan'),
        'v1': _student(id: 'v1', first: 'Bea', last: 'Cole'),
      },
    );

    // s0 and s1 are on the standing roster; v1 is visiting this week.
    expect(
      _only(data).students.map((student) => student.name),
      ['Amir Khan', 'Zoe Adams', 'Bea Cole'],
    );
  });

  test('each student carries their year and subject', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1'],
        ),
      },
      students: {
        's0': _student(
          id: 's0',
          first: 'Amir',
          last: 'Khan',
          grade: '9',
          subjects: const ['maths', 'english'],
        ),
        's1': _student(
          id: 's1',
          first: 'Zoe',
          last: 'Adams',
          grade: '11',
          subjects: const ['advmath11'],
        ),
      },
    );

    expect(
      _only(data).students.map((student) => student.detail),
      // The subject already names its year, which is shown beside it.
      ['Year 9 · Maths, English', 'Year 11 · Advanced Maths'],
    );
  });

  test('a record with neither a year nor a subject carries no detail', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00', enrolled: 1)],
      students: {'s0': _student(id: 's0', first: 'Amir', last: 'Khan')},
    );

    expect(_only(data).students.single.name, 'Amir Khan');
    expect(_only(data).students.single.detail, isEmpty);
  });

  test('a student with no readable record is left out, but still takes a seat',
      () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
      attendance: {
        'a': _attendance(
          id: 'a',
          at: DateTime(2026, 7, 15, 16),
          present: const ['s0', 's1', 'v1'],
        ),
      },
      students: {
        's0': _student(id: 's0', first: 'Zoe', last: 'Adams'),
        's1': _student(id: 's1', first: 'Amir', last: 'Khan'),
      },
    );

    final session = _only(data);
    expect(
      session.students.map((student) => student.name),
      ['Amir Khan', 'Zoe Adams'],
    );
    expect(session.rosterCount, 3);
    expect(session.seatsLabel, '3/8 seats');
  });

  test('records that have not loaded leave the roster empty, not guessed', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [_class(id: 'a', start: '16:00', end: '17:00')],
    );

    expect(_only(data).students, isEmpty);
    expect(_only(data).rosterCount, 2);
  });
}

void _exclusions() {
  test('no status ever claims cover is needed', () {
    // Cover is excluded from V3: there is no absence record, cover request,
    // approver or notification behind it. An unassigned class is shown as an
    // ordinary class with no tutor name.
    final labels = AdminSessionStatus.values.map((status) {
      return AdminSession(
        classId: 'a',
        sessionId: null,
        startsAt: DateTime(2026, 7, 15, 16),
        endsAt: DateTime(2026, 7, 15, 17),
        timeLabel: '4:00 PM',
        title: 'Years 5–10',
        tutorLabel: '',
        rosterCount: 3,
        capacity: 8,
        status: status,
      ).statusLabel;
    }).toList();

    expect(labels, isNot(contains('COVER')));
    expect(labels.any((l) => l.toLowerCase().contains('cover')), isFalse);
    expect(labels.any((l) => l.toLowerCase().contains('assign')), isFalse);
  });
}

AdminSession _only(AdminClassesViewData data) =>
    data.groups.expand((group) => group.sessions).single;

AdminClassesViewData _build({
  required DateTime now,
  DateTime? date,
  int week = 1,
  List<ClassModel> classes = const [],
  Map<String, Attendance> attendance = const {},
  Map<String, String> tutorNames = const {'t1': 'Jordan'},
  Map<String, Student> students = const {},
  AdminClassesGrouping grouping = AdminClassesGrouping.time,
}) {
  return buildAdminClassesViewData(
    now: now,
    activeTerm: _term,
    week: week,
    selectedDate: date ?? _wednesday,
    classes: classes,
    attendanceByClass: attendance,
    tutorNamesById: tutorNames,
    studentsById: students,
    grouping: grouping,
  );
}

Student _student({
  required String id,
  required String first,
  required String last,
  String grade = '',
  List<String> subjects = const [],
}) {
  return Student(
    id: id,
    firstName: first,
    lastName: last,
    parents: const ['p1'],
    grade: grade,
    subjects: subjects,
  );
}

ClassModel _class({
  required String id,
  required String start,
  required String end,
  String day = 'Wednesday',
  String type = '5-10',
  int enrolled = 2,
  int capacity = 8,
  int tutors = 1,
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: capacity,
    enrolledStudents: List.generate(enrolled, (i) => 's$i'),
    tutors: List.generate(tutors, (i) => 't${i + 1}'),
  );
}

Attendance _attendance({
  required String id,
  required DateTime at,
  List<String>? present,
  List<String> tutors = const ['t1'],
  bool rollMarked = false,
  bool cancelled = false,
}) {
  return Attendance(
    id: '${id}_W1',
    date: at,
    termId: '2026_T3',
    cancelled: cancelled,
    updatedAt: at,
    updatedBy: 'tutor',
    weekNumber: 1,
    attendance: present ?? const ['s0', 's1'],
    tutors: tutors,
    rollCompletedAt: rollMarked ? at : null,
    rollCompletedBy: rollMarked ? 'tutor' : null,
  );
}
