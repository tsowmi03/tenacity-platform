import 'package:flutter/foundation.dart';
import 'package:tenacity/src/helpers/parent_class_availability.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';

/// Derivation behind the parent booking sheets: which options a class offers,
/// and what confirming one actually commits the family to.
///
/// Pure, because the confirmation copy is where tokens turn into money. It
/// used to be built inline inside the sheet, so none of it could be tested
/// without Firestore, a signed-in parent and a live term.

/// The identity of a booking action.
///
/// These strings are the legacy action names and are deliberately unchanged:
/// every branch that performs the booking still dispatches on them. What the
/// family reads comes from [bookingActionLabel] instead, so the wording can
/// improve without moving the behaviour underneath it.
abstract final class BookingActions {
  static const bookOneOff = 'Book one-off class';
  static const enrolPermanent = 'Enrol permanent';
  static const joinWaitlist = 'Join waitlist';
  static const enrolAnotherThisWeek = 'Enrol another student (This Week)';
  static const enrolAnotherPermanent = 'Enrol another student (Permanent)';
  static const joinWaitlistAnother = 'Join waitlist for another student';
  static const notifyAbsence = 'Notify of absence';
  static const swapThisWeek = 'Swap (This Week)';
  static const swapPermanent = 'Swap (Permanent)';

  static bool isPermanentEnrollment(String action) =>
      action == enrolPermanent ||
      action == enrolAnotherPermanent ||
      isWaitlistOnly(action);

  static bool isWaitlistOnly(String action) =>
      action == joinWaitlist || action == joinWaitlistAnother;

  static bool isSwap(String action) =>
      action == swapThisWeek || action == swapPermanent;

  /// The permanent action a class can offer: a place if it is open, otherwise
  /// a spot in the queue.
  static String permanentFor(ClassModel classInfo) =>
      classInfo.canAcceptParentPermanentEnrollment
          ? enrolPermanent
          : joinWaitlist;

  /// The same choice, worded for a child who is not in the class yet when
  /// another already is.
  static String additionalPermanentFor(ClassModel classInfo) =>
      classInfo.canAcceptParentPermanentEnrollment
          ? enrolAnotherPermanent
          : joinWaitlistAnother;

  /// Adding another child runs the same code as enrolling the first one, so
  /// the child-selection step hands the base action downstream.
  static String withoutAnother(String action) {
    if (action == enrolAnotherPermanent) return enrolPermanent;
    if (action == joinWaitlistAnother) return joinWaitlist;
    return action;
  }
}

/// A child, resolved to a name the sheets can show.
@immutable
class BookingChild {
  final String id;
  final String name;

  const BookingChild({required this.id, required this.name});
}

/// An alternative class offered when swapping.
@immutable
class BookingClassChoice {
  final String classId;
  final String dayOfWeek;
  final String timeLabel;
  final String title;
  final int spotsRemaining;

  const BookingClassChoice({
    required this.classId,
    required this.dayOfWeek,
    required this.timeLabel,
    required this.title,
    required this.spotsRemaining,
  });

  String get whenLabel => '$dayOfWeek, $timeLabel';
}

/// Seats [classInfo] has left for a swap, by the measure [action] actually
/// depends on.
///
/// The two swaps count different things:
///
/// - A permanent swap is about the class. Its permanent roster against
///   capacity. A week that a one-off visitor has already filled is skipped by
///   the backend rather than overfilled, so it does not make the class
///   unavailable.
/// - A one-week swap is about that week alone, and a visitor holds a real
///   seat in it. [weekAttendance] is the week being moved into; without a
///   document for it, the permanent roster is the best estimate available.
///
/// Never negative: an overfilled class has no seats, not seats owed.
int swapSpotsRemaining({
  required String action,
  required ClassModel classInfo,
  Attendance? weekAttendance,
}) {
  if (action == BookingActions.swapPermanent) {
    return classInfo.permanentSpotsRemaining;
  }
  final booked = weekAttendance?.attendance.length ??
      classInfo.enrolledStudents.length;
  final remaining = classInfo.capacity - booked;
  return remaining < 0 ? 0 : remaining;
}

/// Whether [classInfo] can seat every child in one swap.
///
/// A family swapping two children needs two seats. Checking only that the
/// class was not already full let one free spot admit both, which is how
/// MOB-38 put five students in a room built for four.
bool canSwapAllChildrenInto({
  required String action,
  required ClassModel classInfo,
  required int childrenToSeat,
  Attendance? weekAttendance,
}) {
  if (childrenToSeat <= 0) return false;
  return swapSpotsRemaining(
        action: action,
        classInfo: classInfo,
        weekAttendance: weekAttendance,
      ) >=
      childrenToSeat;
}

