import 'package:flutter/foundation.dart';

/// What we know about a payment after asking the server to confirm it.
///
/// The distinction this type exists to draw is between *the payment did not
/// succeed* and *we could not find out*. Collapsing the two is what lost a paid
/// booking on 2026-08-06: `verifyPaymentStatus` returned HTTP 500 after running
/// out of memory, the app read that as an unpaid card, and abandoned a booking
/// the parent had already been charged for.
///
/// Pure, so every mapping below can be tested without Firebase.

/// How long to keep asking the server before settling for what we have.
///
/// The 2026-08-06 crash was a cold start: the first call died and a second
/// would have found a warm container. Four attempts over 15 seconds is cheap
/// next to losing a paid booking.
const List<Duration> oneOffVerifyBackoff = [
  Duration(seconds: 1),
  Duration(seconds: 2),
  Duration(seconds: 4),
  Duration(seconds: 8),
];

enum PaymentVerificationOutcome {
  /// Stripe confirmed the money moved.
  succeeded,

  /// The server answered, and the payment is neither settled nor dead yet.
  pending,

  /// The server answered, and the payment definitely did not go through.
  notSucceeded,

  /// We never got an answer. Says nothing about the payment either way.
  unavailable,
}

@immutable
class PaymentVerificationResult {
  /// The raw Stripe status, when the server answered.
  final String? stripeStatus;

  /// The callable's error code, when it did not.
  final String? failureCode;

  final PaymentVerificationOutcome outcome;

  const PaymentVerificationResult._({
    required this.outcome,
    this.stripeStatus,
    this.failureCode,
  });

  const PaymentVerificationResult.succeeded(String status)
      : this._(
          outcome: PaymentVerificationOutcome.succeeded,
          stripeStatus: status,
        );

  const PaymentVerificationResult.pending(String status)
      : this._(
          outcome: PaymentVerificationOutcome.pending,
          stripeStatus: status,
        );

  const PaymentVerificationResult.notSucceeded(String status)
      : this._(
          outcome: PaymentVerificationOutcome.notSucceeded,
          stripeStatus: status,
        );

  const PaymentVerificationResult.unavailable(String code)
      : this._(
          outcome: PaymentVerificationOutcome.unavailable,
          failureCode: code,
        );

  /// Whether the server told us anything at all. An inconclusive result is a
  /// statement about our connection, not about the parent's card.
  bool get isConclusive => outcome != PaymentVerificationOutcome.unavailable;

  bool get isSucceeded => outcome == PaymentVerificationOutcome.succeeded;

  /// Whether asking again could plausibly give a different answer.
  bool get isWorthRetrying =>
      outcome == PaymentVerificationOutcome.unavailable ||
      outcome == PaymentVerificationOutcome.pending;
}

/// The Stripe PaymentIntent statuses, mapped to what they mean for a booking.
///
/// An unrecognised status is treated as [PaymentVerificationOutcome.pending],
/// never as a failure: a status we have not seen before is not evidence that
/// the parent was not charged, and Stripe adds statuses over time.
PaymentVerificationResult verificationFromStatus(String status) {
  switch (status.trim()) {
    case 'succeeded':
      return PaymentVerificationResult.succeeded(status);
    case 'requires_payment_method':
    case 'canceled':
      return PaymentVerificationResult.notSucceeded(status);
    case 'processing':
    case 'requires_capture':
    case 'requires_action':
    case 'requires_confirmation':
      return PaymentVerificationResult.pending(status);
    default:
      return PaymentVerificationResult.pending(status);
  }
}
