// payment_controller.dart
import 'package:flutter/foundation.dart';
import 'package:tenacity/src/services/payment_service.dart';

class PaymentController extends ChangeNotifier {
  final PaymentService _paymentService = PaymentService();

  /// Initiates a payment process by creating a PaymentIntent on Stripe.
  ///
  /// [amount] is provided in standard units (e.g. dollars) and is converted to cents.
  /// [currency] defaults to 'aud'. Adjust if necessary.
  Future<String> initiatePayment({
    required double amount,
    String currency = 'aud',
  }) async {
    // Convert amount to the smallest currency unit (e.g., cents)
    final int convertedAmount = (amount * 100).toInt();
    try {
      final clientSecret = await _paymentService.createPaymentIntent(
        amount: convertedAmount,
        currency: currency,
      );
      return clientSecret;
    } catch (error) {
      if (kDebugMode) {
        print('Error initiating payment: $error');
      }
      rethrow;
    }
  }
}