/// One choice on the class options sheet.
@immutable
class BookingOption {
  /// One of [BookingActions] — the identity the booking code dispatches on.
  final String action;
  final String label;
  final String description;
  final bool enabled;

  /// Why the option cannot be taken. Shown in place of [description] when
  /// [enabled] is false, so the reason sits with the option rather than
  /// appearing as a message after tapping it.
  final String? disabledHint;

  const BookingOption({
    required this.action,
    required this.label,
    required this.description,
    this.enabled = true,
    this.disabledHint,
  });
}

/// The options a parent has on [classInfo] in the displayed week.
///
/// [isOwnClass] means at least one of the family's children is already in this
/// session. [canSwapThisWeek] is the existing rule that a one-off change may
/// only be made to the current or the following week.
List<BookingOption> buildBookingOptions({
  required ClassModel classInfo,
  required Attendance? attendance,
  required bool isOwnClass,
  required List<String> userStudentIds,
  required ParentClassAvailability availability,
  required bool canSwapThisWeek,
}) {
  if (!isOwnClass) {
    return [
      _option(
        BookingActions.bookOneOff,
        enabled: availability.canBookOneOff,
        disabledHint: availability.oneOffDisabledHint,
      ),
      _option(BookingActions.permanentFor(classInfo)),
    ];
  }

  final attending = attendance?.attendance ?? const <String>[];
  final enrolledChildren =
      attending.where(userStudentIds.contains).toList(growable: false);
  final additionalChildren = userStudentIds
      .where((id) => !enrolledChildren.contains(id))
      .toList(growable: false);

  // A visiting booking: a child of this family is in the session, but none of
  // them holds a permanent place in the class.
  final isOneOffBooking = enrolledChildren.isNotEmpty &&
      !classInfo.enrolledStudents.any(userStudentIds.contains);

  if (isOneOffBooking) {
    return [
      _option(BookingActions.swapThisWeek),
      _option(BookingActions.notifyAbsence),
    ];
  }

  const swapWindowHint =
      'You can only change a single week if it is the current or the '
      'following week.';

  final options = <BookingOption>[
    _option(BookingActions.notifyAbsence),
    _option(
      BookingActions.swapThisWeek,
      enabled: canSwapThisWeek,
      disabledHint: canSwapThisWeek ? null : swapWindowHint,
    ),
    _option(BookingActions.swapPermanent),
  ];

  if (additionalChildren.isEmpty) return options;

  // The session has room for another child this week. `attending` is empty
  // rather than null when the week has no attendance document yet, which the
  // previous version force-unwrapped.
  if (classInfo.capacity - attending.length > 0) {
    options.add(
      _option(
        BookingActions.enrolAnotherThisWeek,
        enabled: canSwapThisWeek,
        disabledHint: canSwapThisWeek ? null : swapWindowHint,
      ),
    );
  }

  options.add(_option(BookingActions.additionalPermanentFor(classInfo)));

  return options;
}

BookingOption _option(
  String action, {
  bool enabled = true,
  String? disabledHint,
}) {
  return BookingOption(
    action: action,
    label: bookingActionLabel(action),
    description: bookingActionDescription(action),
    enabled: enabled,
    disabledHint: disabledHint,
  );
}

/// What the family reads on the sheet. The legacy titles were the internal
/// action names — `Swap (This Week)`, `Enrol permanent` — shown verbatim.
String bookingActionLabel(String action) {
  switch (action) {
    case BookingActions.bookOneOff:
      return 'Book a one-off class';
    case BookingActions.enrolPermanent:
      return 'Enrol for the rest of the term';
    case BookingActions.joinWaitlist:
      return 'Join the waitlist';
    case BookingActions.enrolAnotherThisWeek:
      return 'Add another child this week';
    case BookingActions.enrolAnotherPermanent:
      return 'Add another child for the term';
    case BookingActions.joinWaitlistAnother:
      return 'Add another child to the waitlist';
    case BookingActions.notifyAbsence:
      return 'Notify of absence';
    case BookingActions.swapThisWeek:
      return 'Swap this week only';
    case BookingActions.swapPermanent:
      return 'Swap permanently';
    default:
      return action;
  }
}

