import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/helpers/parent_class_availability.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/ui/timetable/parent/booking_data.dart';

ClassModel _class({
  int capacity = 6,
  int minimumStudentsToOpen = 2,
  List<String> enrolledStudents = const ['other1', 'other2'],
}) {
  return ClassModel(
    id: 'class1',
    type: 'stdmath11',
    dayOfWeek: 'Wednesday',
    startTime: '16:30',
    endTime: '17:30',
    capacity: capacity,
    minimumStudentsToOpen: minimumStudentsToOpen,
    enrolledStudents: enrolledStudents,
    tutors: const ['tutor1'],
  );
}

Attendance _attendance(List<String> attending) {
  return Attendance(
    id: 'T3_W1',
    date: DateTime(2026, 7, 15),
    termId: 'T3',
    cancelled: false,
    updatedAt: DateTime(2026, 7, 15),
    updatedBy: 'system',
    weekNumber: 1,
    attendance: attending,
    tutors: const ['tutor1'],
  );
}

ParentClassAvailability _availability({
  ClassModel? classInfo,
  Attendance? attendance,
  int weeksAhead = 0,
}) {
  return ParentClassAvailability.forClass(
    classInfo: classInfo ?? _class(),
    attendance: attendance ?? _attendance(const ['other1', 'other2']),
    weeksAhead: weeksAhead,
  );
}

List<String> _actionsFor(List<BookingOption> options) =>
    options.map((o) => o.action).toList();

