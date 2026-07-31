import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard_data.dart';

final _term = Term(
  id: '2026_T3',
  year: '2026',
  termNumber: 3,
  startDate: DateTime(2026, 7, 13),
  endDate: DateTime(2026, 9, 18),
  totalWeeks: 10,
  isActive: true,
);

void main() {
  group('roll status', _rollStatus);
  group('needs action', _needsAction);
  group('overdue invoices', _overdueInvoices);
  group('one-off bookings', _oneOffBookings);
  group('sessions in focus', _sessionsInFocus);
  group('subtitle', _subtitle);
}

void _rollStatus() {
  test('withholds the fraction until somebody has marked a student', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(id: 'a', day: 'Wednesday', start: '16:00', end: '17:00')
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          date: DateTime(2026, 7, 15, 16),
          bookedIds: const ['s1'],
        ),
      },
    );

    expect(data.happeningNow.single.rollLabel, 'NO ROLL');
    expect(data.happeningNow.single.rollComplete, isFalse);
  });

  test('shows the fraction mid-roll, before anyone has finished', () {
    // Withheld until the roll was stamped, because the one stored list held
    // present students only: an unmarked roll and a roll where everyone was
    // away were indistinguishable, and "0/3" would have stated as fact
    // something the data could not support. Marks separate the two cases, so
    // a half-marked roll can be counted honestly.
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(
          id: 'a',
          day: 'Wednesday',
          start: '16:00',
          end: '17:00',
          enrolled: const ['s1', 's2', 's3'],
        ),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          date: DateTime(2026, 7, 15, 16),
          bookedIds: const ['s1', 's2', 's3'],
          marks: const {'s1': RollMark.here, 's2': RollMark.away},
        ),
      },
    );

    expect(data.happeningNow.single.rollLabel, 'ROLL 1/3');
    expect(data.happeningNow.single.rollComplete, isFalse);
  });

  test('an away student still counts towards the roster', () {
    // The whole point of the split: absence from the roll no longer means
    // absence from the class.
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(
          id: 'a',
          day: 'Wednesday',
          start: '16:00',
          end: '17:00',
          enrolled: const ['s1', 's2', 's3'],
        ),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          date: DateTime(2026, 7, 15, 16),
          bookedIds: const ['s1', 's2', 's3'],
          marks: const {
            's1': RollMark.here,
            's2': RollMark.here,
            's3': RollMark.away,
          },
        ),
      },
    );

    expect(data.happeningNow.single.rollLabel, 'ROLL 2/3');
    expect(data.happeningNow.single.rollComplete, isTrue);
  });

  test('a stamped roll with no marks still reports its fraction', () {
    // A session marked before marks existed and not yet backfilled. The
    // booking list is the only record of who turned up that it has.
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(
          id: 'a',
          day: 'Wednesday',
          start: '16:00',
          end: '17:00',
          enrolled: const ['s1', 's2', 's3'],
        ),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          date: DateTime(2026, 7, 15, 16),
          bookedIds: const ['s1', 's2'],
          rollMarked: true,
        ),
      },
    );

    expect(data.happeningNow.single.rollLabel, 'ROLL 2/3');
    expect(data.happeningNow.single.rollComplete, isTrue);
  });

  test('a one-off visitor cannot push the count past the roster', () {
    // Counting present students against the standing roster alone would give
    // "ROLL 3/2" for a class of two with a visitor.
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(
          id: 'a',
          day: 'Wednesday',
          start: '16:00',
          end: '17:00',
          enrolled: const ['s1', 's2'],
        ),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          date: DateTime(2026, 7, 15, 16),
          bookedIds: const ['s1', 's2', 'visitor'],
          marks: const {
            's1': RollMark.here,
            's2': RollMark.here,
            'visitor': RollMark.here,
          },
        ),
      },
    );

    expect(data.happeningNow.single.rollLabel, 'ROLL 3/3');
  });
}

