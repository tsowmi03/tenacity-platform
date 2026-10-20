import 'package:flutter/foundation.dart';

@immutable
class OneOffEnrollmentResult {
  final bool added;
  final bool alreadyEnrolled;

  const OneOffEnrollmentResult({
    required this.added,
    required this.alreadyEnrolled,
  });

  bool get billable => added;
}

/// What one booking call did for each child it was asked to book (MOB-55).
///
/// A call can part-fit when several children are booked at once, so each list
/// is reported separately rather than as one yes or no.
@immutable
class OneOffBatchEnrollmentResult {
  final List<String> enrolled;
  final List<String> alreadyEnrolled;
  final List<String> noCapacity;

  const OneOffBatchEnrollmentResult({
    required this.enrolled,
    required this.alreadyEnrolled,
    required this.noCapacity,
  });

  OneOffEnrollmentResult forStudent(String studentId) => OneOffEnrollmentResult(
        added: enrolled.contains(studentId),
        alreadyEnrolled: alreadyEnrolled.contains(studentId),
      );
}
