import 'package:cloud_firestore/cloud_firestore.dart';
import 'payment_model.dart';

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

  /// Each map represents a line item in the invoice.
  /// For example:
  /// {
  ///   'description': 'Joshua tutoring (session 1)',
  ///   'quantity': 9,
  ///   'unitAmount': 70,
  ///   'lineTotal': 630
  /// }
  final List<Map<String, dynamic>> lineItems;

  final int weeks;
  final double amountDue;
  final InvoiceStatus status;
  final DateTime dueDate;
  final DateTime createdAt;
  final List<String> studentIds;
  final List<Payment> payments;
  final String? invoiceNumber;
  final String? xeroInvoiceId;

  Invoice({
    required this.id,
    required this.parentId,
    required this.parentName,
    required this.parentEmail,
    required this.lineItems,
    required this.weeks,
    required this.amountDue,
    required this.status,
    required this.dueDate,
    required this.createdAt,
    this.studentIds = const [],
    this.payments = const [],
    this.invoiceNumber,
    this.xeroInvoiceId,
  });

  factory Invoice.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Invoice(
      id: doc.id,
      parentId: data['parentId'] ?? '',
      parentName: data['parentName'] ?? '',
      parentEmail: data['parentEmail'] ?? '',
      lineItems: data['lineItems'] != null
          ? List<Map<String, dynamic>>.from(data['lineItems'])
          : [],
      weeks: data['weeks'] ?? 1,
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
      invoiceNumber: data['invoiceNumber'] as String?,
      xeroInvoiceId: data['xeroInvoiceId'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'parentId': parentId,
      'parentName': parentName,
      'parentEmail': parentEmail,
      'lineItems': lineItems,
      'weeks': weeks,
      'amountDue': amountDue,
      'status': status.value,
      'dueDate': Timestamp.fromDate(dueDate),
      'createdAt': Timestamp.fromDate(createdAt),
      'studentIds': studentIds,
      'invoiceNumber': invoiceNumber,
      'xeroInvoiceId': xeroInvoiceId,
    };
  }

  Invoice copyWith({
    List<Payment>? payments,
    List<String>? studentIds,
    String? invoiceNumber,
    String? xeroInvoiceId,
  }) {
    return Invoice(
      id: id,
      parentId: parentId,
      parentName: parentName,
      parentEmail: parentEmail,
      lineItems: lineItems,
      weeks: weeks,
      amountDue: amountDue,
      status: status,
      dueDate: dueDate,
      createdAt: createdAt,
      studentIds: studentIds ?? this.studentIds,
      payments: payments ?? this.payments,
      invoiceNumber: invoiceNumber ?? this.invoiceNumber,
      xeroInvoiceId: xeroInvoiceId ?? this.xeroInvoiceId,
    );
  }
}
