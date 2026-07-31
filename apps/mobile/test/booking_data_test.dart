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
}
