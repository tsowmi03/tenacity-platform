import 'package:firebase_storage/firebase_storage.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../models/invoice_model.dart';

class InvoiceService {
  final CollectionReference _invoicesRef =
      FirebaseFirestore.instance.collection('invoices');
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Create a new invoice document in Firestore.
  Future<String> createInvoice({
    required String parentId,
    required String parentName,
    required String parentEmail,
    required List<Map<String, dynamic>> lineItems,
    required int weeks,
    required double amountDue,
    required DateTime dueDate,
    List<String> studentIds = const [],
    double? amountDueComputed,
    double? amountDueOverride,
    String? adminNotes,
    String? createdByAdminId,
    String? invoiceNumber,
    String? stripePaymentIntentId,
  }) async {
    final callable = _functions.httpsCallable('createInvoice');
    final response = await callable.call<Map<String, dynamic>>({
      'parentId': parentId,
      'parentName': parentName,
      'parentEmail': parentEmail,
      'lineItems': lineItems,
      'weeks': weeks,
      'amountDue': amountDue,
      if (amountDueComputed != null) 'amountDueComputed': amountDueComputed,
      if (amountDueOverride != null) 'amountDueOverride': amountDueOverride,
      'dueDate': dueDate.millisecondsSinceEpoch,
      'studentIds': studentIds,
      if (adminNotes != null) 'adminNotes': adminNotes,
      if (createdByAdminId != null) 'createdByAdminId': createdByAdminId,
      if (invoiceNumber != null) 'invoiceNumber': invoiceNumber,
      if (stripePaymentIntentId != null)
        'stripePaymentIntentId': stripePaymentIntentId,
    });

    final invoiceId = response.data['invoiceId'];
    if (invoiceId is! String || invoiceId.isEmpty) {
      throw Exception('createInvoice did not return an invoiceId');
    }

    return invoiceId;
  }

  Future<Invoice?> getInvoiceById(String invoiceId) async {
    final doc = await _invoicesRef.doc(invoiceId).get();
    if (!doc.exists) return null;
    return Invoice.fromDocument(doc);
  }

  Stream<List<Invoice>> streamInvoicesByParent(String parentId) {
    return _invoicesRef.where('parentId', isEqualTo: parentId).snapshots().map(
        (snapshot) =>
            snapshot.docs.map((doc) => Invoice.fromDocument(doc)).toList());
  }

  Future<void> updateInvoiceStatus(
      String invoiceId, InvoiceStatus newStatus) async {
    await _invoicesRef.doc(invoiceId).update({
      'status': newStatus.value,
    });
  }

  Future<String> getInvoicePdf(String invoiceId) async {
    final docRef = _invoicesRef.doc(invoiceId);
    final doc = await docRef.get();
    if (!doc.exists) throw Exception('Invoice not found');
    final data = doc.data() as Map<String, dynamic>;

    // 1) If we don't yet have a storage path, call the CF to generate & persist it
    String? pdfPath = data['xeroInvoicePdfPath'] as String?;
    if (pdfPath == null) {
      final callable = _functions.httpsCallable('getInvoicePdf');
      final result = await callable.call({'invoiceId': invoiceId});
      pdfPath = result.data['pdfPath'] as String;
      // persist path back to Firestore for next time
      await docRef.update({'xeroInvoicePdfPath': pdfPath});
    }

    // 2) Now fetch a durable download URL
    final ref = FirebaseStorage.instance.ref().child(pdfPath);
    return await ref.getDownloadURL();
  }

  Future<bool> hasUnpaidInvoices(String parentId) async {
    final querySnapshot = await _invoicesRef
        .where('parentId', isEqualTo: parentId)
        .where('status', isEqualTo: InvoiceStatus.unpaid.value)
        .limit(1)
        .get();
    return querySnapshot.docs.isNotEmpty;
  }

  /// Create payment intent for a specific invoice
  Future<String> createPaymentIntentForInvoice({
    required String invoiceId,
    required String parentId,
    required int amount,
    required String currency,
  }) async {
    try {
      final callable = _functions.httpsCallable('createPaymentIntent');
      final result = await callable.call({
        'amount': amount,
        'currency': currency,
        'parentId': parentId,
        'invoiceIds': [invoiceId],
      });
      return result.data['clientSecret'] as String;
    } catch (e) {
      rethrow;
    }
  }

  /// Create payment intent for multiple invoices (bulk payment)
  Future<String> createPaymentIntentForInvoices({
    required List<String> invoiceIds,
    required String parentId,
    required int amount,
    required String currency,
  }) async {
    try {
      final callable = _functions.httpsCallable('createPaymentIntent');
      final result = await callable.call({
        'amount': amount,
        'currency': currency,
        'parentId': parentId,
        'invoiceIds': invoiceIds,
      });
      return result.data['clientSecret'] as String;
    } catch (e) {
      rethrow;
    }
  }

  /// Legacy method for backward compatibility
  @Deprecated(
      'Use createPaymentIntentForInvoice or createPaymentIntentForInvoices instead')
  Future<String> createPaymentIntent({
    required int amount,
    required String currency,
  }) async {
    try {
      final callable = _functions.httpsCallable('createPaymentIntent');
      final result = await callable.call({
        'amount': amount,
        'currency': currency,
      });
      return result.data['clientSecret'] as String;
    } catch (e) {
      rethrow;
    }
  }

  Future<String> createOneOffPaymentIntent({
    required String parentId,
    required int amount,
    required String currency,
  }) async {
    try {
      final callable = _functions.httpsCallable('createPaymentIntent');
      final result = await callable.call({
        'amount': amount,
        'currency': currency,
        'parentId': parentId,
      });
      return result.data['clientSecret'] as String;
    } catch (e) {
      rethrow;
    }
  }

  Future<void> updateInvoicePayment(
      String invoiceId, double newAmount, InvoiceStatus newStatus) async {
    await _invoicesRef.doc(invoiceId).update({
      'amountDue': newAmount,
      'status': newStatus.value,
    });
  }

  Future<void> markAllInvoicesAsPaid(String parentId) async {
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

  Future<bool> verifyPaymentStatus(String clientSecret) async {
    try {
      final callable = _functions.httpsCallable('verifyPaymentStatus');
      final result = await callable.call({'clientSecret': clientSecret});
      return result.data['status'] == 'succeeded';
    } catch (e) {
      return false;
    }
  }

  // Get all invoices for admin view (one-time fetch)
  Future<List<Invoice>> getAllInvoices() async {
    final snapshot =
        await _invoicesRef.orderBy('createdAt', descending: true).get();
    return snapshot.docs.map((doc) => Invoice.fromDocument(doc)).toList();
  }

  // Stream all invoices for admin view (real-time updates)
  Stream<List<Invoice>> streamAllInvoices() {
    return _invoicesRef.orderBy('createdAt', descending: true).snapshots().map(
        (snapshot) =>
            snapshot.docs.map((doc) => Invoice.fromDocument(doc)).toList());
  }

  Future<void> deleteInvoice(String invoiceId) async {
    final docRef = _invoicesRef.doc(invoiceId);

    try {
      final doc = await docRef.get();
      if (doc.exists) {
        final data = doc.data() as Map<String, dynamic>;
        final pdfPath = data['xeroInvoicePdfPath'] as String?;
        if (pdfPath != null && pdfPath.isNotEmpty) {
          try {
            await FirebaseStorage.instance.ref().child(pdfPath).delete();
          } catch (_) {
            // Best-effort cleanup only.
          }
        }
      }
    } finally {
      await docRef.delete();
    }
  }
}
