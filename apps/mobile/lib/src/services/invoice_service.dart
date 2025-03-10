import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/invoice_model.dart';

class InvoiceService {
  final CollectionReference _invoicesRef =
      FirebaseFirestore.instance.collection('invoices');

  /// Create a new invoice document in Firestore.
  /// Returns the generated invoice ID on success.
  Future<String> createInvoice({
    required String parentId,
    required double amountDue,
    required DateTime dueDate,
    List<String> studentIds = const [],
  }) async {
    final docRef = _invoicesRef.doc(); // auto-generate ID
    final invoice = Invoice(
      id: docRef.id,
      parentId: parentId,
      amountDue: amountDue,
      status: InvoiceStatus.unpaid,
      dueDate: dueDate,
      createdAt: DateTime.now(),
      studentIds: studentIds,
    );
    await docRef.set(invoice.toMap());
    return docRef.id;
  }

  /// Fetch a single invoice by its ID.
  Future<Invoice?> getInvoiceById(String invoiceId) async {
    final doc = await _invoicesRef.doc(invoiceId).get();
    if (!doc.exists) return null;
    return Invoice.fromDocument(doc);
  }

  /// Listen to all invoices for a given parent.
  /// Returns a stream of a list of Invoices.
  Stream<List<Invoice>> streamInvoicesByParent(String parentId) {
    return _invoicesRef
        .where('parentId', isEqualTo: parentId)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs.map((doc) {
        return Invoice.fromDocument(doc);
      }).toList();
    });
  }

  /// Update the status field on an existing invoice
  Future<void> updateInvoiceStatus(String invoiceId, InvoiceStatus newStatus) async {
    await _invoicesRef.doc(invoiceId).update({
      'status': newStatus.value,
    });
  }

  /// Add a payment record to the /payments subcollection of an invoice.
  /// Optionally updates the invoice status as well.
  // Future<String> addPayment(String invoiceId, Payment payment) async {
  //   final paymentsRef = _invoicesRef.doc(invoiceId).collection('payments');
  //   final docRef = paymentsRef.doc();
  //   final paymentData = payment.copyWith(id: docRef.id);

  //   await docRef.set(paymentData.toMap());
  //   return docRef.id;
  // }
}
