import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/invoice_draft_model.dart';
import 'package:tenacity/src/ui/admin_review_invoice_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

class _FakeConnectivityController extends ChangeNotifier
    implements ConnectivityController {
  @override
  bool get isOnline => true;

  @override
  bool get isOffline => false;

  @override
  Future<bool> refreshAndCheckOnline() async => true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInvoiceController extends ChangeNotifier
    implements InvoiceController {
  InvoiceDraft? savedDraft;
  final List<InvoiceDraft> savedDrafts = [];
  int saveCalls = 0;
  Completer<void>? saveGate;
  Object? saveError;

  @override
  Future<String> createInvoiceFromDraft(
    InvoiceDraft draft, {
    String? stripePaymentIntentId,
  }) async {
    saveCalls++;
    savedDraft = draft;
    savedDrafts.add(draft);
    final error = saveError;
    if (error != null) {
      saveError = null;
      throw error;
    }
    await saveGate?.future;
    return 'invoice-1';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders review, total and editable line item at compact width',
      (tester) async {
    await _pump(
      tester,
      AdminReviewInvoiceScreen(initialDraft: _draft()),
      size: const Size(320, 700),
      textScale: 1.3,
    );

    expect(find.text('Review invoice'), findsOneWidget);
    expect(find.text('Pat Parent'), findsWidgets);
    expect(find.text(r'$120.00'), findsWidgets);
    expect(find.text('LINE ITEMS'), findsOneWidget);
    expect(
      find.byKey(const Key('admin-review-invoice-description-0')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('editing quantity or unit amount updates the final total',
      (tester) async {
    await _pump(
      tester,
      AdminReviewInvoiceScreen(initialDraft: _draft()),
      size: const Size(320, 700),
      textScale: 1.3,
    );

    final unit = find.byKey(const Key('admin-review-invoice-unit-0'));
    await tester.dragUntilVisible(
      unit,
      find.byKey(const Key('admin-review-invoice-scroll')),
      const Offset(0, -180),
    );
    await tester.enterText(unit, '75');
    await tester.pump();

    expect(find.text(r'$150.00'), findsWidgets);
    expect(find.text('Line total \$150.00'), findsOneWidget);
  });

  testWidgets('add-item sheet validates then appends a line item',
      (tester) async {
    await _pump(
      tester,
      AdminReviewInvoiceScreen(initialDraft: _draft()),
      size: const Size(320, 700),
      textScale: 1.3,
    );

    final add = find.text('Add item');
    await tester.dragUntilVisible(
      add,
      find.byKey(const Key('admin-review-invoice-scroll')),
      const Offset(0, -180),
    );
    await tester.tap(add);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();
    expect(find.text('Enter a description.'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('admin-review-add-item-description')),
      'Manual credit',
    );
    await tester.enterText(
      find.byKey(const Key('admin-review-add-item-unit')),
      '-10',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pumpAndSettle();

    expect(find.text('Item 2'), findsOneWidget);
    expect(find.text('Manual credit'), findsOneWidget);
  });

  testWidgets('edited unit amount must be a finite number', (tester) async {
    await _pump(
      tester,
      AdminReviewInvoiceScreen(initialDraft: _draft()),
    );

    final unit = find.byKey(const Key('admin-review-invoice-unit-0'));
    await tester.dragUntilVisible(
      unit,
      find.byKey(const Key('admin-review-invoice-scroll')),
      const Offset(0, -180),
    );
    await tester.enterText(unit, 'not a number');
    await tester.tap(
      find.byKey(const Key('admin-review-invoice-create')),
    );
    await tester.pump();

    expect(
      find.text('All line items must have a valid unit amount.'),
      findsOneWidget,
    );
  });

  testWidgets('negative unit amounts remain valid for discounts',
      (tester) async {
    final invoiceController = _FakeInvoiceController();
    await _pumpRoutedReview(
      tester,
      draft: _draft(unitAmount: -10, quantity: 2, overrideTotal: 0),
      invoiceController: invoiceController,
    );

    await tester.tap(
      find.byKey(const Key('admin-review-invoice-create')),
    );
    await tester.pumpAndSettle();

    expect(invoiceController.saveCalls, 1);
    expect(
      invoiceController.savedDraft!.lineItems.single['unitAmount'],
      -10,
    );
    expect(
      invoiceController.savedDraft!.lineItems.single['lineTotal'],
      -20,
    );
  });

  testWidgets('a negative final total is rejected before creation',
      (tester) async {
    final invoiceController = _FakeInvoiceController();
    await _pumpRoutedReview(
      tester,
      draft: _draft(unitAmount: -10, quantity: 2),
      invoiceController: invoiceController,
    );

    await tester.tap(
      find.byKey(const Key('admin-review-invoice-create')),
    );
    await tester.pump();

    expect(find.text('Invoice total cannot be negative.'), findsOneWidget);
    expect(invoiceController.saveCalls, 0);
  });

  testWidgets('save blocks duplicate submissions and preserves draft fields',
      (tester) async {
    final gate = Completer<void>();
    final invoiceController = _FakeInvoiceController()..saveGate = gate;
    final draft = _draft(overrideTotal: 90, notes: 'Internal');

    await _pumpRoutedReview(
      tester,
      draft: draft,
      invoiceController: invoiceController,
    );

    final toggle =
        find.byKey(const Key('admin-review-invoice-override-toggle'));
    await tester.dragUntilVisible(
      toggle,
      find.byKey(const Key('admin-review-invoice-scroll')),
      const Offset(0, -180),
    );
    await tester.tap(toggle);
    await tester.pump();

    await tester.tap(
      find.byKey(const Key('admin-review-invoice-create')),
    );
    await tester.tap(
      find.byKey(const Key('admin-review-invoice-create')),
    );
    await tester.pump();

    expect(invoiceController.saveCalls, 1);
    expect(invoiceController.savedDraft?.overrideTotal, isNull);
    expect(invoiceController.savedDraft?.adminNotes, 'Internal');
    expect(invoiceController.savedDraft?.studentIds, ['student-1']);
    expect(
      invoiceController.savedDraft?.createRequestId,
      draft.createRequestId,
    );

    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Open review'), findsOneWidget);
  });

  testWidgets('back navigation is blocked while invoice creation is pending',
      (tester) async {
    final gate = Completer<void>();
    final invoiceController = _FakeInvoiceController()..saveGate = gate;

    await _pumpRoutedReview(
      tester,
      draft: _draft(),
      invoiceController: invoiceController,
    );

    await tester.tap(
      find.byKey(const Key('admin-review-invoice-create')),
    );
    await tester.pump();

    final backButton = tester.widget<IconButton>(
      find.byKey(const Key('detail-back')),
    );
    expect(backButton.onPressed, isNull);
    expect(invoiceController.saveCalls, 1);

    await tester.binding.handlePopRoute();
    await tester.pump();

    expect(find.text('Review invoice'), findsOneWidget);
    expect(find.text('Open review'), findsNothing);

    gate.complete();
    await tester.pumpAndSettle();
    expect(find.text('Open review'), findsOneWidget);
  });

  testWidgets('ambiguous failure retries the same locked invoice request',
      (tester) async {
    final invoiceController = _FakeInvoiceController()
      ..saveError = StateError('response lost');
    final draft = _draft(notes: 'Do not change');

    await _pumpRoutedReview(
      tester,
      draft: draft,
      invoiceController: invoiceController,
    );

    await tester.tap(find.byKey(const Key('admin-review-invoice-create')));
    await tester.pumpAndSettle();

    expect(invoiceController.saveCalls, 1);
    expect(
      find.textContaining('outcome could not be confirmed'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<TextField>(
            find.byKey(const Key('admin-review-invoice-description-0')),
          )
          .enabled,
      isFalse,
    );

    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('admin-review-invoice-create')));
    await tester.pumpAndSettle();

    expect(invoiceController.saveCalls, 2);
    expect(
      invoiceController.savedDrafts
          .map((saved) => saved.createRequestId)
          .toList(),
      [draft.createRequestId, draft.createRequestId],
    );
    expect(
      invoiceController.savedDrafts[1].lineItems,
      invoiceController.savedDrafts[0].lineItems,
    );
    expect(find.text('Open review'), findsOneWidget);
  });
}

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  await _setViewport(tester, size);
  await tester.pumpWidget(
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(textScale),
        ),
        child: child!,
      ),
      home: child,
    ),
  );
  await tester.pump();
}

Future<void> _pumpRoutedReview(
  WidgetTester tester, {
  required InvoiceDraft draft,
  required _FakeInvoiceController invoiceController,
}) async {
  await _setViewport(tester, const Size(402, 874));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<InvoiceController>.value(
          value: invoiceController,
        ),
        ChangeNotifierProvider<ConnectivityController>.value(
          value: _FakeConnectivityController(),
        ),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        AdminReviewInvoiceScreen(initialDraft: draft),
                  ),
                ),
                child: const Text('Open review'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open review'));
  await tester.pumpAndSettle();
}

Future<void> _setViewport(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

InvoiceDraft _draft({
  double unitAmount = 60,
  int quantity = 2,
  double? overrideTotal,
  String? notes,
}) {
  final total = unitAmount * quantity;
  return InvoiceDraft(
    parentId: 'parent-1',
    parentName: 'Pat Parent',
    parentEmail: 'pat@example.com',
    lineItems: [
      {
        'studentName': 'Ella Parent',
        'description': 'Ella Parent (session 1)',
        'quantity': quantity,
        'unitAmount': unitAmount,
        'lineTotal': total,
      },
    ],
    weeks: 2,
    dueDate: DateTime(2026, 8, 20),
    computedTotal: total,
    studentIds: const ['student-1'],
    overrideTotal: overrideTotal,
    adminNotes: notes,
    createdByAdminId: 'admin-1',
  );
}
