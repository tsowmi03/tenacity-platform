import 'package:cloud_firestore/cloud_firestore.dart';
import 'payment_model.dart';

/// Possible invoice statuses
enum InvoiceStatus { unpaid, paid, partial }

extension InvoiceStatusExtension on InvoiceStatus {
  String get value {
    switch (this) {
      case InvoiceStatus.unpaid:
        return 'unpaid';
      case InvoiceStatus.paid:
        return 'paid';
      case InvoiceStatus.partial:
        return 'partial';
    }
  }

  static InvoiceStatus fromString(String status) {
    switch (status) {
      case 'unpaid':
        return InvoiceStatus.unpaid;
      case 'paid':
        return InvoiceStatus.paid;
      case 'partial':
        return InvoiceStatus.partial;
      default:
        throw Exception("Unknown invoice status: $status");
    }
  }
}

/// Model representing an invoice doc in `/invoices/{invoiceId}`.
class Invoice {
  final String id;       // invoiceId
  final String parentId; // e.g., '1234'
  final double amountDue;
  final InvoiceStatus status;    // or store "paid" as a bool if you prefer
  final DateTime dueDate;
  final DateTime createdAt;

  /// We do *not* store subcollection docs in the main doc fields.
  /// The list of payments can be fetched separately if needed.
  final List<Payment> payments;

  Invoice({
    required this.id,
    required this.parentId,
    required this.amountDue,
    required this.status,
    required this.dueDate,
    required this.createdAt,
    this.payments = const [],
  });

  /// Construct an Invoice from a Firestore document.
  /// This only reads the main invoice fields — not the subcollection.
  factory Invoice.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return Invoice(
      id: doc.id,
      parentId: data['parentId'] ?? '',
      amountDue: (data['amountDue'] as num).toDouble(),
      status: data['status'] != null
          ? InvoiceStatusExtension.fromString(data['status'] as String)
          : InvoiceStatus.unpaid,
      dueDate: data['dueDate'] != null
          ? (data['dueDate'] as Timestamp).toDate()
          : DateTime.now(),
      createdAt: data['createdAt'] != null
          ? (data['createdAt'] as Timestamp).toDate()
          : DateTime.now(),
      payments: const [],
    );
  }

  /// Convert an Invoice to a Map for writing to Firestore.
  /// Note: If you store "status" or "paid" in the doc, do so here.
  Map<String, dynamic> toMap() {
    return {
      'parentId': parentId,
      'amountDue': amountDue,
      'status': status.value,
      'dueDate': Timestamp.fromDate(dueDate),
      'createdAt': Timestamp.fromDate(createdAt),
    };
  }

  /// Helper: Create a copy with new fields (like updated payments).
  Invoice copyWith({
    List<Payment>? payments,
  }) {
    return Invoice(
      id: id,
      parentId: parentId,
      amountDue: amountDue,
      status: status,
      dueDate: dueDate,
      createdAt: createdAt,
      payments: payments ?? this.payments,
    );
  }
}
