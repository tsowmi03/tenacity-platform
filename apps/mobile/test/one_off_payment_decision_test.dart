import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/services/payment_verification_result.dart';
import 'package:tenacity/src/ui/timetable/parent/one_off_payment_decision.dart';

/// What happens once the card sheet has closed on a one-off booking.
///
/// On 2026-08-06 a parent paid $70, the verification call ran out of memory and
/// returned a 500, and the app read that as a failed payment: it abandoned the
/// booking and told them to try again. These tests pin the opposite behaviour.

const _unavailable = PaymentVerificationResult.unavailable('internal');
const _succeeded = PaymentVerificationResult.succeeded('succeeded');
const _pending = PaymentVerificationResult.pending('processing');
const _declined = PaymentVerificationResult.notSucceeded('requires_payment_method');

void main() {
  group('decideOneOffPaymentOutcome', () {
    test('books, and says nothing extra, when the payment is confirmed', () {
      final decision = decideOneOffPaymentOutcome(
        verification: _succeeded,
        sheetCompleted: true,
      );

      expect(decision.shouldBook, isTrue);
      expect(decision.paymentConfirmed, isTrue);
      expect(decision.message, isNull);
    });

    test('books anyway when the server could not be reached', () {
      // The incident. The money had moved; only our ability to ask about it
      // had failed.
      final decision = decideOneOffPaymentOutcome(
        verification: _unavailable,
        sheetCompleted: true,
      );

      expect(decision.shouldBook, isTrue);
      expect(
        decision.paymentConfirmed,
        isFalse,
        reason: 'the invoice must record that this was never confirmed',
      );
      expect(decision.message!.requiresAcknowledgement, isTrue);
      expect(decision.message!.body, contains('Do not pay again'));
    });

    test('books anyway while a payment is still processing', () {
      final decision = decideOneOffPaymentOutcome(
        verification: _pending,
        sheetCompleted: true,
      );

      expect(decision.shouldBook, isTrue);
      expect(decision.paymentConfirmed, isFalse);
      expect(decision.message!.requiresAcknowledgement, isTrue);
    });

    test('abandons only when the server says the payment did not happen', () {
      final decision = decideOneOffPaymentOutcome(
        verification: _declined,
        sheetCompleted: true,
      );

      expect(decision.shouldBook, isFalse);
      expect(decision.paymentConfirmed, isFalse);
      expect(decision.message!.tone, OneOffMessageTone.error);
      expect(decision.message!.body, contains('not been charged'));
    });

    test('abandons when the sheet never completed', () {
      final decision = decideOneOffPaymentOutcome(
        verification: _unavailable,
        sheetCompleted: false,
      );

      expect(decision.shouldBook, isFalse);
    });

    test('an unreachable server never abandons a booking', () {
      // The single most important property here: no transport failure, of any
      // shape, may produce abandonBooking once the sheet has completed.
      for (final code in ['internal', 'unavailable', 'deadline-exceeded', 'unknown']) {
        final decision = decideOneOffPaymentOutcome(
          verification: PaymentVerificationResult.unavailable(code),
          sheetCompleted: true,
        );
        expect(decision.shouldBook, isTrue, reason: '$code must not lose a booking');
      }
    });
  });

  group('copy', () {
    /// Every message a parent can see once their card has been charged.
    List<OneOffPaymentMessage> messagesAfterCharge() => [
          for (final verification in [_succeeded, _unavailable, _pending])
            decideOneOffPaymentOutcome(
              verification: verification,
              sheetCompleted: true,
            ).message,
          for (final confirmed in [true, false])
            for (final booked in [0, 1, 2])
              for (final invoiced in [true, false])
                oneOffBookingOutcomeMessage(
                  paymentConfirmed: confirmed,
                  requestedCount: 2,
                  bookedCount: booked,
                  alreadyBookedCount: 0,
                  invoiceRecorded: invoiced,
                  classLabel: 'Maths · Monday · 16:00',
                ),
        ].whereType<OneOffPaymentMessage>().toList();

    test('never invites a second payment once money has moved', () {
      for (final message in messagesAfterCharge()) {
        expect(
          '${message.title} ${message.body}'.toLowerCase(),
          isNot(contains('try again')),
          reason: '"${message.title}" must not ask a charged parent to pay again',
        );
      }
    });

    test('every warning and error after a charge must be acknowledged', () {
      for (final message in messagesAfterCharge()) {
        if (message.tone == OneOffMessageTone.success) continue;
        expect(
          message.requiresAcknowledgement,
          isTrue,
          reason: '"${message.title}" is too important for a snack bar',
        );
      }
    });

    test('"try again" survives where it is honest', () {
      final declined = decideOneOffPaymentOutcome(
        verification: _declined,
        sheetCompleted: true,
      ).message!;
      expect(declined.body.toLowerCase(), contains('try booking again'));
    });
  });

  group('oneOffBookingOutcomeMessage', () {
    test('a paid booking that did not take names the class to quote', () {
      final message = oneOffBookingOutcomeMessage(
        paymentConfirmed: true,
        requestedCount: 1,
        bookedCount: 0,
        alreadyBookedCount: 0,
        invoiceRecorded: true,
        classLabel: 'Maths · Monday · 16:00',
      );

      expect(message.tone, OneOffMessageTone.error);
      expect(message.body, contains('Maths · Monday · 16:00'));
      expect(message.body, contains('Do not pay again'));
      expect(message.requiresAcknowledgement, isTrue);
    });

    test('a partial booking is still a failure to confirm', () {
      final message = oneOffBookingOutcomeMessage(
        paymentConfirmed: true,
        requestedCount: 2,
        bookedCount: 1,
        alreadyBookedCount: 0,
        invoiceRecorded: true,
        classLabel: 'Maths · Monday · 16:00',
      );

      expect(message.tone, OneOffMessageTone.error);
    });

    test('a booking whose receipt failed says so without alarming', () {
      final message = oneOffBookingOutcomeMessage(
        paymentConfirmed: true,
        requestedCount: 1,
        bookedCount: 1,
        alreadyBookedCount: 0,
        invoiceRecorded: false,
        classLabel: 'Maths · Monday · 16:00',
      );

      expect(message.tone, OneOffMessageTone.warning);
      expect(message.body, contains('the class is booked'));
    });

    test('a clean booking is a success, confirmed or not', () {
      for (final confirmed in [true, false]) {
        final message = oneOffBookingOutcomeMessage(
          paymentConfirmed: confirmed,
          requestedCount: 1,
          bookedCount: 1,
          alreadyBookedCount: 0,
          invoiceRecorded: true,
          classLabel: 'Maths · Monday · 16:00',
        );
        expect(message.tone, OneOffMessageTone.success);
        expect(message.title, 'Class booked');
      }
    });

    test('mentions students who already had a booking and were not charged', () {
      final message = oneOffBookingOutcomeMessage(
        paymentConfirmed: true,
        requestedCount: 1,
        bookedCount: 1,
        alreadyBookedCount: 1,
        invoiceRecorded: true,
        classLabel: 'Maths · Monday · 16:00',
      );

      expect(message.body, contains('not charged again'));
    });
  });
}
