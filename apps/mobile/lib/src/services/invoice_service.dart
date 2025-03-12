import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/invoice_model.dart';

class InvoiceService {
  final CollectionReference _invoicesRef =
      FirebaseFirestore.instance.collection('invoices');
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

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
  Future<void> updateInvoiceStatus(
      String invoiceId, InvoiceStatus newStatus) async {
    await _invoicesRef.doc(invoiceId).update({
      'status': newStatus.value,
    });
  }

  Future<bool> hasUnpaidInvoices(String parentId) async {
    final querySnapshot = await _invoicesRef
        .where('parentId', isEqualTo: parentId)
        .where('status', whereIn: ['unpaid'])
        .limit(1)
        .get();
    return querySnapshot.docs.isNotEmpty;
  }

  /// Creates a PaymentIntent via your Cloud Function.
  ///
  /// [amount] should be provided in the smallest currency unit.
  /// [currency] is typically 'aud' (or other supported currencies).
  Future<String> createPaymentIntent({
    required int amount,
    required String currency,
  }) async {
    try {
      // Call the cloud function 'createPaymentIntent'
      final callable = _functions.httpsCallable('createPaymentIntent');
      final result = await callable.call({
        'amount': amount,
        'currency': currency,
      });
      // Return the client secret from the response.
      return result.data['clientSecret'] as String;
    } catch (e) {
      rethrow;
    }
  }

  /// Update the invoice’s outstanding amount and status.
  Future<void> updateInvoicePayment(
      String invoiceId, double newAmount, InvoiceStatus newStatus) async {
    await _invoicesRef.doc(invoiceId).update({
      'amountDue': newAmount,
      'status': newStatus.value,
    });
  }

  /// Update all unpaid invoices for a parent to have an amountDue of 0 and mark them as paid.
  Future<void> markAllInvoicesAsPaid(String parentId) async {
    // Get all invoices for the parent that are still unpaid.
    QuerySnapshot query = await _invoicesRef
        .where('parentId', isEqualTo: parentId)
        .where('status', isEqualTo: InvoiceStatus.unpaid.value)
        .get();

    WriteBatch batch = FirebaseFirestore.instance.batch();
    for (var doc in query.docs) {
      batch.update(doc.reference, {
        'amountDue': 0,
        'status': InvoiceStatus.paid.value,
      });
    }
    await batch.commit();
  }

  /// Verify the status of a PaymentIntent via a Cloud Function.
  Future<bool> verifyPaymentStatus(String clientSecret) async {
    try {
      final callable = _functions.httpsCallable('verifyPaymentStatus');
      final result = await callable.call({'clientSecret': clientSecret});
      return result.data['status'] == 'succeeded';
    } catch (e) {
      // If verification fails for any reason, treat it as not successful.
      return false;
    }
  }
}