void main() {
  group('buildBookingOptions — a class the family is not in', () {
    test('offers a one-off booking and a permanent place', () {
      final options = buildBookingOptions(
        classInfo: _class(),
        attendance: _attendance(const ['other1', 'other2']),
        isOwnClass: false,
        userStudentIds: const ['childA'],
        availability: _availability(),
        canSwapThisWeek: true,
      );

      expect(_actionsFor(options), [
        BookingActions.bookOneOff,
        BookingActions.enrolPermanent,
      ]);
      expect(options.first.enabled, isTrue);
    });

    test('offers the waitlist instead when the class is full', () {
      final full = _class(capacity: 2, enrolledStudents: ['a', 'b']);

      final options = buildBookingOptions(
        classInfo: full,
        attendance: _attendance(const ['a', 'b']),
        isOwnClass: false,
        userStudentIds: const ['childA'],
        availability: _availability(
          classInfo: full,
          attendance: _attendance(const ['a', 'b']),
        ),
        canSwapThisWeek: true,
      );

      expect(_actionsFor(options), [
        BookingActions.bookOneOff,
        BookingActions.joinWaitlist,
      ]);
    });

    test('offers the waitlist when the class has not opened yet', () {
      final pending = _class(minimumStudentsToOpen: 4);

      final options = buildBookingOptions(
        classInfo: pending,
        attendance: _attendance(const ['other1', 'other2']),
        isOwnClass: false,
        userStudentIds: const ['childA'],
        availability: _availability(classInfo: pending),
        canSwapThisWeek: true,
      );

      expect(_actionsFor(options).last, BookingActions.joinWaitlist);
    });

    test('carries the reason a one-off booking is unavailable', () {
      // Nobody else is attending, so there is no session to join.
      final empty = _attendance(const []);

      final options = buildBookingOptions(
        classInfo: _class(),
        attendance: empty,
        isOwnClass: false,
        userStudentIds: const ['childA'],
        availability: _availability(attendance: empty),
        canSwapThisWeek: true,
      );

      final oneOff = options.first;
      expect(oneOff.enabled, isFalse);
      expect(oneOff.disabledHint, isNotNull);
      expect(oneOff.disabledHint, contains('no other students'));
    });
  });

  group('buildBookingOptions — a class the family is already in', () {
    test('a visiting child can only swap or report an absence', () {
      // Attending this week, but holding no permanent place in the class.
      final options = buildBookingOptions(
        classInfo: _class(enrolledStudents: const ['other1', 'other2']),
        attendance: _attendance(const ['other1', 'other2', 'childA']),
        isOwnClass: true,
        userStudentIds: const ['childA'],
        availability: _availability(),
        canSwapThisWeek: true,
      );

      expect(_actionsFor(options), [
        BookingActions.swapThisWeek,
        BookingActions.notifyAbsence,
      ]);
    });

    test('a permanent place offers absence and both swaps', () {
      final options = buildBookingOptions(
        classInfo: _class(enrolledStudents: const ['childA', 'other1']),
        attendance: _attendance(const ['childA', 'other1']),
        isOwnClass: true,
        userStudentIds: const ['childA'],
        availability: _availability(),
        canSwapThisWeek: true,
      );

      expect(_actionsFor(options), [
        BookingActions.notifyAbsence,
        BookingActions.swapThisWeek,
        BookingActions.swapPermanent,
      ]);
    });

    test('closes the single-week options outside the booking window', () {
      final options = buildBookingOptions(
        classInfo: _class(enrolledStudents: const ['childA', 'other1']),
        attendance: _attendance(const ['childA', 'other1']),
        isOwnClass: true,
        userStudentIds: const ['childA', 'childB'],
        availability: _availability(),
        canSwapThisWeek: false,
      );

      final swap = options.firstWhere(
        (o) => o.action == BookingActions.swapThisWeek,
      );
      final another = options.firstWhere(
        (o) => o.action == BookingActions.enrolAnotherThisWeek,
      );

      expect(swap.enabled, isFalse);
      expect(swap.disabledHint, contains('current or the following week'));
      expect(another.enabled, isFalse);

      // The term-long options are unaffected by the single-week window.
      expect(
        options
            .firstWhere((o) => o.action == BookingActions.swapPermanent)
            .enabled,
        isTrue,
      );
    });

    test('offers another child both this week and for the term', () {
      final options = buildBookingOptions(
        classInfo: _class(enrolledStudents: const ['childA', 'other1']),
        attendance: _attendance(const ['childA', 'other1']),
        isOwnClass: true,
        userStudentIds: const ['childA', 'childB'],
        availability: _availability(),
        canSwapThisWeek: true,
      );

      expect(_actionsFor(options), [
        BookingActions.notifyAbsence,
        BookingActions.swapThisWeek,
        BookingActions.swapPermanent,
        BookingActions.enrolAnotherThisWeek,
        BookingActions.enrolAnotherPermanent,
      ]);
    });

    test('drops the this-week option when the session has no room', () {
      final tight = _class(capacity: 2, enrolledStudents: const ['childA']);

      final options = buildBookingOptions(
        classInfo: tight,
        attendance: _attendance(const ['childA', 'other1']),
        isOwnClass: true,
        userStudentIds: const ['childA', 'childB'],
        availability: _availability(classInfo: tight),
        canSwapThisWeek: true,
      );

      expect(
          _actionsFor(options),
          isNot(contains(
            BookingActions.enrolAnotherThisWeek,
          )));
      // A term-long place is a separate question from this week's capacity.
      expect(
        _actionsFor(options),
        contains(BookingActions.joinWaitlistAnother),
      );
    });

    test('offers the waitlist for another child when the class is full', () {
      final full = _class(capacity: 3, enrolledStudents: const [
        'childA',
        'other1',
        'other2',
      ]);

      final options = buildBookingOptions(
        classInfo: full,
        attendance: _attendance(const ['childA', 'other1']),
        isOwnClass: true,
        userStudentIds: const ['childA', 'childB'],
        availability: _availability(classInfo: full),
        canSwapThisWeek: true,
      );

      expect(
        _actionsFor(options),
        contains(BookingActions.joinWaitlistAnother),
      );
      expect(
        _actionsFor(options),
        isNot(contains(BookingActions.enrolAnotherPermanent)),
      );
    });

    test('offers nothing extra when every child is already in the session', () {
      final options = buildBookingOptions(
        classInfo: _class(enrolledStudents: const ['childA', 'childB']),
        attendance: _attendance(const ['childA', 'childB']),
        isOwnClass: true,
        userStudentIds: const ['childA', 'childB'],
        availability: _availability(),
        canSwapThisWeek: true,
      );

      expect(options.length, 3);
    });

    test('survives a week with no attendance document yet', () {
      // Previously this force-unwrapped the attendance and threw.
      final options = buildBookingOptions(
        classInfo: _class(enrolledStudents: const ['childA', 'other1']),
        attendance: null,
        isOwnClass: true,
        userStudentIds: const ['childA', 'childB'],
        availability: _availability(attendance: _attendance(const [])),
        canSwapThisWeek: true,
      );

      expect(
        _actionsFor(options),
        contains(BookingActions.enrolAnotherThisWeek),
      );
    });

    test('every option carries a label and a description', () {
      final options = buildBookingOptions(
        classInfo: _class(enrolledStudents: const ['childA', 'other1']),
        attendance: _attendance(const ['childA', 'other1']),
        isOwnClass: true,
        userStudentIds: const ['childA', 'childB'],
        availability: _availability(),
        canSwapThisWeek: true,
      );

      for (final option in options) {
        expect(option.label, isNotEmpty);
        expect(option.description, isNotEmpty);

        // Every internal action id is reworded for the family, except
        // "Notify of absence", which already reads as an instruction.
        if (option.action != BookingActions.notifyAbsence) {
          expect(option.label, isNot(option.action));
        }
      }
    });
  });

  group('buildBookingConfirmationMessage — one-off', () {
    String message({
      required int tokens,
      List<String> names = const ['Ava'],
      String action = BookingActions.bookOneOff,
    }) {
      return buildBookingConfirmationMessage(
        action: action,
        childNames: names,
        classInfo: _class(),
        lessonTokens: tokens,
        weeksRemaining: 5,
      );
    }

    test('warns that payment is required with no tokens', () {
      final text = message(tokens: 0);
      expect(text, contains('no lesson tokens available'));
      expect(text, contains('prompted to pay for all bookings'));
    });

    test('spends one token for one child', () {
      final text = message(tokens: 3);
      expect(text, contains('3 lesson tokens available'));
      expect(text, contains('One token will be used.'));
    });

    test('spends one token per child', () {
      final text = message(tokens: 3, names: ['Ava', 'Ben']);
      expect(text, contains('2 tokens will be used.'));
    });

    test('splits the cost when tokens run out', () {
      final text = message(tokens: 1, names: ['Ava', 'Ben', 'Cleo']);
      expect(text, contains('1 lesson token available'));
      expect(text, contains('pay for the remaining 2 bookings'));
    });

    test('adding another child this week costs the same as a one-off', () {
      expect(
        message(tokens: 2, action: BookingActions.enrolAnotherThisWeek),
        message(tokens: 2),
      );
    });
  });

  group('buildBookingConfirmationMessage — permanent', () {
    String message({
      required int tokens,
      List<String> names = const ['Ava'],
      ClassModel? classInfo,
      int weeksRemaining = 5,
      String action = BookingActions.enrolPermanent,
    }) {
      return buildBookingConfirmationMessage(
        action: action,
        childNames: names,
        classInfo: classInfo ?? _class(),
        lessonTokens: tokens,
        weeksRemaining: weeksRemaining,
      );
    }

    test('invoices every session when there are no tokens', () {
      // One child, five weeks left.
      expect(message(tokens: 0), contains('invoiced for all 5 sessions'));
    });

    test('covers the term when there are enough tokens', () {
      final text = message(tokens: 5);
      expect(text, contains('5 tokens will be used for the entire term'));
      expect(text, contains('No additional payment will be required'));
    });

    test('invoices the shortfall', () {
      final text = message(tokens: 2);
      expect(text, contains('2 will be used'));
      expect(text, contains('invoiced for the remaining 3 sessions'));
    });

    test('counts a session per child', () {
      // Two children over five weeks is ten sessions.
      final text = message(tokens: 0, names: ['Ava', 'Ben']);
      expect(text, contains('all 10 sessions'));
    });

    test('explains the waitlist when the class is at capacity', () {
      final full = _class(capacity: 2, enrolledStudents: const ['a', 'b']);
      final text = message(tokens: 0, classInfo: full);

      expect(text, contains('at permanent capacity'));
      expect(text, contains('added to the waitlist'));
      expect(text, contains("won't be charged"));
    });

    test('explains the waitlist when the class has not opened', () {
      final pending = _class(minimumStudentsToOpen: 4);
      final text = message(tokens: 0, classInfo: pending);

      expect(text, contains('needs at least 4 students'));
      expect(text, contains('added to the waitlist'));
    });

    test('explains a partial enrolment when spots run out', () {
      final tight = _class(capacity: 3, enrolledStudents: const ['a', 'b']);
      final text = message(
        tokens: 0,
        names: ['Ava', 'Ben'],
        classInfo: tight,
      );

      expect(text, contains('only 1 permanent spot available'));
      expect(text, contains('only be charged for confirmed'));
      expect(text, contains('will be added to the waitlist'));
    });

    test('a waitlist-only action never talks about charges up front', () {
      final text = message(
        tokens: 4,
        action: BookingActions.joinWaitlist,
      );

      expect(text, contains('added to the waitlist'));
      expect(text, isNot(contains('will be used')));
    });
  });

  group('buildBookingConfirmationMessage — absence', () {
    test('names the child and the token rule', () {
      final text = buildBookingConfirmationMessage(
        action: BookingActions.notifyAbsence,
        childNames: const ['Ava'],
        classInfo: _class(),
        lessonTokens: 0,
        weeksRemaining: 5,
      );

      expect(text, contains('Ava will be marked absent'));
      expect(text, contains('before 10 AM'));
      // The old copy read: Are you sure you want to confirm 'Notify of
      // absence' for Ava?
      expect(text, isNot(contains('Notify of absence')));
    });
  });

  group('buildSwapConfirmationMessage', () {
    test('scopes a single-week swap to this week', () {
      expect(
        buildSwapConfirmationMessage(
          action: BookingActions.swapThisWeek,
          childNames: const ['Ava'],
          fromLabel: 'Wednesday 4:30 PM',
          toLabel: 'Thursday 5:30 PM',
        ),
        'Move Ava from Wednesday 4:30 PM to Thursday 5:30 PM, this week only.',
      );
    });

    test('scopes a permanent swap to the term', () {
      expect(
        buildSwapConfirmationMessage(
          action: BookingActions.swapPermanent,
          childNames: const ['Ava', 'Ben'],
          fromLabel: 'Wednesday 4:30 PM',
          toLabel: 'Thursday 5:30 PM',
        ),
        contains('every week for the rest of the term'),
      );
    });

    test('names the date a permanent swap starts', () {
      expect(
        buildSwapConfirmationMessage(
          action: BookingActions.swapPermanent,
          childNames: const ['Ava'],
          fromLabel: 'Wednesday 4:30 PM',
          toLabel: 'Thursday 5:30 PM',
          startsOn: SwapStartWeek(
            weekNumber: 3,
            sessionDate: DateTime(2026, 9, 17, 17, 30),
          ),
        ),
        'Move Ava from Wednesday 4:30 PM to Thursday 5:30 PM, every week from '
        'Thu 17 Sep.',
      );
    });

    test('says where a deferred swap leaves the child until then', () {
      // The half a family cannot work out for themselves. Naming only the
      // start date leaves the weeks before it unaccounted for.
      final message = buildSwapConfirmationMessage(
        action: BookingActions.swapPermanent,
        childNames: const ['Ava'],
        fromLabel: 'Wednesday 4:30 PM',
        toLabel: 'Thursday 5:30 PM',
        startsOn: SwapStartWeek(
          weekNumber: 5,
          sessionDate: DateTime(2026, 10, 1, 17, 30),
        ),
        isDeferred: true,
      );

      expect(message, contains('every week from Thu 1 Oct'));
      expect(message, contains('Until then they stay in Wednesday 4:30 PM'));
    });

    test('a one-week swap ignores a start week entirely', () {
      // It is already about a week — the one on screen.
      expect(
        buildSwapConfirmationMessage(
          action: BookingActions.swapThisWeek,
          childNames: const ['Ava'],
          fromLabel: 'Wednesday 4:30 PM',
          toLabel: 'Thursday 5:30 PM',
          startsOn: SwapStartWeek(
            weekNumber: 3,
            sessionDate: DateTime(2026, 9, 17, 17, 30),
          ),
        ),
        endsWith('this week only.'),
      );
    });
  });

  group('buildSwapStartWeekChoices', () {
    // Term starting Monday 7 September 2026; the class runs Thursdays 5:30 PM,
    // so week 1 is Thursday 10 September.
    final termStart = DateTime(2026, 9, 7);

    List<SwapStartWeek> choicesAt(DateTime now, {int totalWeeks = 4}) {
      return buildSwapStartWeekChoices(
        termStartDate: termStart,
        totalWeeks: totalWeeks,
        classDay: 'Thursday',
        startTime: '17:30',
        now: now,
      );
    }

    test('offers every remaining session of the term', () {
      final choices = choicesAt(DateTime(2026, 9, 7, 9));

      expect(choices.map((c) => c.weekNumber), [1, 2, 3, 4]);
      expect(choices.first.dateLabel, 'Thu 10 Sep');
      expect(choices.last.dateLabel, 'Thu 1 Oct');
    });

    test('drops the weeks that have already run', () {
      // The Friday after week one's Thursday session.
      final choices = choicesAt(DateTime(2026, 9, 11));

      expect(choices.map((c) => c.weekNumber), [2, 3, 4]);
    });

    test('drops a session that started earlier today', () {
      // The backend counts a session as future by its calendar day, so
      // offering this would have put the child on a roll for a class that had
      // already finished.
      final choices = choicesAt(DateTime(2026, 9, 10, 18, 30));

      expect(choices.first.weekNumber, 2);
    });

    test('offers nothing once the term has run out', () {
      expect(choicesAt(DateTime(2026, 10, 20)), isEmpty);
    });
  });

  group('unexpectedKeptWeeks', () {
    test('reports every kept week when the swap started immediately', () {
      expect(
        unexpectedKeptWeeks(
          keptSessionIds: const ['2026_T3_W2', '2026_T3_W3'],
          startWeek: null,
        ),
        ['2026_T3_W2', '2026_T3_W3'],
      );
    });

    test('says nothing about the weeks a deferred swap kept on purpose', () {
      // The confirmation already said the child stays put until week 4.
      expect(
        unexpectedKeptWeeks(
          keptSessionIds: const ['2026_T3_W2', '2026_T3_W3'],
          startWeek: 4,
        ),
        isEmpty,
      );
    });

    test('still reports a full week from the start onward', () {
      expect(
        unexpectedKeptWeeks(
          keptSessionIds: const ['2026_T3_W2', '2026_T3_W5'],
          startWeek: 4,
        ),
        ['2026_T3_W5'],
      );
    });

    test('reports a week it cannot place', () {
      // Unplaceable is not the same as expected, and a family turning up to
      // the wrong room is the failure worth avoiding.
      expect(
        unexpectedKeptWeeks(
          keptSessionIds: const ['legacy-session'],
          startWeek: 4,
        ),
        ['legacy-session'],
      );
    });
  });

  group('swapWeekNumberFromSessionId', () {
    test('reads the week out of a session id', () {
      expect(swapWeekNumberFromSessionId('2026_T3_W7'), 7);
      expect(swapWeekNumberFromSessionId('2026_T3_W12'), 12);
    });

    test('returns null for an id carrying no week', () {
      expect(swapWeekNumberFromSessionId('2026_T3'), isNull);
      expect(swapWeekNumberFromSessionId('2026_T3_W0'), isNull);
    });
  });

  group('weeksRemainingInTerm', () {
    test('counts the displayed week', () {
      expect(weeksRemainingInTerm(totalWeeks: 10, currentWeek: 8), 3);
    });

    test('falls back to one session with no active term', () {
      expect(weeksRemainingInTerm(totalWeeks: null, currentWeek: 3), 1);
    });

    test('never goes below one session', () {
      expect(weeksRemainingInTerm(totalWeeks: 10, currentWeek: 12), 1);
    });
  });

  group('action wording', () {
    test('labels read as instructions, not internal names', () {
      expect(
        bookingActionLabel(BookingActions.swapThisWeek),
        'Swap this week only',
      );
      expect(
        bookingActionLabel(BookingActions.enrolPermanent),
        'Enrol for the rest of the term',
      );
    });

    test('confirm buttons name what they do', () {
      expect(bookingConfirmLabel(BookingActions.bookOneOff), 'Book class');
      expect(bookingConfirmLabel(BookingActions.joinWaitlist), 'Join waitlist');
    });

    test('the offline guard reads as a sentence', () {
      // "You're offline. Reconnect to enrol for the term."
      expect(
        bookingGuardAction(BookingActions.enrolPermanent),
        'enrol for the term',
      );
      expect(
        bookingGuardAction(BookingActions.notifyAbsence),
        'notify an absence',
      );
    });

    test('adding another child runs as the plain action', () {
      expect(
        BookingActions.withoutAnother(BookingActions.enrolAnotherPermanent),
        BookingActions.enrolPermanent,
      );
      expect(
        BookingActions.withoutAnother(BookingActions.joinWaitlistAnother),
        BookingActions.joinWaitlist,
      );
      expect(
        BookingActions.withoutAnother(BookingActions.notifyAbsence),
        BookingActions.notifyAbsence,
      );
    });
  });

  _swapCapacityTests();
  _keptWeeksMessageTests();
}

