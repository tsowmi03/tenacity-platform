import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/models/waitlist_promotion_result_model.dart';

void main() {
  group('WaitlistPromotionResult', () {
    test('promoted result requests attendance sync', () {
      const result = WaitlistPromotionResult.promoted(
        entryId: 'entryA',
        classId: 'classA',
        studentId: 'studentA',
        parentId: 'parentA',
        previousStatus: WaitlistStatus.active,
        permanentSpotsRemaining: 2,
      );

      expect(result.outcome, WaitlistPromotionOutcome.promoted);
      expect(result.promoted, isTrue);
      expect(result.shouldSyncAttendance, isTrue);
      expect(result.permanentSpotsRemaining, 2);
    });

    test('already enrolled result still requests attendance sync', () {
      const result = WaitlistPromotionResult.alreadyEnrolled(
        entryId: 'entryA',
        classId: 'classA',
        studentId: 'studentA',
        parentId: 'parentA',
        previousStatus: WaitlistStatus.offered,
        permanentSpotsRemaining: 0,
      );

      expect(result.outcome, WaitlistPromotionOutcome.alreadyEnrolled);
      expect(result.promoted, isTrue);
      expect(result.shouldSyncAttendance, isTrue);
    });

    test('non-mutating outcomes do not request attendance sync', () {
      const classFull = WaitlistPromotionResult.classFull(
        entryId: 'entryA',
        classId: 'classA',
        studentId: 'studentA',
        parentId: 'parentA',
        previousStatus: WaitlistStatus.active,
        permanentSpotsRemaining: 0,
      );
      const notPromotable = WaitlistPromotionResult.notPromotable(
        entryId: 'entryB',
        classId: 'classA',
        studentId: 'studentB',
        parentId: 'parentA',
        previousStatus: WaitlistStatus.cancelled,
        permanentSpotsRemaining: 1,
      );

      expect(classFull.promoted, isFalse);
      expect(classFull.shouldSyncAttendance, isFalse);
      expect(notPromotable.promoted, isFalse);
      expect(notPromotable.shouldSyncAttendance, isFalse);
    });
  });
}
