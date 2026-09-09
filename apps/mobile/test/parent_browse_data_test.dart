import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_browse_data.dart';

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

  // Wednesday 15 July, 2pm — before the 4:30pm classes that day.
  final defaultNow = DateTime(2026, 7, 15, 14);

  ParentBrowseViewData build({
    DateTime? now,
    bool withoutTerm = false,
    int week = 1,
    List<ClassModel> classes = const [],
    Map<String, Attendance> attendance = const {},
    List<Student> children = const [],
    Map<String, String> tutorNames = const {'t1': 'Jordan Lee'},
    DateTime? selectedDay,
    String? errorMessage,
  }) {
    return buildParentBrowseViewData(
      now: now ?? defaultNow,
      activeTerm: withoutTerm ? null : term,
      week: week,
      classes: classes,
      attendanceByClass: attendance,
      children: children,
      tutorNamesById: tutorNames,
      selectedDay: selectedDay,
      errorMessage: errorMessage,
    );
  }

  ParentBrowseClass only(ParentBrowseViewData data) {
    expect(data.days, hasLength(1));
    expect(data.days.single.classes, hasLength(1));
    return data.days.single.classes.single;
  }

  group('grouping', () {
    test('groups the week into days, earliest first', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'sat', day: 'Saturday', start: '10:00', end: '11:00'),
          _class(id: 'wed', day: 'Wednesday'),
        ],
      );

      expect(data.days.map((d) => d.label), ['WEDNESDAY 15', 'SATURDAY 18']);
      expect(data.days.first.isToday, isTrue);
      expect(data.days.last.isToday, isFalse);
    });

    test('orders classes within a day by start time', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'late', day: 'Wednesday', start: '18:00', end: '19:00'),
          _class(id: 'early', day: 'Wednesday', start: '16:30'),
        ],
      );

      expect(
        data.days.single.classes.map((c) => c.classId),
        ['early', 'late'],
      );
    });

    test('keeps all seven dates for the strip and marks the busy days', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday'),
          _class(id: 'sat', day: 'Saturday', start: '10:00', end: '11:00'),
        ],
      );

      expect(data.weekDates, hasLength(7));
      expect(data.daysWithClasses, {DateTime.wednesday, DateTime.saturday});
    });

    test('a day filter narrows the list without changing the strip', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday'),
          _class(id: 'sat', day: 'Saturday', start: '10:00', end: '11:00'),
        ],
        selectedDay: DateTime(2026, 7, 18),
      );

      expect(data.days.map((d) => d.label), ['SATURDAY 18']);
      expect(data.daysWithClasses, {DateTime.wednesday, DateTime.saturday});
    });
  });

  group('what can be booked', () {
    test('drops sessions that have already started', () {
      final data = build(
        // 5pm, after the 4:30 class has begun.
        now: DateTime(2026, 7, 15, 17),
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday'),
          _class(id: 'thu', day: 'Thursday'),
        ],
      );

      expect(data.days.expand((d) => d.classes).map((c) => c.classId), ['thu']);
    });

    test('a class with ongoing places open offers them', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a', 'b', 'c']),
        ],
      );

      final browseClass = only(data);
      expect(browseClass.availability, ParentBrowseAvailability.open);
      expect(browseClass.spotsRemaining, 5);
      expect(browseClass.statusLabel, '5 SPOTS');
    });

    test('a single remaining place is singular', () {
      final data = build(
        children: [ella],
        classes: [
          _class(
            id: 'wed',
            day: 'Wednesday',
            students: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          ),
        ],
      );

      expect(only(data).statusLabel, '1 SPOT');
    });

    test('a full class offers the waitlist and says so', () {
      final data = build(
        children: [ella],
        classes: [
          _class(
            id: 'wed',
            day: 'Wednesday',
            students: List.generate(8, (i) => 's$i'),
          ),
        ],
      );

      final browseClass = only(data);
      expect(browseClass.availability, ParentBrowseAvailability.waitlist);
      expect(browseClass.statusLabel, 'WAITLIST');
      expect(browseClass.subtitle, contains('Class is full'));
    });

    // A class below its minimum size has places but cannot be joined yet, and
    // the options dialog offers the waitlist for exactly this reason.
    test('a class below its minimum size waits rather than enrolling', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a'])
        ],
      );

      final browseClass = only(data);
      expect(browseClass.availability, ParentBrowseAvailability.waitlist);
      expect(browseClass.subtitle, contains('Opens with 1 more student'));
    });

    test('the shortfall to opening is pluralised', () {
      final data = build(
        children: [ella],
        classes: [
          _class(
            id: 'wed',
            day: 'Wednesday',
            students: const [],
            minimumToOpen: 3,
          ),
        ],
      );

      expect(only(data).subtitle, contains('Opens with 3 more students'));
    });

    test('a class one of the children is in reads as booked', () {
      final data = build(
        children: [ella, max],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['ella'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W1',
            date: DateTime(2026, 7, 15, 16, 30),
            students: const ['ella', 'a', 'b'],
          ),
        },
      );

      final browseClass = only(data);
      expect(browseClass.availability, ParentBrowseAvailability.booked);
      expect(browseClass.statusLabel, 'BOOKED');
      expect(browseClass.isBooked, isTrue);
      expect(browseClass.childIds, ['ella']);
      expect(browseClass.subtitle, startsWith('Ella'));
    });

    test('booked names every attending child, not just the first', () {
      final data = build(
        children: [ella, max],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['ella'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W1',
            date: DateTime(2026, 7, 15, 16, 30),
            students: const ['ella', 'max'],
          ),
        },
      );

      expect(only(data).subtitle, startsWith('Ella & Max'));
      expect(only(data).childIds, ['ella', 'max']);
    });

    test('a cancelled session is shown, muted, rather than hidden', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a', 'b'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W1',
            date: DateTime(2026, 7, 15, 16, 30),
            students: const ['a', 'b'],
            cancelled: true,
          ),
        },
      );

      final browseClass = only(data);
      expect(browseClass.availability, ParentBrowseAvailability.cancelled);
      expect(browseClass.statusLabel, 'CANCELLED');
      expect(browseClass.subtitle, contains('This session is cancelled'));
    });
  });

  group('one-off notes', () {
    // The legacy surface advertised a raw one-off count even where the rules
    // forbade using it, so a parent could tap a class showing free spots and
    // be told no. The note is only claimed when the booking would be accepted.
    test('claims a one-off only when one can actually be booked', () {
      final data = build(
        // Before 9am, so the same-day cutoff is not what is being tested here.
        now: DateTime(2026, 7, 15, 8),
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a', 'b'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W1',
            date: DateTime(2026, 7, 15, 16, 30),
            students: const ['a', 'b'],
          ),
        },
      );

      expect(only(data).subtitle, contains('One-off spot this week'));
    });

    test('withdraws the one-off once today\'s bookings have closed', () {
      // Same class, same seat, 2pm instead of 8am. Staffing for the day is
      // settled by then, so the seat is no longer on offer (MOB-48).
      final data = build(
        now: DateTime(2026, 7, 15, 14),
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a', 'b'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W1',
            date: DateTime(2026, 7, 15, 16, 30),
            students: const ['a', 'b'],
          ),
        },
      );

      final row = only(data);
      expect(row.subtitle, isNot(contains('One-off spot this week')));
      // Said rather than left blank: a class that is quietly unbookable looks
      // identical to one nobody has taken up.
      expect(row.subtitle, contains('Bookings for today have closed'));
    });

    test('leaves tomorrow alone however late today is', () {
      final data = build(
        // 10pm Wednesday, looking at Thursday's class.
        now: DateTime(2026, 7, 15, 22),
        children: [ella],
        classes: [
          _class(id: 'thu', day: 'Thursday', students: ['a', 'b'])
        ],
        attendance: {
          'thu': _attendance(
            id: '2026_T3_W1',
            date: DateTime(2026, 7, 16, 16, 30),
            students: const ['a', 'b'],
          ),
        },
      );

      expect(only(data).subtitle, contains('One-off spot this week'));
    });

    test('stays silent when nobody else is attending', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a', 'b'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W1',
            date: DateTime(2026, 7, 15, 16, 30),
            students: const [],
          ),
        },
      );

      expect(only(data).subtitle, isNot(contains('One-off')));
    });

    test('stays silent for a week too far ahead to book', () {
      final data = build(
        // Week 5 is four weeks past the week containing 15 July, which is
        // outside the one-off window.
        week: 5,
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a', 'b'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W5',
            date: DateTime(2026, 8, 12, 16, 30),
            students: const ['a', 'b'],
          ),
        },
      );

      expect(only(data).subtitle, isNot(contains('One-off')));
    });

    test('allows a one-off in the following week', () {
      final data = build(
        week: 2,
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: ['a', 'b'])
        ],
        attendance: {
          'wed': _attendance(
            id: '2026_T3_W2',
            date: DateTime(2026, 7, 22, 16, 30),
            students: const ['a', 'b'],
          ),
        },
      );

      expect(only(data).subtitle, contains('One-off spot this week'));
    });
  });

  group('presentation', () {
    test('names the class, its time and how long it runs', () {
      final data = build(
        children: [ella],
        classes: [
          _class(
            id: 'wed',
            day: 'Wednesday',
            start: '16:30',
            end: '18:00',
            students: const ['a', 'b', 'c'],
          ),
        ],
      );

      final browseClass = only(data);
      expect(browseClass.title, 'Year 11 Standard Maths');
      expect(browseClass.time, '4:30');
      expect(browseClass.durationLabel, '1.5 hrs');
    });

    test('lists the tutor after the availability notes', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: List.filled(8, 'x')),
        ],
      );

      expect(only(data).subtitle, 'Class is full · Jordan Lee');
    });

    test('omits a tutor whose name has not loaded', () {
      final data = build(
        children: [ella],
        tutorNames: const {},
        classes: [
          _class(id: 'wed', day: 'Wednesday', students: List.filled(8, 'x')),
        ],
      );

      expect(only(data).subtitle, 'Class is full');
    });

    test('counts the whole week, not the filtered day', () {
      final data = build(
        children: [ella],
        classes: [
          _class(id: 'wed', day: 'Wednesday'),
          _class(id: 'sat', day: 'Saturday', start: '10:00', end: '11:00'),
        ],
        selectedDay: DateTime(2026, 7, 18),
      );

      expect(data.weekTitle, 'Week 1 · 13 – 19 Jul');
      expect(data.weekSubtitle, 'Term 3 · 2 classes available');
    });

    test('a single class is singular', () {
      final data = build(
        children: [ella],
        classes: [_class(id: 'wed', day: 'Wednesday')],
      );

      expect(data.weekSubtitle, 'Term 3 · 1 class available');
    });

    test('spans two months in the week range', () {
      final data = build(week: 12, children: [ella]);

      expect(data.weekTitle, 'Week 12 · 28 Sep – 4 Oct');
    });
  });

  group('week bounds', () {
    test('the first week cannot page back', () {
      final data = build(week: 1);

      expect(data.canGoToPreviousWeek, isFalse);
      expect(data.canGoToNextWeek, isTrue);
    });

    test('the last week cannot page forward', () {
      final data = build(week: 10);

      expect(data.canGoToPreviousWeek, isTrue);
      expect(data.canGoToNextWeek, isFalse);
    });
  });

  group('term notices', () {
    test('warns that bookings open before lessons do', () {
      final data = build(now: DateTime(2026, 7, 1), children: [ella]);

      expect(
        data.preTermNotice,
        'Term 3 starts on 13 July. Bookings are open now, '
        'but lessons begin then.',
      );
    });

    test('drops the notice once the term is under way', () {
      expect(build(children: [ella]).preTermNotice, isNull);
    });

    test('with no active term there is nothing to browse', () {
      final data = build(withoutTerm: true, children: [ella]);

      expect(data.isEmpty, isTrue);
      expect(data.weekTitle, 'No active term');
      expect(data.weekDates, isEmpty);
      expect(data.canGoToPreviousWeek, isFalse);
      expect(data.canGoToNextWeek, isFalse);
    });
  });

  group('failure', () {
    // An empty list says "nothing to book"; the error says "we could not find
    // out". A parent must be able to tell those apart.
    test('carries a load failure through instead of showing an empty week', () {
      final data =
          build(errorMessage: 'Subjects unavailable', children: [ella]);

      expect(data.errorMessage, 'Subjects unavailable');
      expect(data.isEmpty, isTrue);
    });

    test('carries the failure even with no active term', () {
      final data = build(withoutTerm: true, errorMessage: 'Offline');

      expect(data.errorMessage, 'Offline');
    });
  });
}

ClassModel _class({
  required String id,
  required String day,
  String start = '16:30',
  String end = '17:30',
  String type = 'stdmath11',
  int capacity = 8,
  int minimumToOpen = 2,
  List<String> students = const ['a', 'b', 'c'],
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: capacity,
    minimumStudentsToOpen: minimumToOpen,
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