/// The line beneath the label, saying what the option commits to.
String bookingActionDescription(String action) {
  switch (action) {
    case BookingActions.bookOneOff:
      return 'A single session, this week only.';
    case BookingActions.enrolPermanent:
      return 'A place in this class every week for the rest of the term.';
    case BookingActions.joinWaitlist:
      return "We'll be in touch if a place opens up.";
    case BookingActions.enrolAnotherThisWeek:
      return 'Bring another child to this session only.';
    case BookingActions.enrolAnotherPermanent:
      return 'A weekly place in this class for another child.';
    case BookingActions.joinWaitlistAnother:
      return 'Add another child to the queue for a place.';
    case BookingActions.notifyAbsence:
      return "Let us know your child can't make it this week.";
    case BookingActions.swapThisWeek:
      return 'Move to a different class for this week only.';
    case BookingActions.swapPermanent:
      return 'Change the weekly class for the rest of the term.';
    default:
      return '';
  }
}

/// The confirm button's label. Named for the action so the last tap says what
/// it does rather than `Confirm`.
String bookingConfirmLabel(String action) {
  switch (action) {
    case BookingActions.bookOneOff:
    case BookingActions.enrolAnotherThisWeek:
      return 'Book class';
    case BookingActions.enrolPermanent:
    case BookingActions.enrolAnotherPermanent:
      return 'Enrol';
    case BookingActions.joinWaitlist:
    case BookingActions.joinWaitlistAnother:
      return 'Join waitlist';
    case BookingActions.notifyAbsence:
      return 'Notify absence';
    case BookingActions.swapThisWeek:
    case BookingActions.swapPermanent:
      return 'Confirm swap';
    default:
      return 'Confirm';
  }
}

/// How the offline guard names an action: "You're offline. Reconnect to
/// book this class." The action ids read badly in that sentence — "reconnect
/// to enrol permanent" — so they are phrased here instead.
String bookingGuardAction(String action) {
  switch (action) {
    case BookingActions.bookOneOff:
    case BookingActions.enrolAnotherThisWeek:
      return 'book this class';
    case BookingActions.enrolPermanent:
    case BookingActions.enrolAnotherPermanent:
      return 'enrol for the term';
    case BookingActions.joinWaitlist:
    case BookingActions.joinWaitlistAnother:
      return 'join the waitlist';
    case BookingActions.notifyAbsence:
      return 'notify an absence';
    case BookingActions.swapThisWeek:
    case BookingActions.swapPermanent:
      return 'swap classes';
    default:
      return action.toLowerCase();
  }
}

/// What confirming [action] commits the family to, in full.
///
/// [weeksRemaining] is the number of sessions a permanent enrolment still
/// covers this term, including the displayed week.
String buildBookingConfirmationMessage({
  required String action,
  required List<String> childNames,
  required ClassModel classInfo,
  required int lessonTokens,
  required int weeksRemaining,
}) {
  final names = childNames.join(', ');
  final childCount = childNames.length;

  if (action == BookingActions.bookOneOff ||
      action == BookingActions.enrolAnotherThisWeek) {
    return _oneOffMessage(
      names: names,
      childCount: childCount,
      tokens: lessonTokens,
    );
  }

  if (BookingActions.isPermanentEnrollment(action)) {
    return _permanentMessage(
      action: action,
      names: names,
      childCount: childCount,
      classInfo: classInfo,
      tokens: lessonTokens,
      weeksRemaining: weeksRemaining,
    );
  }

  if (action == BookingActions.notifyAbsence) {
    return '$names will be marked absent from this class this week.\n\n'
        'You receive a lesson token if you let us know before 10 AM on the '
        'day of the class.';
  }

  return "Are you sure you want to confirm '$action' for $names?";
}

String _oneOffMessage({
  required String names,
  required int childCount,
  required int tokens,
}) {
  const opening = 'Are you sure you want to book a one-off class for ';

  if (tokens == 0) {
    return '$opening$names?\n\nYou have no lesson tokens available. '
        'You will be prompted to pay for all bookings.';
  }

  if (tokens >= childCount) {
    final used = childCount == 1
        ? 'One token will be used.'
        : '$childCount tokens will be used.';
    return '$opening$names?\n\nYou have $tokens '
        '${_tokenWord(tokens)} available. $used';
  }

  final toPay = childCount - tokens;
  return '$opening$names?\n\nYou have $tokens ${_tokenWord(tokens)} '
      'available. $tokens will be used, and you will be prompted to pay for '
      'the remaining $toPay booking${toPay > 1 ? 's' : ''}.';
}

