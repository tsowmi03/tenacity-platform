import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';

enum PermanentEnrollmentOutcome {
  enrolled,
  waitlisted,
  alreadyEnrolled,
}

extension PermanentEnrollmentOutcomeExtension on PermanentEnrollmentOutcome {
  String get value {
    switch (this) {
      case PermanentEnrollmentOutcome.enrolled:
        return 'enrolled';
      case PermanentEnrollmentOutcome.waitlisted:
        return 'waitlisted';
      case PermanentEnrollmentOutcome.alreadyEnrolled:
        return 'already_enrolled';
    }
  }
}

@immutable
class PermanentEnrollmentResult {
  final PermanentEnrollmentOutcome outcome;
  final ClassEnrollmentState classState;
  final WaitlistEntry? waitlistEntry;
  final int attendanceSessionsAdded;
  final int skippedFullSessionCount;
  final DateTime? firstAttendanceDate;

  const PermanentEnrollmentResult({
    required this.outcome,
    required this.classState,
    this.waitlistEntry,
    this.attendanceSessionsAdded = 0,
    this.skippedFullSessionCount = 0,
    this.firstAttendanceDate,
  });

  const PermanentEnrollmentResult.enrolled({
    required ClassEnrollmentState classState,
    int attendanceSessionsAdded = 0,
    int skippedFullSessionCount = 0,
    DateTime? firstAttendanceDate,
  }) : this(
          outcome: PermanentEnrollmentOutcome.enrolled,
          classState: classState,
          attendanceSessionsAdded: attendanceSessionsAdded,
          skippedFullSessionCount: skippedFullSessionCount,
          firstAttendanceDate: firstAttendanceDate,
        );

  const PermanentEnrollmentResult.waitlisted({
    required ClassEnrollmentState classState,
    required WaitlistEntry waitlistEntry,
  }) : this(
          outcome: PermanentEnrollmentOutcome.waitlisted,
          classState: classState,
          waitlistEntry: waitlistEntry,
        );

  const PermanentEnrollmentResult.alreadyEnrolled({
    required ClassEnrollmentState classState,
  }) : this(
          outcome: PermanentEnrollmentOutcome.alreadyEnrolled,
          classState: classState,
        );

  bool get enrolled {
    return outcome == PermanentEnrollmentOutcome.enrolled ||
        outcome == PermanentEnrollmentOutcome.alreadyEnrolled;
  }

  bool get waitlisted => outcome == PermanentEnrollmentOutcome.waitlisted;

  bool get startsAfterFullSessions {
    return outcome == PermanentEnrollmentOutcome.enrolled &&
        skippedFullSessionCount > 0 &&
        firstAttendanceDate != null;
  }
}