void _needsAction() {
  test('a roll is outstanding only after the session has finished', () {
    final classes = [
      _class(id: 'running', day: 'Wednesday', start: '16:00', end: '17:00'),
      _class(id: 'finished', day: 'Wednesday', start: '12:00', end: '13:00'),
    ];
    final attendance = {
      'running': _attendance(
        id: 'running',
        date: DateTime(2026, 7, 15, 16),
        bookedIds: const ['s1'],
      ),
      'finished': _attendance(
        id: 'finished',
        date: DateTime(2026, 7, 15, 12),
        bookedIds: const ['s1'],
      ),
    };

    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: classes,
      attendance: attendance,
    );

    // The class still running is not chased for a roll it has had no chance to
    // mark; the one that ended at midday is.
    expect(data.outstandingRolls, hasLength(1));
    expect(data.outstandingRolls.single.classId, 'finished');
  });

  test('counts outstanding rolls and overdue invoices, not one-offs', () {
    // One-off bookings need no action — nothing approves them — so they are
    // deliberately absent from the "need action" metric.
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(
          id: 'finished',
          day: 'Wednesday',
          start: '12:00',
          end: '13:00',
          enrolled: const ['s1'],
        ),
      ],
      attendance: {
        'finished': _attendance(
          id: 'finished',
          date: DateTime(2026, 7, 15, 12),
          bookedIds: const ['s1', 'visitor'],
        ),
      },
      invoices: [
        _invoice(id: 'i1', due: DateTime(2026, 7, 10), amount: 100),
        _invoice(id: 'i2', due: DateTime(2026, 7, 12), amount: 60),
      ],
    );

    expect(data.oneOffBookingsThisWeek, 1);
    expect(data.needsActionCount, 3); // 1 roll + 2 overdue invoices
  });

  test('the roll total counts every outstanding roll, not just the listed ones',
      () {
    // The dashboard lists only the first few; the metric counts them all, so
    // the total has to be carried separately or the two disagree on screen.
    final classes = [
      for (var i = 0; i < 6; i++)
        _class(
            id: 'c\$i',
            day: 'Wednesday',
            start: '0\${i + 8}:00',
            end: '0\${i + 9}:00'),
    ];
    final attendance = {
      for (var i = 0; i < 6; i++)
        'c\$i': _attendance(
          id: 'c\$i',
          date: DateTime(2026, 7, 15, i + 8),
          bookedIds: const ['s1'],
        ),
    };

    final data = _build(
      now: DateTime(2026, 7, 15, 20),
      classes: classes,
      attendance: attendance,
    );

    expect(data.outstandingRolls, hasLength(3));
    expect(data.outstandingRollTotal, 6);
    expect(data.hasMoreOutstandingRolls, isTrue);
    expect(data.hiddenOutstandingRolls, 3);
    expect(data.needsActionCount, 6);
  });

  test('a cancelled session is not chased for a roll', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(id: 'off', day: 'Wednesday', start: '12:00', end: '13:00'),
      ],
      attendance: {
        'off': _attendance(
          id: 'off',
          date: DateTime(2026, 7, 15, 12),
          bookedIds: const [],
          cancelled: true,
        ),
      },
    );

    expect(data.outstandingRolls, isEmpty);
    expect(data.classesToday, 0);
    expect(data.needsActionCount, 0);
  });
}

void _overdueInvoices() {
  test('summarises count, total and the oldest', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      invoices: [
        _invoice(id: 'i1', due: DateTime(2026, 7, 3), amount: 120),
        _invoice(id: 'i2', due: DateTime(2026, 7, 13), amount: 80),
        _invoice(id: 'i3', due: DateTime(2026, 7, 20), amount: 50),
      ],
    );

    final overdue = data.overdueInvoices!;
    expect(overdue.count, 2);
    expect(overdue.totalAmount, 200);
    expect(overdue.oldestDays, 12);
  });

  test('a paid invoice is never overdue and never outstanding', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      invoices: [
        _invoice(
          id: 'paid',
          due: DateTime(2026, 7, 1),
          amount: 300,
          status: InvoiceStatus.paid,
        ),
      ],
    );

    expect(data.overdueInvoices, isNull);
    expect(data.outstandingAmount, 0);
  });

  test('an invoice due today is not yet overdue', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      invoices: [_invoice(id: 'i1', due: DateTime(2026, 7, 15), amount: 90)],
    );

    expect(data.overdueInvoices, isNull);
    expect(data.outstandingAmount, 90);
  });
}

void _oneOffBookings() {
  test('counts attendees who are not on the class roster', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(
          id: 'a',
          day: 'Wednesday',
          start: '16:00',
          end: '17:00',
          enrolled: const ['s1', 's2'],
        ),
      ],
      attendance: {
        'a': _attendance(
          id: 'a',
          date: DateTime(2026, 7, 15, 16),
          bookedIds: const ['s1', 'visitor-1', 'visitor-2'],
        ),
      },
    );

    expect(data.oneOffBookingsThisWeek, 2);
  });
}

