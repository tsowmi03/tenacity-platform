import 'package:cloud_firestore/cloud_firestore.dart';

class Payslip {
  final String id;
  final String tutorId;
  final String tutorName;
  final DateTime periodStart;
  final DateTime periodEnd;
  final double grossPay;
  final double deductions;
  final double netPay;
  final DateTime createdAt;
  final String? xeroPayslipId;
  final String? pdfUrl;
  final double hoursWorked;

  Payslip({
    required this.id,
    required this.tutorId,
    required this.tutorName,
    required this.periodStart,
    required this.periodEnd,
    required this.grossPay,
    required this.deductions,
    required this.netPay,
    required this.createdAt,
    this.xeroPayslipId,
    this.pdfUrl,
    this.hoursWorked = 0.0,
  });

  factory Payslip.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Payslip(
      id: doc.id,
      tutorId: data['tutorId'] ?? '',
      tutorName: data['tutorName'] ?? '',
      periodStart: (data['periodStart'] as Timestamp).toDate(),
      periodEnd: (data['periodEnd'] as Timestamp).toDate(),
      grossPay: (data['grossPay'] as num?)?.toDouble() ?? 0.0,
      deductions: (data['deductions'] as num?)?.toDouble() ?? 0.0,
      netPay: (data['netPay'] as num?)?.toDouble() ?? 0.0,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      xeroPayslipId: data['xeroPayslipId'] as String?,
      pdfUrl: data['pdfUrl'] as String?,
      hoursWorked: (data['hoursWorked'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'tutorId': tutorId,
      'tutorName': tutorName,
      'periodStart': Timestamp.fromDate(periodStart),
      'periodEnd': Timestamp.fromDate(periodEnd),
      'grossPay': grossPay,
      'deductions': deductions,
      'netPay': netPay,
      'createdAt': Timestamp.fromDate(createdAt),
      'xeroPayslipId': xeroPayslipId,
      'pdfUrl': pdfUrl,
      'hoursWorked': hoursWorked,
    };
  }
}
