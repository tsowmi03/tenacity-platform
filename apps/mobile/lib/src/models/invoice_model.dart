import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'payment_model.dart';

/// Possible invoice statuses.
enum InvoiceStatus { unpaid, paid, overdue }

extension InvoiceStatusExtension on InvoiceStatus {
  String get value {
    switch (this) {
      case InvoiceStatus.unpaid:
        return 'unpaid';
      case InvoiceStatus.paid:
        return 'paid';
      case InvoiceStatus.overdue:
        return 'overdue';
    }
  }

  static InvoiceStatus fromString(String status) {
    switch (status) {
      case 'unpaid':
        return InvoiceStatus.unpaid;
      case 'paid':
        return InvoiceStatus.paid;
      case 'overdue':
        return InvoiceStatus.overdue;
      default:
        throw Exception("Unknown invoice status: $status");
    }
  }
}

/// Invoice model representing a Firestore invoice document.
class Invoice {
  final String id;
  final String parentId;
  final String parentName;
  final String parentEmail;

  /// List of student details. Each map contains:
  /// { 'studentName': String, 'studentYear': String, 'studentSubject': String }
  final List<Map<String, dynamic>> studentDetails;
  final int weeks; // Number of sessions (weeks)
  final bool secondHourDiscount;
  final bool siblingDiscount;
  final double amountDue;
  final InvoiceStatus status;
  final DateTime dueDate;
  final DateTime createdAt;
  final List<String> studentIds;
  final List<Payment> payments;

  Invoice({
    required this.id,
    required this.parentId,
    required this.parentName,
    required this.parentEmail,
    required this.studentDetails,
    required this.weeks,
    required this.secondHourDiscount,
    required this.siblingDiscount,
    required this.amountDue,
    required this.status,
    required this.dueDate,
    required this.createdAt,
    this.studentIds = const [],
    this.payments = const [],
  });

  factory Invoice.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Invoice(
      id: doc.id,
      parentId: data['parentId'] ?? '',
      parentName: data['parentName'] ?? '',
      parentEmail: data['parentEmail'] ?? '',
      studentDetails: data['studentDetails'] != null
          ? List<Map<String, dynamic>>.from(data['studentDetails'])
          : [],
      weeks: data['weeks'] ?? 1,
      secondHourDiscount: data['secondHourDiscount'] ?? false,
      siblingDiscount: data['siblingDiscount'] ?? false,
      amountDue: (data['amountDue'] as num?)?.toDouble() ?? 0.0,
      status: data['status'] != null
          ? InvoiceStatusExtension.fromString(data['status'] as String)
          : InvoiceStatus.unpaid,
      dueDate: data['dueDate'] != null
          ? (data['dueDate'] as Timestamp).toDate()
          : DateTime.now(),
      createdAt: data['createdAt'] != null
          ? (data['createdAt'] as Timestamp).toDate()
          : DateTime.now(),
      studentIds: data['studentIds'] != null
          ? List<String>.from(data['studentIds'] as List)
          : [],
      payments: const [],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'parentId': parentId,
      'parentName': parentName,
      'parentEmail': parentEmail,
      'studentDetails': studentDetails,
      'weeks': weeks,
      'secondHourDiscount': secondHourDiscount,
      'siblingDiscount': siblingDiscount,
      'amountDue': amountDue,
      'status': status.value,
      'dueDate': Timestamp.fromDate(dueDate),
      'createdAt': Timestamp.fromDate(createdAt),
      'studentIds': studentIds,
    };
  }

  Invoice copyWith({
    List<Payment>? payments,
    List<String>? studentIds,
  }) {
    return Invoice(
      id: id,
      parentId: parentId,
      parentName: parentName,
      parentEmail: parentEmail,
      studentDetails: studentDetails,
      weeks: weeks,
      secondHourDiscount: secondHourDiscount,
      siblingDiscount: siblingDiscount,
      amountDue: amountDue,
      status: status,
      dueDate: dueDate,
      createdAt: createdAt,
      studentIds: studentIds ?? this.studentIds,
      payments: payments ?? this.payments,
    );
  }
}

extension StudentInvoiceExtension on Student {
  Map<String, dynamic> toInvoiceMap() {
    return {
      'studentName': '$firstName $lastName',
      'studentYear': grade,
      'studentSubject': subjects.isNotEmpty ? subjects.first : '',
    };
  }
}