void _sessionsInFocus() {
  test('falls back to the day when nothing is running', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(id: 'later', day: 'Wednesday', start: '16:00', end: '17:00'),
      ],
    );

    expect(data.happeningNow, isEmpty);
    expect(data.happeningNowLabel, 'TODAY');
    expect(data.sessionsInFocus, hasLength(1));
  });

  test('labels the current time while a class is running', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 16, 30),
      classes: [
        _class(id: 'now', day: 'Wednesday', start: '16:00', end: '17:00'),
      ],
    );

    expect(data.happeningNowLabel, 'HAPPENING NOW · 4:30');
    expect(data.sessionsInFocus.single.classId, 'now');
  });

  test('a class that has just ended is no longer running', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 17),
      classes: [
        _class(id: 'done', day: 'Wednesday', start: '16:00', end: '17:00'),
      ],
    );

    expect(data.happeningNow, isEmpty);
  });
}

void _subtitle() {
  test('names the day and what is expected', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(
          id: 'a',
          day: 'Wednesday',
          start: '16:00',
          end: '17:00',
          enrolled: const ['s1', 's2'],
        ),
        _class(
          id: 'b',
          day: 'Wednesday',
          start: '17:00',
          end: '18:00',
          enrolled: const ['s3'],
        ),
      ],
    );

    expect(data.subtitle, 'Wednesday — 2 classes, 3 students expected.');
  });

  test('singular reads correctly', () {
    final data = _build(
      now: DateTime(2026, 7, 15, 9),
      classes: [
        _class(
          id: 'a',
          day: 'Wednesday',
          start: '16:00',
          end: '17:00',
          enrolled: const ['s1'],
        ),
      ],
    );

    expect(data.subtitle, 'Wednesday — 1 class, 1 student expected.');
  });

  test('says so when the day is empty', () {
    final data = _build(now: DateTime(2026, 7, 15, 9));

    expect(data.subtitle, 'Wednesday — no classes scheduled.');
    expect(data.hasAttentionItems, isFalse);
  });
}

AdminDashboardViewData _build({
  required DateTime now,
  List<ClassModel> classes = const [],
  Map<String, Attendance> attendance = const {},
  List<Invoice> invoices = const [],
  Map<String, String> tutorNames = const {'tutor-1': 'Priya'},
}) {
  return buildAdminDashboardViewData(
    adminName: 'Tom',
    now: now,
    activeTerm: _term,
    currentWeek: 1,
    classes: classes,
    attendanceByClass: attendance,
    tutorNamesById: tutorNames,
    invoices: invoices,
  );
}

ClassModel _class({
  required String id,
  required String day,
  required String start,
  required String end,
  String type = '5-10',
  List<String> enrolled = const ['s1', 's2'],
}) {
  return ClassModel(
    id: id,
    type: type,
    dayOfWeek: day,
    startTime: start,
    endTime: end,
    capacity: 8,
    enrolledStudents: enrolled,
    tutors: const ['tutor-1'],
  );
}

Attendance _attendance({
  required String id,
  required DateTime date,

  /// Who is booked into the session. Unaffected by the roll — an absent
  /// student keeps their seat.
  required List<String> bookedIds,

  /// What the roll has recorded so far. Empty means nobody has started.
  Map<String, RollMark> marks = const {},
  bool rollMarked = false,
  bool cancelled = false,
  List<String> tutors = const ['tutor-1'],
}) {
  return Attendance(
    id: '${id}_W1',
    date: date,
    termId: '2026_T3',
    cancelled: cancelled,
    updatedAt: date,
    updatedBy: 'tutor-1',
    weekNumber: 1,
    attendance: bookedIds,
    tutors: tutors,
    marks: marks,
    rollCompletedAt: rollMarked ? date : null,
    rollCompletedBy: rollMarked ? 'tutor-1' : null,
  );
}

Invoice _invoice({
  required String id,
  required DateTime due,
  required double amount,
  InvoiceStatus status = InvoiceStatus.unpaid,
}) {
  return Invoice(
    id: id,
    parentId: 'parent-1',
    parentName: 'Nguyen',
    parentEmail: 'a@b.com',
    lineItems: const [],
    weeks: 1,
    amountDue: amount,
    status: status,
    dueDate: due,
    createdAt: DateTime(2026, 7, 1),
  );
}
