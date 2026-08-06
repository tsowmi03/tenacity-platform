import 'package:flutter/foundation.dart';
import 'package:tenacity/src/services/payment_verification_result.dart';

/// What to do once the card sheet has closed on a one-off booking, and what to
/// tell the family about it.
///
/// Pure, because this is the point where money has already moved and the wrong
/// branch costs a parent a class they paid for. It used to live inline in
/// `timetable_screen.dart`, where none of it could be tested without Firestore,
/// Stripe, a signed-in parent and a live term.

enum OneOffPaymentAction {
  /// Enrol the students. The money is either confirmed or very likely taken.
  proceedWithBooking,

  /// Do not enrol. Only for a payment the server said outright did not happen.
  abandonBooking,
}

enum OneOffMessageTone { success, neutral, warning, error }

/// Something to tell the family, and how loudly.
@immutable
class OneOffPaymentMessage {
  final OneOffMessageTone tone;
  final String title;
  final String body;

  /// Whether this must be acknowledged rather than shown in a snack bar. True
  /// whenever money has moved and the message is the only warning against
  /// paying a second time — a snack bar can be missed.
  final bool requiresAcknowledgement;

  const OneOffPaymentMessage({
    required this.tone,
    required this.title,
    required this.body,
    this.requiresAcknowledgement = false,
  });
}

@immutable
class OneOffPaymentDecision {
  final OneOffPaymentAction action;

  /// Whether the server confirmed the money moved. When false the booking still
  /// goes ahead, but the invoice records that the payment was never confirmed
  /// so it can be reconciled against Stripe.
  final bool paymentConfirmed;

  final OneOffPaymentMessage? message;

  const OneOffPaymentDecision({
    required this.action,
    required this.paymentConfirmed,
    this.message,
  });

  bool get shouldBook => action == OneOffPaymentAction.proceedWithBooking;
}

/// Whether to complete a booking whose card sheet has already closed.
///
/// The rule is: proceed unless the server said, in as many words, that the
/// payment did not succeed. [sheetCompleted] means `presentPaymentSheet()`
/// returned without throwing, which is the Stripe SDK's own signal that the
/// payment was confirmed — it throws on cancellation and on failure. Server
/// verification is a second opinion, and a second opinion that never arrived
/// is not grounds for throwing away a booking the parent has paid for.
OneOffPaymentDecision decideOneOffPaymentOutcome({
  required PaymentVerificationResult verification,
  required bool sheetCompleted,
}) {
  if (!sheetCompleted) {
    // The sheet never closed cleanly, so nothing was charged. The caller
    // handles StripeException itself; this is only a guard.
    return const OneOffPaymentDecision(
      action: OneOffPaymentAction.abandonBooking,
      paymentConfirmed: false,
    );
  }

  switch (verification.outcome) {
    case PaymentVerificationOutcome.succeeded:
      return const OneOffPaymentDecision(
        action: OneOffPaymentAction.proceedWithBooking,
        paymentConfirmed: true,
      );

    case PaymentVerificationOutcome.notSucceeded:
      return const OneOffPaymentDecision(
        action: OneOffPaymentAction.abandonBooking,
        paymentConfirmed: false,
        message: OneOffPaymentMessage(
          tone: OneOffMessageTone.error,
          title: 'Payment was not completed',
          body: 'You have not been charged and no booking was made. You can '
              'try booking again whenever you are ready.',
        ),
      );

    case PaymentVerificationOutcome.pending:
      return const OneOffPaymentDecision(
        action: OneOffPaymentAction.proceedWithBooking,
        paymentConfirmed: false,
        message: OneOffPaymentMessage(
          tone: OneOffMessageTone.warning,
          title: 'Your booking is being held while your payment is confirmed',
          body: 'Do not pay again. We will confirm by email. If you do not '
              'hear from us today, contact Tenacity Tutoring.',
          requiresAcknowledgement: true,
        ),
      );

    case PaymentVerificationOutcome.unavailable:
      return const OneOffPaymentDecision(
        action: OneOffPaymentAction.proceedWithBooking,
        paymentConfirmed: false,
        message: OneOffPaymentMessage(
          tone: OneOffMessageTone.warning,
          title: 'Your payment went through and your booking is confirmed',
          body: 'We could not reach our servers to record the receipt, so it '
              'may take a little longer to appear. Do not pay again. If this '
              'class is not in your timetable tomorrow, contact Tenacity '
              'Tutoring.',
          requiresAcknowledgement: true,
        ),
      );
  }
}

/// What became of the booking once the enrolments were attempted.
///
/// [classLabel] names the class and date, so a family told to contact us has
/// something to quote and support has something to act on.
OneOffPaymentMessage oneOffBookingOutcomeMessage({
  required bool paymentConfirmed,
  required int requestedCount,
  required int bookedCount,
  required int alreadyBookedCount,
  required bool invoiceRecorded,
  required String classLabel,
}) {
  if (bookedCount < requestedCount) {
    return OneOffPaymentMessage(
      tone: OneOffMessageTone.error,
      title: 'Your payment went through but we could not confirm the booking',
      body: 'Do not pay again. Please contact Tenacity Tutoring and quote '
          '$classLabel.',
      requiresAcknowledgement: true,
    );
  }

  if (!invoiceRecorded) {
    return const OneOffPaymentMessage(
      tone: OneOffMessageTone.warning,
      title: 'Booked, but the receipt could not be recorded',
      body: 'Your payment went through and the class is booked. Do not pay '
          'again. Please contact Tenacity Tutoring so we can add the receipt.',
      requiresAcknowledgement: true,
    );
  }

  if (!paymentConfirmed) {
    // Booked on the strength of the card sheet alone. The parent has already
    // been given the "do not pay again" message by decideOneOffPaymentOutcome,
    // so this only confirms the booking itself.
    return OneOffPaymentMessage(
      tone: OneOffMessageTone.success,
      title: _bookedTitle(bookedCount),
      body: _bookedBody(bookedCount, alreadyBookedCount, classLabel),
    );
  }

  return OneOffPaymentMessage(
    tone: OneOffMessageTone.success,
    title: _bookedTitle(bookedCount),
    body: _bookedBody(bookedCount, alreadyBookedCount, classLabel),
  );
}

String _bookedTitle(int bookedCount) =>
    bookedCount == 1 ? 'Class booked' : '$bookedCount classes booked';

String _bookedBody(int bookedCount, int alreadyBookedCount, String classLabel) {
  final booked = bookedCount == 1
      ? 'Your child is booked into $classLabel.'
      : '$bookedCount students are booked into $classLabel.';

  if (alreadyBookedCount == 0) return booked;

  final already = alreadyBookedCount == 1
      ? 'One student already had a booking and was not charged again.'
      : '$alreadyBookedCount students already had bookings and were not '
          'charged again.';

  return '$booked $already';
}