void _swapCapacityTests() {
  group('swap capacity', () {
    test('a permanent swap counts the permanent roster, not the week', () {
      // Two permanent students and one visitor in a class of four. The room is
      // three-quarters full; the permanent roster has two spots. A permanent
      // swap is measured against the roster, because the backend skips weeks
      // the visitor has filled rather than overfilling them.
      final classInfo = _class(capacity: 4, enrolledStudents: ['p1', 'p2']);

      expect(
        swapSpotsRemaining(
          action: BookingActions.swapPermanent,
          classInfo: classInfo,
          weekAttendance: _attendance(['p1', 'p2', 'v1']),
        ),
        2,
      );
    });

    test('a one-week swap counts the visitor holding a seat that week', () {
      final classInfo = _class(capacity: 4, enrolledStudents: ['p1', 'p2']);

      expect(
        swapSpotsRemaining(
          action: BookingActions.swapThisWeek,
          classInfo: classInfo,
          weekAttendance: _attendance(['p1', 'p2', 'v1']),
        ),
        1,
      );
    });

    test('a one-week swap falls back to the roster with no week document', () {
      final classInfo = _class(capacity: 4, enrolledStudents: ['p1', 'p2']);

      expect(
        swapSpotsRemaining(
          action: BookingActions.swapThisWeek,
          classInfo: classInfo,
        ),
        2,
      );
    });

    test('an overfilled class has no seats rather than negative seats', () {
      final classInfo =
          _class(capacity: 2, enrolledStudents: ['p1', 'p2', 'p3']);

      expect(
        swapSpotsRemaining(
          action: BookingActions.swapPermanent,
          classInfo: classInfo,
        ),
        0,
      );
    });

    test('one free spot cannot seat two children', () {
      // MOB-38: the picker offered any class that was not already full, then
      // the caller looped over every selected child.
      final classInfo =
          _class(capacity: 4, enrolledStudents: ['p1', 'p2', 'p3']);

      expect(
        canSwapAllChildrenInto(
          action: BookingActions.swapPermanent,
          classInfo: classInfo,
          childrenToSeat: 1,
        ),
        isTrue,
      );
      expect(
        canSwapAllChildrenInto(
          action: BookingActions.swapPermanent,
          classInfo: classInfo,
          childrenToSeat: 2,
        ),
        isFalse,
      );
    });

    test('two free spots seat two children', () {
      final classInfo = _class(capacity: 4, enrolledStudents: ['p1', 'p2']);

      expect(
        canSwapAllChildrenInto(
          action: BookingActions.swapPermanent,
          classInfo: classInfo,
          childrenToSeat: 2,
        ),
        isTrue,
      );
    });

    test('a selection of no children seats nobody', () {
      final classInfo = _class(capacity: 4, enrolledStudents: const []);

      expect(
        canSwapAllChildrenInto(
          action: BookingActions.swapPermanent,
          classInfo: classInfo,
          childrenToSeat: 0,
        ),
        isFalse,
      );
    });
  });
}

