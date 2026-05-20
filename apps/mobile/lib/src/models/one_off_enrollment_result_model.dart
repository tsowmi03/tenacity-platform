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
