import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
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
  group('exclusions', _exclusions);
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

  test('paging is bounded by the term', () {
    final firstDay =
        _build(now: DateTime(2026, 7, 13, 9), date: _term.startDate);
    expect(firstDay.canGoToPreviousDay, isFalse);
    expect(firstDay.canGoToNextDay, isTrue);

    final lastDay = _build(now: DateTime(2026, 9, 18, 9), date: _term.endDate);
    expect(lastDay.canGoToPreviousDay, isTrue);
    expect(lastDay.canGoToNextDay, isFalse);
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

    expect(data.dayLabel, 'No active term');
    expect(data.isEmpty, isTrue);
    expect(data.canGoToNextDay, isFalse);
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
  List<ClassModel> classes = const [],
  Map<String, Attendance> attendance = const {},
  Map<String, String> tutorNames = const {'t1': 'Jordan'},
  AdminClassesGrouping grouping = AdminClassesGrouping.time,
}) {
  return buildAdminClassesViewData(
    now: now,
    activeTerm: _term,
    week: 1,
    selectedDate: date ?? _wednesday,
    classes: classes,
    attendanceByClass: attendance,
    tutorNamesById: tutorNames,
    grouping: grouping,
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
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: capacity,
    enrolledStudents: List.generate(enrolled, (i) => 's$i'),
    tutors: const ['t1'],
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
