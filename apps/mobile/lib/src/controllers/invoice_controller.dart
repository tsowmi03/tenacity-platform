import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import '../services/invoice_service.dart';
import '../models/invoice_model.dart';
import '../models/student_model.dart';
import '../services/timetable_service.dart';

class InvoiceController extends ChangeNotifier {
  final InvoiceService _invoiceService = InvoiceService();
  final AuthController _authController = AuthController();

  List<Invoice> _invoices = [];
  List<Invoice> get invoices => _invoices;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  Stream<List<Invoice>>? _invoicesStream;
  Stream<List<Invoice>>? get invoicesStream => _invoicesStream;
  Stream<List<Invoice>>? _allInvoicesStream;
  Stream<List<Invoice>>? get allInvoicesStream => _allInvoicesStream;

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
    int tokensUsed = 0,
    bool isOneOff = false, // Add this parameter
  }) async {
    if (students.length != sessionsPerStudent.length) {
      throw Exception("A session count must be provided for each student.");
    }

    _isLoading = true;
    notifyListeners();

    try {
      double totalAmount = 0;
      List<Map<String, dynamic>> lineItems = [];

      // 1) Build line items for each student's sessions.
      for (int i = 0; i < students.length; i++) {
        final student = students[i];
        final sessions = sessionsPerStudent[i];

        // Determine base rate
        double baseRate;
        if (isOneOff) {
          // For one-off bookings, use the Firebase Remote Config price
          final remoteConfig = FirebaseRemoteConfig.instance;
          baseRate = remoteConfig.getDouble('one_off_class_price');
        } else {
          // Regular pricing logic
          baseRate = 60;
          final gradeNum =
              int.tryParse(student.grade.replaceAll(RegExp(r'\D'), ''));
          if (gradeNum != null && gradeNum >= 7 && gradeNum <= 12) {
            baseRate = 70;
          }
        }

        // For each session per week, create one line item
        for (int s = 0; s < sessions; s++) {
          final lineSubtotal = baseRate * weeks;
          totalAmount += lineSubtotal;

          final description = isOneOff
              ? 'One-off class: ${student.firstName} ${student.lastName}'
              : '${student.firstName} ${student.lastName} (session ${s + 1})';

          lineItems.add({
            'studentName': '${student.firstName} ${student.lastName}',
            'description': description,
            'quantity': weeks,
            'unitAmount': baseRate,
            'lineTotal': lineSubtotal,
          });
        }
      }

      // 2) Apply discount lines ONLY for regular invoices (not one-off)
      if (!isOneOff) {
        final int fullLinesCount = lineItems.length;
        final int discountPairs = fullLinesCount ~/ 2;
        for (int i = 0; i < discountPairs; i++) {
          final discountTotal = 10.0 * weeks;
          totalAmount -= discountTotal;

          lineItems.add({
            'description': 'Second lesson discount',
            'quantity': weeks,
            'unitAmount': -10,
            'lineTotal': -discountTotal,
          });
        }
      }

      // 3) Apply token discount line item
      if (tokensUsed > 0) {
        final discountTotal = 60.0 * tokensUsed;
        totalAmount -= discountTotal;

        lineItems.add({
          'description': 'Lesson tokens used ($tokensUsed)',
          'quantity': tokensUsed,
          'unitAmount': -60,
          'lineTotal': -discountTotal,
        });
      }

      // 4) Create the invoice document in Firestore
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
    try {
      // Delegates to the service, which now auto-generates the PDF if missing
      return await _invoiceService.getInvoicePdf(invoiceId);
    } catch (error) {
      if (kDebugMode) print("Error fetching PDF: $error");
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

  Future<void> generateOneOffInvoice(
    int paidBookings,
    double oneOffPrice,
    List<String> paidStudentIds,
    ClassModel classInfo,
    Parent parentUser,
    int tokensUsed,
  ) async {
    try {
      // Fetch student data to build line items
      final List<Student?> students = await Future.wait(
        paidStudentIds.map((id) => _authController.fetchStudentData(id)),
      );

      // Create invoice with one-off class line items
      await createInvoice(
        parentId: parentUser.uid,
        parentName: '${parentUser.firstName} ${parentUser.lastName}',
        parentEmail: parentUser.email,
        students: students.whereType<Student>().toList(),
        sessionsPerStudent:
            List.filled(paidBookings, 1), // 1 session per student
        weeks: 1, // One-off bookings are for 1 week only
        dueDate: DateTime.now().add(const Duration(days: 7)), // Due in 1 week
        tokensUsed: tokensUsed,
        isOneOff: true,
      );
    } catch (e) {
      debugPrint('Error generating one-off invoice: $e');
      // Don't show error to user as booking was successful
    }
  }

  /// Get all invoices (one-time fetch for admin)
  Future<List<Invoice>> getAllInvoices() async {
    _isLoading = true;
    notifyListeners();

    try {
      final invoices = await _invoiceService.getAllInvoices();
      _invoices = invoices;
      return invoices;
    } catch (e) {
      if (kDebugMode) print("Error fetching all invoices: $e");
      rethrow;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Listen to all invoices for admin view (real-time updates)
  void listenToAllInvoices() {
    _isLoading = true;
    notifyListeners();

    _allInvoicesStream = _invoiceService.streamAllInvoices();
    _allInvoicesStream!.listen((invoiceList) {
      _invoices = invoiceList;
      _isLoading = false;
      notifyListeners();
    });
  }
}
