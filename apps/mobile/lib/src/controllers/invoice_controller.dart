import 'package:flutter/foundation.dart';
import '../services/invoice_service.dart';
import '../models/invoice_model.dart';

class InvoiceController extends ChangeNotifier {
  final InvoiceService _invoiceService = InvoiceService();

  List<Invoice> _invoices = [];
  List<Invoice> get invoices => _invoices;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  Stream<List<Invoice>>? _invoicesStream;
  Stream<List<Invoice>>? get invoicesStream => _invoicesStream;

  /// Listen to the parent’s invoices in real-time.
  void listenToInvoicesForParent(String parentId) {
    _isLoading = true;
    notifyListeners();

    _invoicesStream = _invoiceService.streamInvoicesByParent(parentId);

    _invoicesStream!.listen((invoiceList) {
      _invoices = invoiceList;
      _isLoading = false;
      notifyListeners();
    });
  }

  /// Create a new invoice via the service.
  Future<void> createInvoice({
    required String parentId,
    required double amountDue,
    required DateTime dueDate,
    List<String> studentIds = const [],
  }) async {
    try {
      _isLoading = true;
      notifyListeners();

      await _invoiceService.createInvoice(
          parentId: parentId,
          amountDue: amountDue,
          dueDate: dueDate,
          studentIds: studentIds);
    } catch (e) {
      if (kDebugMode) print("Error creating invoice: $e");
      // handle the error or re-throw
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Mark an invoice as paid
  Future<void> markInvoiceAsPaid(String invoiceId) async {
    try {
      _isLoading = true;
      notifyListeners();

      await _invoiceService.updateInvoiceStatus(
        invoiceId,
        InvoiceStatus.paid,
      );
    } catch (e) {
      if (kDebugMode) {
        print("Error marking invoice as paid: $e");
      }
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> hasUnpaidInvoices(String parentId) async {
    return await _invoiceService.hasUnpaidInvoices(parentId);
  }

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
      final clientSecret = await _invoiceService.createPaymentIntent(
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

  /// After a successful payment for a single invoice,
  /// subtract the paid amount and mark as paid if fully paid.
  Future<void> updateInvoiceAfterPayment(
      String invoiceId, double paidAmount) async {
    final invoice = await _invoiceService.getInvoiceById(invoiceId);
    if (invoice != null) {
      // Subtract the paid amount.
      double newAmount = invoice.amountDue - paidAmount;
      if (newAmount <= 0) {
        newAmount = 0;
      }
      // Mark as paid if nothing remains.
      InvoiceStatus newStatus =
          newAmount == 0 ? InvoiceStatus.paid : invoice.status;
      await _invoiceService.updateInvoicePayment(
          invoiceId, newAmount, newStatus);
    }
  }

  /// After a successful "Pay All" payment, mark all invoices as paid.
  Future<void> markAllInvoicesPaid(String parentId) async {
    await _invoiceService.markAllInvoicesAsPaid(parentId);
  }

  /// Verify the payment status with Stripe via the backend.
  Future<bool> verifyPaymentStatus(String clientSecret) async {
    return await _invoiceService.verifyPaymentStatus(clientSecret);
  }
}
