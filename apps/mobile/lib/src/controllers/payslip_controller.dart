import 'package:flutter/foundation.dart';
import '../models/payslip_model.dart';
import '../services/payslip_service.dart';

class PayslipController extends ChangeNotifier {
  final PayslipService _payslipService = PayslipService();

  List<Payslip> _payslips = [];
  List<Payslip> get payslips => _payslips;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  Stream<List<Payslip>>? _payslipsStream;
  Stream<List<Payslip>>? get payslipsStream => _payslipsStream;

  /// Listen to payslips for the given tutor.
  void listenToPayslipsForTutor(String tutorId) {
    _isLoading = true;
    notifyListeners();

    _payslipsStream = _payslipService.streamPayslipsByTutor(tutorId);
    _payslipsStream!.listen((payslipList) {
      _payslips = payslipList;
      _isLoading = false;
      notifyListeners();
    });
  }

  /// Create a payslip.
  Future<void> createPayslip(Payslip payslip) async {
    _isLoading = true;
    notifyListeners();
    try {
      await _payslipService.createPayslip(payslip);
    } catch (e) {
      if (kDebugMode) print("Error creating payslip: $e");
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch a payslip PDF URL.
  Future<String?> fetchPayslipPdf(String payslipId) async {
    try {
      final payslip = await _payslipService.getPayslipById(payslipId);
      return payslip?.pdfUrl;
    } catch (e) {
      if (kDebugMode) print("Error fetching payslip PDF: $e");
      return null;
    }
  }
}