void _keptWeeksMessageTests() {
  group('buildSwapKeptWeeksMessage', () {
    test('says nothing when every week was taken', () {
      expect(
        buildSwapKeptWeeksMessage(
          childNames: const ['Ben'],
          fromLabel: 'Monday, 4:00pm',
          toLabel: 'Wednesday, 4:00pm',
          weeksKept: 0,
        ),
        isNull,
      );
    });

    test('names where the child stays and for how long', () {
      final message = buildSwapKeptWeeksMessage(
        childNames: const ['Ben'],
        fromLabel: 'Monday, 4:00pm',
        toLabel: 'Wednesday, 4:00pm',
        weeksKept: 1,
      );

      expect(
        message,
        'Ben moved to Wednesday, 4:00pm. 1 week is already full there, so '
        'they stay in Monday, 4:00pm for that week. '
        'Check the timetable to see which.',
      );
    });

    test('reads correctly for several weeks and several children', () {
      final message = buildSwapKeptWeeksMessage(
        childNames: const ['Ben', 'Ava'],
        fromLabel: 'Monday, 4:00pm',
        toLabel: 'Wednesday, 4:00pm',
        weeksKept: 3,
      );

      expect(message, contains('Ben, Ava moved to Wednesday, 4:00pm.'));
      expect(message, contains('3 weeks are already full there'));
      expect(message, contains('they stay in Monday, 4:00pm for those weeks'));
    });

    test('falls back to a generic subject with no resolved names', () {
      final message = buildSwapKeptWeeksMessage(
        childNames: const [],
        fromLabel: 'Monday, 4:00pm',
        toLabel: 'Wednesday, 4:00pm',
        weeksKept: 1,
      );

      expect(message, startsWith('Your child moved to'));
    });
  });
}
