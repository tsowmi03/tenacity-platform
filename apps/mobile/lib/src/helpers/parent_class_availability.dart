import 'package:flutter/foundation.dart';
import 'package:tenacity/src/helpers/same_day_booking_cutoff.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';

@immutable
class ParentClassAvailability {
  final int permanentSpots;
  final int oneOffSpots;
  final int cancelledSpots;
  final bool hasAttendees;
  final bool canUsePermanentSpotForOneOff;

  /// The session runs today and it is past 9am, so it is closed to new
  /// bookings. See `same_day_booking_cutoff.dart` for the rule and for why
  /// the server, not this flag, is what enforces it.
  final bool sameDayCutoffPassed;

  const ParentClassAvailability({
    required this.permanentSpots,
    required this.oneOffSpots,
    required this.cancelledSpots,
    required this.hasAttendees,
    required this.canUsePermanentSpotForOneOff,
    required this.sameDayCutoffPassed,
  });

  /// [sameDayCutoffPassed] is supplied rather than derived, because the
  /// session's start is known to each caller — the browse list has computed it
  /// already, and an attendance document may not exist yet — and deriving it
  /// twice from different sources is how the row and the dialog come to
  /// disagree.
  factory ParentClassAvailability.forClass({
    required ClassModel classInfo,
    required Attendance? attendance,
    required int weeksAhead,
    required bool sameDayCutoffPassed,
  }) {
    final currentAttendance = attendance?.attendance.length ?? 0;
    final permanentEnrolled = classInfo.enrolledStudents.length;
    final permanentSpots = classInfo.permanentSpotsRemaining;
    final oneOffSpots =
        (classInfo.capacity - currentAttendance).clamp(0, classInfo.capacity);
    final cancelledSpots =
        (permanentEnrolled - currentAttendance).clamp(0, permanentEnrolled);

    return ParentClassAvailability(
      permanentSpots: permanentSpots,
      oneOffSpots: oneOffSpots,
      cancelledSpots: cancelledSpots,
      hasAttendees: attendance?.attendance.isNotEmpty ?? false,
      canUsePermanentSpotForOneOff:
          weeksAhead >= 0 && weeksAhead <= 1 && permanentSpots > 0,
      sameDayCutoffPassed: sameDayCutoffPassed,
    );
  }

  /// Everything the session asks of a one-off booking except the time of day.
  bool get _seatIsAvailable {
    return hasAttendees &&
        oneOffSpots > 0 &&
        (cancelledSpots > 0 || canUsePermanentSpotForOneOff);
  }

  bool get canBookOneOff => _seatIsAvailable && !sameDayCutoffPassed;

  /// The cutoff is the only thing in the way: this session would take the
  /// booking if it were earlier in the day.
  ///
  /// Distinct from [sameDayCutoffPassed], which is true for any class running
  /// today. Saying "bookings for today have closed" about a class that is full
  /// anyway, or that never offered a one-off, names a reason that is not the
  /// reason, and invites a phone call that cannot be honoured.
  bool get closedBySameDayCutoff => _seatIsAvailable && sameDayCutoffPassed;

  String? get oneOffDisabledHint {
    if (!hasAttendees) {
      return 'One-off bookings are not available when no other students are attending this session.';
    }
    if (oneOffSpots <= 0) {
      return 'This session is already full.';
    }
    if (closedBySameDayCutoff) {
      return sameDayBookingCutoffHint;
    }
    if (canBookOneOff) return null;
    return 'Sorry, you can only book a one-off class if there are cancelled spots, or if the class is the current or following week.';
  }
}
