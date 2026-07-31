import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/invoices_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

class _FakeConnectivityController extends ChangeNotifier
    implements ConnectivityController {
  bool online = true;

  @override
  bool get isOnline => online;

  @override
  bool get isOffline => !online;

  @override
  Future<bool> refreshAndCheckOnline() async => online;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInvoiceController extends ChangeNotifier
    implements InvoiceController {
  List<Invoice> currentInvoices;
  bool loading = false;
  String? loadError;
  bool verifyResult;
  Completer<String>? pdfCompleter;

  int listenCalls = 0;
  int initiateSingleCalls = 0;
  int initiateMultipleCalls = 0;
  int verifyCalls = 0;
  int pdfCalls = 0;
  List<String> lastMultipleInvoiceIds = const [];
  double? lastMultipleAmount;

  _FakeInvoiceController({
    required this.currentInvoices,
    this.loadError,
    this.verifyResult = true,
  });

  @override
  List<Invoice> get invoices => currentInvoices;

  @override
  bool get isLoading => loading;

  @override
  String? get invoiceLoadError => loadError;

  @override
  void listenToInvoicesForParent(String parentId) {
    listenCalls++;
  }

  @override
  Future<String> initiatePaymentForInvoice({
    required String invoiceId,
    required String parentId,
    required double amount,
    String currency = 'aud',
  }) async {
    initiateSingleCalls++;
    return 'pi_single_secret';
  }

  @override
  Future<String> initiatePaymentForInvoices({
    required List<String> invoiceIds,
    required String parentId,
    required double amount,
    String currency = 'aud',
  }) async {
    initiateMultipleCalls++;
    lastMultipleInvoiceIds = invoiceIds;
    lastMultipleAmount = amount;
    return 'pi_all_secret';
  }

  @override
  Future<bool> verifyPaymentStatus(String clientSecret) async {
    verifyCalls++;
    return verifyResult;
  }

  @override
  Future<String> fetchInvoicePdf(String invoiceId) {
    pdfCalls++;
    return pdfCompleter?.future ??
        Future.value('https://example.com/$invoiceId.pdf');
  }

  void publish(List<Invoice> invoices) {
    currentInvoices = invoices;
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakePaymentSheet implements ParentInvoicePaymentSheet {
  Object? presentError;
  Completer<void>? presentCompleter;
  int prepareCalls = 0;
  int presentCalls = 0;
  final List<String> preparedSecrets = [];

  @override
  Future<void> prepare(String clientSecret) async {
    prepareCalls++;
    preparedSecrets.add(clientSecret);
  }

  @override
  Future<void> present() async {
    presentCalls++;
    final completer = presentCompleter;
    if (completer != null) await completer.future;
    final error = presentError;
    if (error != null) throw error;
  }
}

Invoice _invoice({
  required String id,
  InvoiceStatus status = InvoiceStatus.unpaid,
  double amount = 180,
  DateTime? paidAt,
}) {
  return Invoice(
    id: id,
    parentId: 'parent-1',
    parentName: 'Pat Parent',
    parentEmail: 'pat@example.com',
    lineItems: const [
      {
        'studentName': 'Ella Parent',
        'quantity': 2,
        'unitAmount': 90,
        'lineTotal': 180,
      },
    ],
    weeks: 2,
    amountDue: amount,
    status: status,
    dueDate: DateTime(2026, 7, 31),
    createdAt: DateTime(2026, 7, 1),
    invoiceNumber: 'INV-$id',
    paidAt: paidAt,
  );
}

Future<void> _pumpInvoices(
  WidgetTester tester, {
  required _FakeInvoiceController controller,
  required _FakePaymentSheet paymentSheet,
  Future<bool> Function(Uri)? openExternalUri,
  Size size = const Size(402, 874),
  double textScale = 1,
  String parentId = 'parent-1',
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<InvoiceController>.value(value: controller),
        ChangeNotifierProvider<ConnectivityController>.value(
          value: _FakeConnectivityController(),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
          ),
          child: child!,
        ),
        home: InvoicesScreen(
          parentId: parentId,
          paymentSheet: paymentSheet,
          openExternalUri: openExternalUri,
          now: () => DateTime(2026, 7, 26),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('renders unpaid and history surfaces at compact width',
      (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: [
        _invoice(id: '1001'),
        _invoice(
          id: '0999',
          status: InvoiceStatus.paid,
          paidAt: DateTime(2026, 6, 20),
        ),
      ],
    );

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: _FakePaymentSheet(),
      size: const Size(320, 700),
      textScale: 1.3,
    );

    expect(find.text(r'$180.00'), findsWidgets);
    expect(find.text('Pay now'), findsOneWidget);
    expect(find.text('HISTORY'), findsOneWidget);
    expect(find.byIcon(Icons.description_outlined), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows pending verification and prevents a duplicate payment',
      (tester) async {
    final invoice = _invoice(id: '1001');
    final controller = _FakeInvoiceController(
      currentInvoices: [invoice],
      verifyResult: false,
    );
    final paymentSheet = _FakePaymentSheet();

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: paymentSheet,
    );
    await tester.tap(find.byKey(const Key('parent-invoice-pay-1001')));
    await tester.pump();
    await tester.pump();

    expect(
      find.text('We are still confirming your payment'),
      findsOneWidget,
    );
    expect(find.text('Check again'), findsOneWidget);
    expect(find.text('Confirming…'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(
            find.byKey(const Key('parent-invoice-pay-1001')),
          )
          .onPressed,
      isNull,
    );
    expect(controller.initiateSingleCalls, 1);
    expect(paymentSheet.presentCalls, 1);

    controller.verifyResult = true;
    await tester.tap(
      find.byKey(const Key('parent-invoice-feedback-action')),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Payment received'), findsOneWidget);
    expect(controller.verifyCalls, 2);

    controller.publish([
      _invoice(
        id: '1001',
        status: InvoiceStatus.paid,
        paidAt: DateTime(2026, 7, 26),
      ),
    ]);
    await tester.pump();
    await tester.pump();
    expect(find.text('Your paid invoices are now in History.'), findsOneWidget);
    expect(find.text('HISTORY'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('ignores a payment sheet that finishes after the parent changes',
      (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: [_invoice(id: '1001')],
    );
    final paymentSheet = _FakePaymentSheet()
      ..presentCompleter = Completer<void>();

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: paymentSheet,
    );
    await tester.tap(find.byKey(const Key('parent-invoice-pay-1001')));
    await tester.pump();
    expect(paymentSheet.presentCalls, 1);

    controller.currentInvoices = [_invoice(id: '2001')];
    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: paymentSheet,
      parentId: 'parent-2',
    );
    expect(controller.listenCalls, 2);
    expect(find.byKey(const Key('parent-invoice-pay-2001')), findsOneWidget);

    paymentSheet.presentCompleter!.complete();
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const Key('parent-invoice-feedback')), findsNothing);
    expect(find.text('Pay now'), findsOneWidget);
    expect(controller.verifyCalls, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pay all sends the visible invoice set and total',
      (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: [
        _invoice(id: '1001', amount: 180),
        _invoice(id: '1002', amount: 240),
      ],
    );
    final paymentSheet = _FakePaymentSheet();

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: paymentSheet,
    );
    await tester.tap(find.byKey(const Key('parent-invoices-pay-all')));
    await tester.pump();
    await tester.pump();

    expect(controller.initiateMultipleCalls, 1);
    expect(controller.lastMultipleInvoiceIds, ['1001', '1002']);
    expect(controller.lastMultipleAmount, 420);
    expect(paymentSheet.preparedSecrets, ['pi_all_secret']);
    expect(find.text('Payment received'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'treats payment-sheet cancellation as no charge and reuses intent',
      (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: [_invoice(id: '1001')],
    );
    final paymentSheet = _FakePaymentSheet()
      ..presentError = const StripeException(
        error: LocalizedErrorMessage(code: FailureCode.Canceled),
      );

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: paymentSheet,
    );

    final payButton = find.byKey(const Key('parent-invoice-pay-1001'));
    await tester.tap(payButton);
    await tester.pumpAndSettle();
    expect(find.text('Payment cancelled'), findsOneWidget);
    expect(find.textContaining('No charge was made'), findsOneWidget);

    await tester.tap(payButton);
    await tester.pumpAndSettle();
    expect(controller.initiateSingleCalls, 1);
    expect(paymentSheet.prepareCalls, 2);
    expect(paymentSheet.presentCalls, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('surfaces payment-sheet failure without changing invoices',
      (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: [_invoice(id: '1001')],
    );
    final paymentSheet = _FakePaymentSheet()
      ..presentError = StateError('sheet unavailable');

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: paymentSheet,
    );
    await tester.tap(find.byKey(const Key('parent-invoice-pay-1001')));
    await tester.pumpAndSettle();

    expect(find.text('Payment could not be started'), findsOneWidget);
    expect(find.textContaining('invoices are unchanged'), findsOneWidget);
    expect(find.text('Pay now'), findsOneWidget);
    expect(controller.verifyCalls, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('coalesces PDF prefetch and open requests', (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: [_invoice(id: '1001')],
    )..pdfCompleter = Completer<String>();
    final openedUris = <Uri>[];

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: _FakePaymentSheet(),
      openExternalUri: (uri) async {
        openedUris.add(uri);
        return true;
      },
    );

    expect(controller.pdfCalls, 1);
    await tester.tap(find.byKey(const Key('parent-invoice-pdf-1001')));
    await tester.pump();
    expect(controller.pdfCalls, 1);
    expect(find.text('Opening'), findsOneWidget);

    controller.pdfCompleter!.complete('https://example.com/invoice.pdf');
    await tester.pumpAndSettle();
    expect(openedUris.single.toString(), 'https://example.com/invoice.pdf');
    expect(controller.pdfCalls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows a durable error when the PDF cannot be fetched',
      (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: [_invoice(id: '1001')],
    )..pdfCompleter = Completer<String>();

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: _FakePaymentSheet(),
    );
    controller.pdfCompleter!.completeError(StateError('missing PDF'));
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byKey(const Key('parent-invoice-pdf-1001')));
    await tester.pumpAndSettle();

    expect(find.text('Invoice PDF unavailable'), findsOneWidget);
    expect(find.textContaining('could not be opened'), findsOneWidget);
    expect(find.text('PDF'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('shows retryable loading failure', (tester) async {
    final controller = _FakeInvoiceController(
      currentInvoices: const [],
      loadError:
          'Invoices could not be loaded. Check your connection and try again.',
    );

    await _pumpInvoices(
      tester,
      controller: controller,
      paymentSheet: _FakePaymentSheet(),
    );

    expect(find.text('Invoices could not be loaded'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await tester.pump();
    expect(controller.listenCalls, 2);
    expect(tester.takeException(), isNull);
  });
}
