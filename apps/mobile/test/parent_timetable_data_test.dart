import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_timetable_data.dart';

void main() {
  // Term 3 begins Monday 13 July 2026; week 1 is 13-19 July.
  final term = Term(
    id: '2026_T3',
    year: '2026',
    termNumber: 3,
    startDate: DateTime(2026, 7, 13),
    endDate: DateTime(2026, 9, 18),
    totalWeeks: 10,
    isActive: true,
  );

  final ella = Student(
    id: 'ella',
    firstName: 'Ella',
    lastName: 'Nguyen',
    parents: const ['p1'],
    grade: '9',
    subjects: const ['Maths'],
  );
  final max = Student(
    id: 'max',
    firstName: 'Max',
    lastName: 'Nguyen',
    parents: const ['p1'],
    grade: '5',
    subjects: const ['English'],
  );

  ParentTimetableViewData build({
    DateTime? now,
    bool withoutTerm = false,
    int week = 1,
    List<ClassModel> classes = const [],
    Map<String, Attendance> attendance = const {},
    List<Student> children = const [],
    Map<String, String> tutorNames = const {'t1': 'Jordan Lee'},
    String? selectedChildId,
    DateTime? selectedDay,
  }) {
    return buildParentTimetableViewData(
      now: now ?? DateTime(2026, 7, 15, 14),
      activeTerm: withoutTerm ? null : term,
      week: week,
      classes: classes,
      attendanceByClass: attendance,
      children: children,
      tutorNamesById: tutorNames,
      selectedChildId: selectedChildId,
      selectedDay: selectedDay,
    );
  }

  group('grouping', () {
    test('groups a week into days, earliest first', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'sat', day: 'Saturday', start: '10:00', end: '11:00'),
          _class(id: 'wed', day: 'Wednesday'),
        ],
      );

      expect(data.days.map((d) => d.label), [
        'WEDNESDAY 15',
        'SATURDAY 18',
      ]);
      expect(data.days.first.isToday, isTrue);
      expect(data.days.last.isToday, isFalse);
    });

    test('omits days with nothing on', () {
      final data = build(
        children: [ella],
        classes: [_class(id: 'wed', day: 'Wednesday')],
      );

      expect(data.days, hasLength(1));
      expect(data.weekDates, hasLength(7));
    });

    test('marks which weekdays have sessions for the strip', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday'),
          _class(id: 'sat', day: 'Saturday'),
        ],
      );

      expect(data.daysWithSessions, {DateTime.wednesday, DateTime.saturday});
    });
  });

  group('session status', () {
    test('a roster enrolment is confirmed', () {
      final data = build(
        children: [ella],
        classes: [_class(id: 'wed', day: 'Wednesday')],
      );

      expect(
          data.days.single.sessions.single.kind, ParentSessionKind.confirmed);
      expect(data.days.single.sessions.single.statusLabel, 'CONFIRMED');
    });

    test('a child on the week roster but not the class roster is one-off', () {
      final data = build(
        children: [max],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella'])
        ],
        attendance: {
          'wed': _attendance(
            id: 'wed',
            date: DateTime(2026, 7, 15, 16),
            students: const ['ella', 'max'],
          ),
        },
      );

      expect(data.days.single.sessions.single.kind, ParentSessionKind.oneOff);
      expect(data.days.single.sessions.single.statusLabel, 'ONE-OFF');
    });

    test('a mixed session is confirmed, matching the options dialog', () {
      // Ella has a standing place, Max is visiting for the week. The dialog in
      // timetable_screen.dart treats this as a permanent booking and offers
      // the permanent swap and enrol actions, so the pill must not say
      // ONE-OFF or the row would contradict its own menu.
      final data = build(
        children: [ella, max],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
        ],
        attendance: {
          'wed': _attendance(
            id: 'wed',
            date: DateTime(2026, 7, 15, 16),
            students: const ['ella', 'max'],
          ),
        },
      );

      expect(
          data.days.single.sessions.single.kind, ParentSessionKind.confirmed);
      expect(
          data.days.single.sessions.single.subtitle, startsWith('Ella & Max'));
    });

    test('filtering to the visiting child does not change the status', () {
      // Same family as above, filtered to Max alone. Tapping the row still
      // opens the family-wide dialog, so the status must not flip.
      final data = build(
        children: [ella, max],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella']),
        ],
        attendance: {
          'wed': _attendance(
            id: 'wed',
            date: DateTime(2026, 7, 15, 16),
            students: const ['ella', 'max'],
          ),
        },
        selectedChildId: 'max',
      );

      expect(
          data.days.single.sessions.single.kind, ParentSessionKind.confirmed);
      expect(data.days.single.sessions.single.subtitle, startsWith('Max'));
    });

    test('a cancelled session is shown, not hidden', () {
      // Families need to know a class is off, so this differs from the
      // dashboard, which only counts sessions going ahead.
      final data = build(
        children: [ella],
        classes: [_class(id: 'wed', day: 'Wednesday')],
        attendance: {
          'wed': _attendance(
            id: 'wed',
            date: DateTime(2026, 7, 15, 16),
            students: const ['ella'],
            cancelled: true,
          ),
        },
      );

      expect(
          data.days.single.sessions.single.kind, ParentSessionKind.cancelled);
      expect(data.days.single.sessions.single.statusLabel, 'CANCELLED');
    });
  });

  group('subtitle', () {
    test('names the attending children and the tutor', () {
      final data = build(
        children: [ella, max],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: const ['ella', 'max']),
        ],
      );

      expect(
          data.days.single.sessions.single.subtitle, 'Ella & Max · Jordan Lee');
    });

    test('omits an unresolvable tutor rather than showing a blank', () {
      final data = build(
        children: [ella],
        classes: [_class(id: 'wed', day: 'Wednesday')],
        tutorNames: const {},
      );

      expect(data.days.single.sessions.single.subtitle, 'Ella');
    });
  });

  group('filters', () {
    test('the child filter narrows to that child', () {
      final classes = [
        _class(id: 'ella-wed', day: 'Wednesday', students: const ['ella']),
        _class(
          id: 'max-thu',
          day: 'Thursday',
          students: const ['max'],
          start: '17:00',
          end: '18:00',
        ),
      ];

      final all = build(children: [ella, max], classes: classes);
      expect(all.days, hasLength(2));
      expect(all.selectedFilterIndex, 0);

      final justElla = build(
        children: [ella, max],
        classes: classes,
        selectedChildId: 'ella',
      );
      expect(justElla.days, hasLength(1));
      expect(justElla.days.single.sessions.single.classId, 'ella-wed');
      expect(justElla.selectedFilterIndex, 1);
    });

    test('filter labels lead with All', () {
      final data = build(children: [ella, max]);
      expect(data.filterLabels, ['All', 'Ella', 'Max']);
    });

    test('the day filter narrows to that day but keeps the strip dots', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday'),
          _class(id: 'sat', day: 'Saturday'),
        ],
        selectedDay: DateTime(2026, 7, 18),
      );

      expect(data.days, hasLength(1));
      expect(data.days.single.label, 'SATURDAY 18');
      // Dots still reflect the whole week, so the other day stays discoverable.
      expect(data.daysWithSessions, {DateTime.wednesday, DateTime.saturday});
    });
  });

  group('week paging', () {
    test('stops at the first and last week of the term', () {
      expect(build(week: 1).canGoToPreviousWeek, isFalse);
      expect(build(week: 1).canGoToNextWeek, isTrue);
      expect(build(week: 10).canGoToPreviousWeek, isTrue);
      expect(build(week: 10).canGoToNextWeek, isFalse);
    });

    test('titles the week with its range and class count', () {
      final data = build(
        children: [ella],
        classes: [_class(id: 'wed', day: 'Wednesday')],
      );

      expect(data.weekTitle, 'Week 1 · 13 – 19 Jul');
      expect(data.weekSubtitle, 'Term 3 · 1 class');
    });

    test('spans the month boundary in the range label', () {
      // Week 3 of this term runs 27 July to 2 August.
      final data = build(week: 3);
      expect(data.weekTitle, 'Week 3 · 27 Jul – 2 Aug');
    });

    test('week 2 resolves to the following Monday', () {
      final data = build(
        week: 2,
        children: [ella],
        classes: [_class(id: 'wed', day: 'Wednesday')],
      );

      expect(data.weekDates.first, DateTime(2026, 7, 20));
      expect(data.days.single.label, 'WEDNESDAY 22');
      // Nothing is "today" in a week that is not the current one.
      expect(data.days.single.isToday, isFalse);
    });
  });

  group('empty states', () {
    test('a family with no bookings has no days', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'other', day: 'Wednesday', students: const ['x'])
        ],
      );

      expect(data.isEmpty, isTrue);
      expect(data.weekSubtitle, 'Term 3 · 0 classes');
    });

    test('between terms it says so instead of showing an empty week', () {
      final data = build(withoutTerm: true, children: [ella]);

      expect(data.isEmpty, isTrue);
      expect(data.weekTitle, 'No active term');
      expect(data.weekDates, isEmpty);
      expect(data.canGoToPreviousWeek, isFalse);
      expect(data.canGoToNextWeek, isFalse);
    });
  });
}

ClassModel _class({
  required String id,
  required String day,
  String start = '16:30',
  String end = '17:30',
  String type = 'stdmath11',
  List<String> students = const ['ella'],
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: 8,
    enrolledStudents: students,
    tutors: const ['t1'],
  );
}

Attendance _attendance({
  required String id,
  required DateTime date,
  List<String> students = const [],
  bool cancelled = false,
}) {
  return Attendance(
    id: id,
    date: date,
    termId: '2026_T3',
    cancelled: cancelled,
    updatedAt: date,
    updatedBy: 'system',
    weekNumber: 1,
    attendance: students,
    tutors: const ['t1'],
  );
}
