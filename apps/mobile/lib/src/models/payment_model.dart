import 'package:cloud_firestore/cloud_firestore.dart';

/// Payment method options.
enum PaymentMethod { stripe, paypal }

extension PaymentMethodExtension on PaymentMethod {
  String get value {
    switch (this) {
      case PaymentMethod.stripe:
        return 'stripe';
      case PaymentMethod.paypal:
        return 'paypal';
    }
  }

  static PaymentMethod fromString(String method) {
    switch (method) {
      case 'stripe':
        return PaymentMethod.stripe;
      case 'paypal':
        return PaymentMethod.paypal;
      default:
        throw Exception("Unknown payment method: $method");
    }
  }
}

/// Model representing a single payment record in the
/// subcollection `/invoices/{invoiceId}/payments/{paymentId}`.
class Payment {
  final String id;  
  final double amountPaid;
  final DateTime paidAt;
  final PaymentMethod method;

  Payment({
    required this.id,
    required this.amountPaid,
    required this.paidAt,
    required this.method,
  });

  /// Construct a Payment object from a Firestore doc snapshot.
  factory Payment.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Payment(
      id: doc.id,
      amountPaid: (data['amountPaid'] as num).toDouble(),
      paidAt: (data['paidAt'] as Timestamp).toDate(),
      method: PaymentMethodExtension.fromString(data['method'] as String),
    );
  }

  /// Convert a Payment object to a Map for writing to Firestore.
  Map<String, dynamic> toMap() {
    return {
      'amountPaid': amountPaid,
      'paidAt': Timestamp.fromDate(paidAt),
      'method': method.value,
    };
  }
}
