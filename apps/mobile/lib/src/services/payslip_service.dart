import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/payslip_model.dart';

class PayslipService {
  final CollectionReference _payslipsRef =
      FirebaseFirestore.instance.collection('payslips');

  /// Create a new payslip document in Firestore.
  Future<String> createPayslip(Payslip payslip) async {
    final docRef = _payslipsRef.doc(payslip.id);
    await docRef.set(payslip.toMap());
    return docRef.id;
  }

  /// Get a payslip by its ID.
  Future<Payslip?> getPayslipById(String payslipId) async {
    final doc = await _payslipsRef.doc(payslipId).get();
    if (!doc.exists) return null;
    return Payslip.fromDocument(doc);
  }

  /// Stream payslips for a specific tutor.
  Stream<List<Payslip>> streamPayslipsByTutor(String tutorId) {
    return _payslipsRef
        .where('tutorId', isEqualTo: tutorId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Payslip.fromDocument(doc)).toList());
  }

  /// Update a payslip (e.g., to add Xero ID or PDF URL).
  Future<void> updatePayslip(
      String payslipId, Map<String, dynamic> data) async {
    await _payslipsRef.doc(payslipId).update(data);
  }
}
