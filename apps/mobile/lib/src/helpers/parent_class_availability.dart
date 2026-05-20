import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';

@immutable
class ParentClassAvailability {
  final int permanentSpots;
  final int oneOffSpots;
  final int cancelledSpots;
  final bool hasAttendees;
  final bool canUsePermanentSpotForOneOff;

  const ParentClassAvailability({
    required this.permanentSpots,
    required this.oneOffSpots,
    required this.cancelledSpots,
    required this.hasAttendees,
    required this.canUsePermanentSpotForOneOff,
  });

  factory ParentClassAvailability.forClass({
    required ClassModel classInfo,
    required Attendance? attendance,
    required int weeksAhead,
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
    );
  }

  bool get canBookOneOff {
    return hasAttendees &&
        oneOffSpots > 0 &&
        (cancelledSpots > 0 || canUsePermanentSpotForOneOff);
  }

  String? get oneOffDisabledHint {
    if (!hasAttendees) {
      return 'One-off bookings are not available when no other students are attending this session.';
    }
    if (oneOffSpots <= 0) {
      return 'This session is already full.';
    }
    if (canBookOneOff) return null;
    return 'Sorry, you can only book a one-off class if there are cancelled spots, or if the class is the current or following week.';
  }
}
