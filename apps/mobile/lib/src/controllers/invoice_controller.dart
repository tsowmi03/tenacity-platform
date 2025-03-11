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

  /// Add a payment record to an invoice
  // Future<void> addPaymentToInvoice(String invoiceId, Payment payment) async {
  //   try {
  //     _isLoading = true;
  //     notifyListeners();

  //     await _invoiceService.addPayment(invoiceId, payment);

  //     // Optionally also update the invoice status if the full
  //     // amount is covered, or do partial payment logic, etc.

  //   } catch (e) {
  //     if (kDebugMode) {
  //       print("Error adding payment: $e");
  //     }
  //   } finally {
  //     _isLoading = false;
  //     notifyListeners();
  //   }
  // }
}
