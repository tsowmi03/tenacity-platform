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
    String? invoiceNumber,
  }) async {
    final docRef = _invoicesRef.doc();
    final invoice = Invoice(
      id: docRef.id,
      parentId: parentId,
      parentName: parentName,
      parentEmail: parentEmail,
      lineItems: lineItems,
      weeks: weeks,
      amountDue: amountDue,
      status: InvoiceStatus.unpaid,
      dueDate: dueDate,
      createdAt: DateTime.now(),
      studentIds: [],
      invoiceNumber: invoiceNumber,
    );
    await docRef.set(invoice.toMap());
    return docRef.id;
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

    // 1) If we don’t yet have a storage path, call the CF to generate & persist it
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
}
