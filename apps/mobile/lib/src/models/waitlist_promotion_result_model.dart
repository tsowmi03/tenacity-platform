import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';

enum WaitlistPromotionOutcome {
  promoted,
  alreadyEnrolled,
  classFull,
  notPromotable,
}

extension WaitlistPromotionOutcomeExtension on WaitlistPromotionOutcome {
  String get value {
    switch (this) {
      case WaitlistPromotionOutcome.promoted:
        return 'promoted';
      case WaitlistPromotionOutcome.alreadyEnrolled:
        return 'already_enrolled';
      case WaitlistPromotionOutcome.classFull:
        return 'class_full';
      case WaitlistPromotionOutcome.notPromotable:
        return 'not_promotable';
    }
  }
}

@immutable
class WaitlistPromotionResult {
  final WaitlistPromotionOutcome outcome;
  final String entryId;
  final String classId;
  final String studentId;
  final String parentId;
  final WaitlistStatus previousStatus;
  final int permanentSpotsRemaining;

  const WaitlistPromotionResult({
    required this.outcome,
    required this.entryId,
    required this.classId,
    required this.studentId,
    required this.parentId,
    required this.previousStatus,
    required this.permanentSpotsRemaining,
  });

  const WaitlistPromotionResult.promoted({
    required String entryId,
    required String classId,
    required String studentId,
    required String parentId,
    required WaitlistStatus previousStatus,
    required int permanentSpotsRemaining,
  }) : this(
          outcome: WaitlistPromotionOutcome.promoted,
          entryId: entryId,
          classId: classId,
          studentId: studentId,
          parentId: parentId,
          previousStatus: previousStatus,
          permanentSpotsRemaining: permanentSpotsRemaining,
        );

  const WaitlistPromotionResult.alreadyEnrolled({
    required String entryId,
    required String classId,
    required String studentId,
    required String parentId,
    required WaitlistStatus previousStatus,
    required int permanentSpotsRemaining,
  }) : this(
          outcome: WaitlistPromotionOutcome.alreadyEnrolled,
          entryId: entryId,
          classId: classId,
          studentId: studentId,
          parentId: parentId,
          previousStatus: previousStatus,
          permanentSpotsRemaining: permanentSpotsRemaining,
        );

  const WaitlistPromotionResult.classFull({
    required String entryId,
    required String classId,
    required String studentId,
    required String parentId,
    required WaitlistStatus previousStatus,
    required int permanentSpotsRemaining,
  }) : this(
          outcome: WaitlistPromotionOutcome.classFull,
          entryId: entryId,
          classId: classId,
          studentId: studentId,
          parentId: parentId,
          previousStatus: previousStatus,
          permanentSpotsRemaining: permanentSpotsRemaining,
        );

  const WaitlistPromotionResult.notPromotable({
    required String entryId,
    required String classId,
    required String studentId,
    required String parentId,
    required WaitlistStatus previousStatus,
    required int permanentSpotsRemaining,
  }) : this(
          outcome: WaitlistPromotionOutcome.notPromotable,
          entryId: entryId,
          classId: classId,
          studentId: studentId,
          parentId: parentId,
          previousStatus: previousStatus,
          permanentSpotsRemaining: permanentSpotsRemaining,
        );

  bool get promoted {
    return outcome == WaitlistPromotionOutcome.promoted ||
        outcome == WaitlistPromotionOutcome.alreadyEnrolled;
  }

  bool get shouldSyncAttendance => promoted;
}
