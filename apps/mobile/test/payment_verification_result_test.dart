import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/services/payment_verification_result.dart';

/// The mapping from Stripe's PaymentIntent statuses to what they mean for a
/// booking. The rule that matters: nothing but an explicit failure status may
/// ever produce `notSucceeded`, because that is the only outcome that throws a
/// booking away.

void main() {
  group('verificationFromStatus', () {
    test('succeeded is the only success', () {
      final result = verificationFromStatus('succeeded');
      expect(result.outcome, PaymentVerificationOutcome.succeeded);
      expect(result.isSucceeded, isTrue);
      expect(result.isConclusive, isTrue);
      expect(result.isWorthRetrying, isFalse);
      expect(result.stripeStatus, 'succeeded');
    });

    test('only a declined or cancelled payment counts as a failure', () {
      for (final status in ['requires_payment_method', 'canceled']) {
        expect(
          verificationFromStatus(status).outcome,
          PaymentVerificationOutcome.notSucceeded,
          reason: '$status means the parent was not charged',
        );
      }
    });

    test('in-flight statuses are pending, not failures', () {
      for (final status in [
        'processing',
        'requires_capture',
        'requires_action',
        'requires_confirmation',
      ]) {
        final result = verificationFromStatus(status);
        expect(
          result.outcome,
          PaymentVerificationOutcome.pending,
          reason: '$status is not an answer either way',
        );
        expect(result.isWorthRetrying, isTrue);
      }
    });

    test('an unrecognised status is pending, never a failure', () {
      // Stripe adds statuses. A status we have not seen is not evidence that
      // the parent kept their money.
      final result = verificationFromStatus('some_future_status');
      expect(result.outcome, PaymentVerificationOutcome.pending);
      expect(result.outcome, isNot(PaymentVerificationOutcome.notSucceeded));
    });

    test('tolerates surrounding whitespace', () {
      expect(
        verificationFromStatus(' succeeded ').outcome,
        PaymentVerificationOutcome.succeeded,
      );
    });
  });

  group('PaymentFulfilment.fromResponse', () {
    test('reads what the server did with the booking', () {
      final fulfilment = PaymentFulfilment.fromResponse({
        'state': 'complete',
        'reason': null,
        'enrolledStudentIds': ['student-1', 'student-2'],
        'unfilledStudentIds': <String>[],
        'invoiceId': 'invoice-1',
      });

      expect(fulfilment!.isComplete, isTrue);
      expect(fulfilment.enrolledStudentIds, ['student-1', 'student-2']);
      expect(fulfilment.invoiceId, 'invoice-1');
    });

    test('reads a booking the session could not take', () {
      final fulfilment = PaymentFulfilment.fromResponse({
        'state': 'refunded',
        'reason': 'session_full',
        'enrolledStudentIds': <String>[],
        'unfilledStudentIds': ['student-1'],
      });

      expect(fulfilment!.wasRefunded, isTrue);
      expect(fulfilment.reason, 'session_full');
      expect(fulfilment.unfilledStudentIds, ['student-1']);
    });

    test('is absent when the server did not fulfil anything', () {
      // A payment from before the server carried booking context, an invoice
      // payment, or a response from an older backend.
      expect(PaymentFulfilment.fromResponse(null), isNull);
      expect(PaymentFulfilment.fromResponse({}), isNull);
      expect(PaymentFulfilment.fromResponse({'state': ''}), isNull);
      expect(PaymentFulfilment.fromResponse('complete'), isNull);
    });

    test('tolerates a response missing the id lists', () {
      final fulfilment = PaymentFulfilment.fromResponse({'state': 'pending'});
      expect(fulfilment!.enrolledStudentIds, isEmpty);
      expect(fulfilment.unfilledStudentIds, isEmpty);
    });
  });

  group('unavailable', () {
    test('says nothing about the payment, and is worth retrying', () {
      const result = PaymentVerificationResult.unavailable('internal');
      expect(result.outcome, PaymentVerificationOutcome.unavailable);
      expect(result.isConclusive, isFalse);
      expect(result.isSucceeded, isFalse);
      expect(result.isWorthRetrying, isTrue);
      expect(result.failureCode, 'internal');
      expect(result.stripeStatus, isNull);
    });
  });
}
