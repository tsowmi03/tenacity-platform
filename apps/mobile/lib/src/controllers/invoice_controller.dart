import 'package:flutter/foundation.dart';
import '../services/invoice_service.dart';
import '../models/invoice_model.dart';
import '../models/student_model.dart';
import '../services/timetable_service.dart';

class InvoiceController extends ChangeNotifier {
  final InvoiceService _invoiceService = InvoiceService();

  List<Invoice> _invoices = [];
  List<Invoice> get invoices => _invoices;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  Stream<List<Invoice>>? _invoicesStream;
  Stream<List<Invoice>>? get invoicesStream => _invoicesStream;

  /// Listen to invoices for the given parent.
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

  Future<void> createInvoice({
    required String parentId,
    required String parentName,
    required String parentEmail,
    required List<Student> students,
    required List<int> sessionsPerStudent,
    required int weeks,
    required DateTime dueDate,
    int tokensUsed = 0, // <-- add this
  }) async {
    if (students.length != sessionsPerStudent.length) {
      throw Exception("A session count must be provided for each student.");
    }

    _isLoading = true;
    notifyListeners();

    try {
      double totalAmount = 0;
      List<Map<String, dynamic>> lineItems = [];

      // 1) Build full-price line items for each student's sessions.
      for (int i = 0; i < students.length; i++) {
        final student = students[i];
        final sessions = sessionsPerStudent[i];

        // Determine base rate based on grade
        double baseRate = 60;
        final gradeNum =
            int.tryParse(student.grade.replaceAll(RegExp(r'\D'), ''));
        if (gradeNum != null && gradeNum >= 7 && gradeNum <= 12) {
          baseRate = 70;
        }

        // For each session per week, create one line item at full base rate × weeks
        for (int s = 0; s < sessions; s++) {
          final lineSubtotal = baseRate * weeks; // e.g. 70 * 9 = 630
          totalAmount += lineSubtotal;

          lineItems.add({
            'studentName': '${student.firstName} ${student.lastName}',
            'description':
                '${student.firstName} ${student.lastName} (session ${s + 1})',
            'quantity': weeks,
            'unitAmount': baseRate,
            'lineTotal': lineSubtotal,
          });
        }
      }

      // 2) Apply discount lines: For every 2 full-price lines, add 1 discount line.
      final int fullLinesCount = lineItems.length;
      final int discountPairs = fullLinesCount ~/ 2; // integer division
      for (int i = 0; i < discountPairs; i++) {
        final discountTotal = 10.0 * weeks; // e.g. 10 * 9 = 90
        totalAmount -= discountTotal;

        lineItems.add({
          'description': 'Second lesson discount',
          'quantity': weeks,
          'unitAmount': -10,
          'lineTotal': -discountTotal,
        });
      }

      // 3) Apply token discount line item
      if (tokensUsed > 0) {
        final discountTotal = 60.0 * tokensUsed; // e.g. 60 * tokensUsed
        totalAmount -= discountTotal;

        lineItems.add({
          'description': 'Lesson tokens used ($tokensUsed)',
          'quantity': tokensUsed,
          'unitAmount': -60,
          'lineTotal': -discountTotal,
        });
      }

      // 4) Create the invoice document in Firestore with the final line items
      await _invoiceService.createInvoice(
        parentId: parentId,
        parentName: parentName,
        parentEmail: parentEmail,
        lineItems: lineItems,
        amountDue: totalAmount,
        weeks: weeks,
        dueDate: dueDate,
      );
    } catch (e) {
      if (kDebugMode) print("Error creating invoice: $e");
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Calculate the number of sessions a given student has in a week.
  Future<int> calculateSessionsForStudent(String studentId) async {
    final timetableService = TimetableService();
    final classes = await timetableService.fetchClassesForStudent(studentId);
    return classes.length;
  }

  Future<void> markInvoiceAsPaid(String invoiceId) async {
    try {
      _isLoading = true;
      notifyListeners();
      await _invoiceService.updateInvoiceStatus(invoiceId, InvoiceStatus.paid);
    } catch (e) {
      if (kDebugMode) print("Error marking invoice as paid: $e");
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<String> fetchInvoicePdf(String invoiceId) async {
    debugPrint(invoiceId);
    try {
      final pdfUrl = await _invoiceService.getInvoicePdf(invoiceId);
      debugPrint('PDF URL: $pdfUrl');
      return pdfUrl;
    } catch (error) {
      throw Exception("Error fetching PDF: $error");
    }
  }

  Future<bool> hasUnpaidInvoices(String parentId) async {
    return await _invoiceService.hasUnpaidInvoices(parentId);
  }

  Future<String> initiatePayment({
    required double amount,
    String currency = 'aud',
  }) async {
    final int convertedAmount = (amount * 100).toInt();
    try {
      final clientSecret = await _invoiceService.createPaymentIntent(
        amount: convertedAmount,
        currency: currency,
      );
      return clientSecret;
    } catch (error) {
      if (kDebugMode) print('Error initiating payment: $error');
      rethrow;
    }
  }

  Future<void> updateInvoiceAfterPayment(
      String invoiceId, double paidAmount) async {
    final invoice = await _invoiceService.getInvoiceById(invoiceId);
    if (invoice != null) {
      double newAmount = invoice.amountDue - paidAmount;
      if (newAmount <= 0) newAmount = 0;
      InvoiceStatus newStatus =
          newAmount == 0 ? InvoiceStatus.paid : invoice.status;
      await _invoiceService.updateInvoicePayment(
          invoiceId, newAmount, newStatus);
    }
  }

  Future<void> markAllInvoicesPaid(String parentId) async {
    await _invoiceService.markAllInvoicesAsPaid(parentId);
  }

  Future<bool> verifyPaymentStatus(String clientSecret) async {
    return await _invoiceService.verifyPaymentStatus(clientSecret);
  }
}