String _permanentMessage({
  required String action,
  required String names,
  required int childCount,
  required ClassModel classInfo,
  required int tokens,
  required int weeksRemaining,
}) {
  const waitlistTerms = "You won't be charged unless a permanent place is "
      'confirmed.';

  String waitlistMessage(String reason) =>
      '$reason\n\n$names will be added to the waitlist. $waitlistTerms';

  String notOpenReason() =>
      'This class is not open for permanent enrolment yet because it needs '
      'at least ${classInfo.minimumStudentsToOpen} students.';

  const atCapacityReason = 'This class is at permanent capacity.';

  if (BookingActions.isWaitlistOnly(action)) {
    return waitlistMessage(
      classInfo.enrollmentState == ClassEnrollmentState.full
          ? atCapacityReason
          : notOpenReason(),
    );
  }

  switch (classInfo.enrollmentState) {
    case ClassEnrollmentState.pending:
      return waitlistMessage(notOpenReason());
    case ClassEnrollmentState.full:
      return waitlistMessage(atCapacityReason);
    case ClassEnrollmentState.open:
      break;
  }

  final spotsToEnrol = classInfo.permanentSpotsRemaining < childCount
      ? classInfo.permanentSpotsRemaining
      : childCount;
  final waitlistCount = childCount - spotsToEnrol;
  final totalSessions = spotsToEnrol * weeksRemaining;

  if (waitlistCount > 0) {
    return 'There ${spotsToEnrol == 1 ? 'is' : 'are'} only $spotsToEnrol '
        'permanent spot${spotsToEnrol == 1 ? '' : 's'} available.\n\n'
        'You will only be charged for confirmed permanent enrolments. Any '
        'remaining selected student${waitlistCount == 1 ? '' : 's'} will be '
        'added to the waitlist.';
  }

  const opening = 'Are you sure you want to permanently enrol ';

  if (tokens == 0) {
    return '$opening$names?\n\nYou have no lesson tokens available. '
        'You will be invoiced for all $totalSessions sessions.';
  }

  if (tokens >= totalSessions) {
    return '$opening$names?\n\nYou have $tokens ${_tokenWord(tokens)} '
        'available. $totalSessions '
        '${totalSessions > 1 ? 'tokens will' : 'token will'} be used for the '
        'entire term. No additional payment will be required.';
  }

  final toInvoice = totalSessions - tokens;
  return '$opening$names?\n\nYou have $tokens ${_tokenWord(tokens)} '
      'available. $tokens will be used, and you will be invoiced for the '
      'remaining $toInvoice session${toInvoice > 1 ? 's' : ''}.';
}

/// What a swap moves, and for whom.
String buildSwapConfirmationMessage({
  required String action,
  required List<String> childNames,
  required String fromLabel,
  required String toLabel,
}) {
  final names = childNames.join(', ');
  final scope = action == BookingActions.swapPermanent
      ? 'every week for the rest of the term'
      : 'this week only';

  return 'Move $names from $fromLabel to $toLabel, $scope.';
}

/// What to tell a family after a permanent swap that could not take every
/// week.
///
/// The weeks named are ones where the new class was already full — its
/// permanent students plus that week's one-off visitors. Rather than putting
/// the room over capacity or dropping the child from both classes, they keep
/// their seat in the class they are leaving for those weeks. A family that is
/// not told this turns up to the wrong room.
///
/// Returns null when nothing was kept back, so the caller can use it as the
/// test for whether to say anything at all.
String? buildSwapKeptWeeksMessage({
  required List<String> childNames,
  required String fromLabel,
  required String toLabel,
  required int weeksKept,
}) {
  if (weeksKept <= 0) return null;
  final names = childNames.isEmpty ? 'Your child' : childNames.join(', ');
  final weekWord = weeksKept == 1 ? 'week' : 'weeks';
  final isAre = weeksKept == 1 ? 'is' : 'are';
  final thatThose = weeksKept == 1 ? 'that week' : 'those weeks';

  return '$names moved to $toLabel. $weeksKept $weekWord $isAre already full '
      'there, so they stay in $fromLabel for $thatThose. '
      'Check the timetable to see which.';
}

String _tokenWord(int tokens) => tokens == 1 ? 'lesson token' : 'lesson tokens';

/// Sessions a permanent enrolment still covers this term, counting the
/// displayed week. Falls back to one when there is no active term, matching
/// the previous behaviour.
int weeksRemainingInTerm({required int? totalWeeks, required int currentWeek}) {
  if (totalWeeks == null) return 1;
  final remaining = totalWeeks - currentWeek + 1;
  return remaining < 1 ? 1 : remaining;
}
