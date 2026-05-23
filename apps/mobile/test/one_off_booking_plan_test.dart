import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/helpers/one_off_booking_plan.dart';

void main() {
  group('OneOffBookingPlan', () {
    test('assigns all selected students to paid bookings when no tokens exist',
        () {
      final plan = OneOffBookingPlan.fromSelection(
        selectedChildIds: const ['studentA', 'studentB'],
        availableTokens: 0,
      );

      expect(plan.tokenStudentIds, isEmpty);
      expect(plan.paidStudentIds, ['studentA', 'studentB']);
      expect(plan.requiresPayment, isTrue);
    });

    test('assigns available tokens before paid bookings in selection order',
        () {
      final plan = OneOffBookingPlan.fromSelection(
        selectedChildIds: const ['studentA', 'studentB', 'studentC'],
        availableTokens: 2,
      );

      expect(plan.tokenStudentIds, ['studentA', 'studentB']);
      expect(plan.paidStudentIds, ['studentC']);
      expect(plan.tokensToUse, 2);
      expect(plan.paidBookings, 1);
    });

    test('caps tokens at the number of selected students', () {
      final plan = OneOffBookingPlan.fromSelection(
        selectedChildIds: const ['studentA'],
        availableTokens: 5,
      );

      expect(plan.tokenStudentIds, ['studentA']);
      expect(plan.paidStudentIds, isEmpty);
      expect(plan.requiresPayment, isFalse);
    });

    test('treats negative token counts as zero', () {
      final plan = OneOffBookingPlan.fromSelection(
        selectedChildIds: const ['studentA'],
        availableTokens: -3,
      );

      expect(plan.tokenStudentIds, isEmpty);
      expect(plan.paidStudentIds, ['studentA']);
    });
  });
}
