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

  const PermanentEnrollmentResult({
    required this.outcome,
    required this.classState,
    this.waitlistEntry,
  });

  const PermanentEnrollmentResult.enrolled({
    required ClassEnrollmentState classState,
  }) : this(
          outcome: PermanentEnrollmentOutcome.enrolled,
          classState: classState,
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
}
