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

  /// Create a new invoice.
  ///
  /// [students] is a list of Student objects.
  /// [sessionsPerStudent] is a list of session counts per week (one for each student).
  /// [weeks] is the total number of weeks this invoice covers.
  /// Pricing rules:
  /// - Base rate: $70 if grade is 7–12; otherwise $60.
  /// - For the first student (i==0):
  ///     • First session at full base rate.
  ///     • For additional sessions, if secondHourDiscount is desired,
  ///       each additional session costs (base rate – $10).
  /// - For subsequent students:
  ///     • They automatically get a sibling discount: effective rate = (base rate – $10) for every session.
  /// - The cost for each student is multiplied by the number of weeks.
  Future<void> createInvoice({
    required String parentId,
    required String parentName,
    required String parentEmail,
    required List<Student> students,
    required List<int> sessionsPerStudent,
    required int weeks,
    required DateTime dueDate,
  }) async {
    if (students.length != sessionsPerStudent.length) {
      throw Exception("A session count must be provided for each student.");
    }

    double totalAmount = 0;
    List<Map<String, dynamic>> studentDetails = [];

    for (int i = 0; i < students.length; i++) {
      final student = students[i];
      final sessions = sessionsPerStudent[i];

      // Convert the student to a map for invoice details.
      studentDetails.add(student.toInvoiceMap());

      // Determine base rate.
      double baseRate = 60;
      // Extract numeric value from grade string (e.g., "Year 8" becomes 8).
      final gradeNum =
          int.tryParse(student.grade.replaceAll(RegExp(r'\D'), ''));
      if (gradeNum != null && gradeNum >= 7 && gradeNum <= 12) {
        baseRate = 70;
      }

      double studentCost = 0;
      if (sessions > 0) {
        if (i == 0) {
          // First student: no sibling discount.
          studentCost = baseRate;
          if (sessions > 1) {
            double additionalRate = baseRate - 10;
            double extraCost = (sessions - 1) * additionalRate;
            studentCost += extraCost;
          }
        } else {
          // Subsequent students: apply sibling discount on every session.
          double effectiveRate = baseRate - 10;
          studentCost = sessions * effectiveRate;
        }
      }
      double studentTotalForTerm = studentCost * weeks;
      totalAmount += studentTotalForTerm;
    }

    try {
      _isLoading = true;
      notifyListeners();

      await _invoiceService.createInvoice(
        parentId: parentId,
        parentName: parentName,
        parentEmail: parentEmail,
        studentDetails: studentDetails,
        weeks: weeks,
        secondHourDiscount: false, // Now calculated automatically.
        siblingDiscount: false, // Now calculated automatically.
        amountDue: totalAmount,
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
  /// (This method uses the timetable service to fetch only the classes for that student.)
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
