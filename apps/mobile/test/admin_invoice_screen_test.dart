import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/admin_invoice_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

class _FakeConnectivityController extends ChangeNotifier
    implements ConnectivityController {
  _FakeConnectivityController({this.onlineCheck});

  final Future<bool> Function()? onlineCheck;

  @override
  bool get isOnline => true;

  @override
  bool get isOffline => false;

  @override
  Future<bool> refreshAndCheckOnline() async =>
      await (onlineCheck?.call() ?? Future.value(true));

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInvoiceController extends ChangeNotifier
    implements InvoiceController {
  _FakeInvoiceController(this.currentInvoices);

  List<Invoice> currentInvoices;
  int loadCalls = 0;
  int markPaidCalls = 0;
  int deleteCalls = 0;
  int pdfCalls = 0;
  Object? markPaidError;

  @override
  Future<List<Invoice>> getAllInvoices() async {
    loadCalls++;
    return [...currentInvoices];
  }

  @override
  Future<void> markInvoiceAsPaid(String invoiceId) async {
    markPaidCalls++;
    final error = markPaidError;
    if (error != null) throw error;
    currentInvoices = [
      for (final invoice in currentInvoices)
        if (invoice.id == invoiceId)
          invoice.copyWith(status: InvoiceStatus.paid)
        else
          invoice,
    ];
  }

  @override
  Future<void> deleteInvoice(String invoiceId) async {
    deleteCalls++;
    currentInvoices =
        currentInvoices.where((invoice) => invoice.id != invoiceId).toList();
  }

  @override
  Future<String> fetchInvoicePdf(String invoiceId) async {
    pdfCalls++;
    return 'https://example.com/$invoiceId.pdf';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('detail actions preserve PDF and confirmed mark-paid behavior',
      (tester) async {
    final controller = _FakeInvoiceController([_invoice()]);
    final openedUris = <Uri>[];
    await _pumpConsole(
      tester,
      controller: controller,
      openExternalUri: (uri) async {
        openedUris.add(uri);
        return true;
      },
    );

    await tester.tap(
      find.byKey(const Key('admin-invoice-row-invoice-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(const Key('admin-invoice-detail-pdf')),
    );
    await tester.pumpAndSettle();
    expect(controller.pdfCalls, 1);
    expect(openedUris.single.toString(), 'https://example.com/invoice-1.pdf');
    expect(find.text('Invoice INV-100'), findsOneWidget);

    await tester.tap(
      find.byKey(const Key('admin-invoice-detail-paid')),
    );
    // The detail action stays busy while the confirmation is open, so the
    // indeterminate progress indicator behind the modal keeps animating.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Mark invoice as paid?'), findsOneWidget);
    expect(controller.markPaidCalls, 0);

    await tester.tap(
      find.byKey(const Key('admin-invoice-confirm')),
    );
    await tester.pumpAndSettle();

    expect(controller.markPaidCalls, 1);
    expect(controller.loadCalls, greaterThanOrEqualTo(2));
    expect(find.text('Invoice marked as paid.'), findsOneWidget);
    expect(find.text('Invoice INV-100'), findsNothing);
    expect(find.text('PAID'), findsOneWidget);
  });

  testWidgets('bulk delete confirms, mutates and refreshes the console',
      (tester) async {
    final controller = _FakeInvoiceController([_invoice()]);
    await _pumpConsole(
      tester,
      controller: controller,
      openExternalUri: (_) async => true,
    );

    await tester.tap(find.byKey(const Key('admin-invoice-select')));
    await tester.pump();
    await tester.tap(
      find.byKey(const Key('admin-invoice-checkbox-invoice-1')),
    );
    await tester.pump();
    await tester.tap(
      find.byKey(const Key('admin-invoice-bulk-delete')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Delete selected invoices?'), findsOneWidget);
    expect(controller.deleteCalls, 0);

    await tester.tap(
      find.byKey(const Key('admin-invoice-confirm')),
    );
    await tester.pumpAndSettle();

    expect(controller.deleteCalls, 1);
    expect(find.text('No invoices found'), findsOneWidget);
    expect(find.text('Selected invoices deleted.'), findsOneWidget);
  });

  testWidgets('a rejected mark-paid write stays open and reports failure',
      (tester) async {
    final controller = _FakeInvoiceController([_invoice()])
      ..markPaidError = StateError('write rejected');
    await _pumpConsole(
      tester,
      controller: controller,
      openExternalUri: (_) async => true,
    );

    await tester.tap(
      find.byKey(const Key('admin-invoice-row-invoice-1')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const Key('admin-invoice-detail-paid')),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(
      find.byKey(const Key('admin-invoice-confirm')),
    );
    await tester.pumpAndSettle();

    expect(controller.markPaidCalls, 1);
    expect(find.text('The invoice could not be updated. Try again.'),
        findsOneWidget);
    expect(find.text('Invoice INV-100'), findsOneWidget);
    expect(find.text('UNPAID'), findsNWidgets(2));
  });

  testWidgets(
      'bulk mutation locks selection and route before connectivity completes',
      (tester) async {
    final onlineGate = Completer<bool>();
    final controller = _FakeInvoiceController([_invoice()]);
    await _pumpConsole(
      tester,
      controller: controller,
      connectivity: _FakeConnectivityController(
        onlineCheck: () => onlineGate.future,
      ),
      openExternalUri: (_) async => true,
    );

    await tester.tap(find.byKey(const Key('admin-invoice-select')));
    await tester.pump();
    await tester.tap(
      find.byKey(const Key('admin-invoice-checkbox-invoice-1')),
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('admin-invoice-bulk-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('admin-invoice-confirm')));
    await tester.pump();

    expect(controller.deleteCalls, 0);
    expect(
      tester.widget<IconButton>(find.byKey(const Key('detail-back'))).onPressed,
      isNull,
    );

    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.byType(AdminInvoiceView), findsOneWidget);

    onlineGate.complete(true);
    await tester.pumpAndSettle();

    expect(controller.deleteCalls, 1);
    expect(find.text('No invoices found'), findsOneWidget);
  });
}

Future<void> _pumpConsole(
  WidgetTester tester, {
  required _FakeInvoiceController controller,
  required AdminInvoiceUriLauncher openExternalUri,
  _FakeConnectivityController? connectivity,
}) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<InvoiceController>.value(value: controller),
        ChangeNotifierProvider<ConnectivityController>.value(
          value: connectivity ?? _FakeConnectivityController(),
        ),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: AdminInvoiceView(openExternalUri: openExternalUri),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Invoice _invoice() => Invoice(
      id: 'invoice-1',
      parentId: 'parent-1',
      parentName: 'Pat Parent',
      parentEmail: 'pat@example.com',
      lineItems: const [
        {
          'studentName': 'Ella Parent',
          'description': 'Tutoring',
          'quantity': 2,
          'unitAmount': 60.0,
          'lineTotal': 120.0,
        },
      ],
      weeks: 2,
      amountDue: 120,
      status: InvoiceStatus.unpaid,
      dueDate: DateTime(2026, 8, 20),
      createdAt: DateTime(2026, 7, 20),
      invoiceNumber: 'INV-100',
    );
