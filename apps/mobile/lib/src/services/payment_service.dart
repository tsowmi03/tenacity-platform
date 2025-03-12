// payment_service.dart
import 'package:cloud_functions/cloud_functions.dart';

class PaymentService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Creates a PaymentIntent via your Cloud Function.
  ///
  /// [amount] should be provided in the smallest currency unit.
  /// [currency] is typically 'aud' (or other supported currencies).
  Future<String> createPaymentIntent({
    required int amount,
    required String currency,
  }) async {
    try {
      // Call the cloud function 'createPaymentIntent'
      final callable = _functions.httpsCallable('createPaymentIntent');
      final result = await callable.call({
        'amount': amount,
        'currency': currency,
      });
      // Return the client secret from the response.
      return result.data['clientSecret'] as String;
    } catch (e) {
      rethrow;
    }
  }
}
