import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_invoice_console_data.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_invoice_console_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the full console controls and invoice rows',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));
    await tester.pumpWidget(_host(_view(data: _data())));
    await tester.pump();

    expect(find.text('All invoices'), findsOneWidget);
    expect(find.text(r'2 invoices · $320.00 outstanding'), findsOneWidget);
    expect(find.text('Search parent, student or invoice'), findsOneWidget);
    expect(find.text('All'), findsOneWidget);
    expect(find.text('Unpaid'), findsOneWidget);
    expect(find.text('Paid'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('INV-100'), findsOneWidget);
    expect(find.text('Pat Parent'), findsNWidgets(2));
    expect(find.text('Ella Parent'), findsNWidgets(2));
  });

  testWidgets('reports search, filter, sort, create and row actions',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));
    String? search;
    AdminInvoiceFilter? filter;
    AdminInvoiceSort? sort;
    var createCalls = 0;
    var sortDirectionCalls = 0;
    var refreshCalls = 0;
    Invoice? tapped;

    await tester.pumpWidget(
      _host(
        _view(
          data: _data(),
          onSearchChanged: (value) => search = value,
          onFilterChanged: (value) => filter = value,
          onSortChanged: (value) => sort = value,
          onSortDirectionChanged: () => sortDirectionCalls++,
          onRefresh: () async => refreshCalls++,
          onCreateInvoice: () => createCalls++,
          onInvoiceTapped: (invoice) => tapped = invoice,
        ),
      ),
    );
    await tester.pump();

    await tester.enterText(find.byType(TextField).first, 'Ella');
    await tester.tap(find.text('Paid'));
    await tester.tap(find.byKey(const Key('admin-invoice-create')));
    await tester.tap(find.byKey(const Key('admin-invoice-sort-direction')));
    await tester.tap(find.byKey(const Key('admin-invoice-refresh')));
    await tester.tap(find.byKey(const Key('admin-invoice-sort')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Amount').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('admin-invoice-row-unpaid')));

    expect(search, 'Ella');
    expect(filter, AdminInvoiceFilter.paid);
    expect(sort, AdminInvoiceSort.amount);
    expect(createCalls, 1);
    expect(sortDirectionCalls, 1);
    expect(refreshCalls, 1);
    expect(tapped?.id, 'unpaid');
  });

  testWidgets('selection mode exposes bulk actions and checkboxes',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));
    final toggled = <String>[];
    var paidCalls = 0;
    var deleteCalls = 0;

    await tester.pumpWidget(
      _host(
        _view(
          data: _data(),
          isSelectionMode: true,
          selectedInvoiceIds: const {'unpaid'},
          onToggleSelection: toggled.add,
          onMarkSelectedPaid: () => paidCalls++,
          onDeleteSelected: () => deleteCalls++,
        ),
      ),
    );
    await tester.pump();

    expect(find.text('1 selected'), findsOneWidget);
    expect(
      find.byKey(const Key('admin-invoice-selection-actions')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('admin-invoice-checkbox-unpaid')),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('admin-invoice-bulk-paid')));
    await tester.tap(find.byKey(const Key('admin-invoice-bulk-delete')));
    await tester.tap(find.byKey(const Key('admin-invoice-checkbox-paid')));
    await tester.pump();

    expect(paidCalls, 1);
    expect(deleteCalls, 1);
    expect(toggled, ['paid']);
  });

  testWidgets('detail sheet carries data and every action', (tester) async {
    await _setViewport(tester, const Size(402, 874));
    final invoice = _invoice(
      id: 'detail',
      number: '375',
      status: InvoiceStatus.overdue,
      notes: 'Keep this note internal.',
    );
    var paidCalls = 0;
    var pdfCalls = 0;
    var deleteCalls = 0;

    await tester.pumpWidget(
      _host(
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => showAdminInvoiceDetailSheet(
                  context: context,
                  invoice: invoice,
                  onMarkPaid: (_) async {
                    paidCalls++;
                    return true;
                  },
                  onOpenPdf: (_) async => pdfCalls++,
                  onDelete: (_) async {
                    deleteCalls++;
                    return true;
                  },
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(find.text('Invoice INV-375'), findsOneWidget);
    expect(find.text('Keep this note internal.'), findsOneWidget);
    expect(find.text('Tutoring'), findsOneWidget);
    expect(find.text('OVERDUE'), findsOneWidget);

    await tester.tap(find.byKey(const Key('admin-invoice-detail-pdf')));
    await tester.pump();
    expect(pdfCalls, 1);

    await tester.tap(find.byKey(const Key('admin-invoice-detail-paid')));
    await tester.pumpAndSettle();
    expect(paidCalls, 1);
    expect(deleteCalls, 0);
    expect(find.text('Invoice INV-375'), findsNothing);
  });

  testWidgets('paid invoice detail has an explicit close action',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));
    final invoice = _invoice(
      id: 'paid-detail',
      number: '376',
      status: InvoiceStatus.paid,
    );

    await tester.pumpWidget(
      _host(
        Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => showAdminInvoiceDetailSheet(
                  context: context,
                  invoice: invoice,
                  onMarkPaid: (_) async => true,
                  onOpenPdf: (_) async {},
                  onDelete: (_) async => true,
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Invoice INV-376'), findsOneWidget);

    await tester.tap(find.byKey(const Key('admin-invoice-detail-close')));
    await tester.pumpAndSettle();

    expect(find.text('Invoice INV-376'), findsNothing);
    expect(find.text('Open'), findsOneWidget);
  });

  for (final size in const [Size(320, 700), Size(430, 932)]) {
    testWidgets('console fits ${size.width.toInt()}px at large text',
        (tester) async {
      await _setViewport(tester, size);
      await tester.pumpWidget(
        _host(_view(data: _data()), textScale: 1.3),
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('All invoices'), findsOneWidget);
    });
  }
}

Future<void> _setViewport(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Widget _host(Widget child, {double textScale = 1}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        textScaler: TextScaler.linear(textScale),
      ),
      child: child!,
    ),
    home: child,
  );
}

Widget _view({
  required AdminInvoiceConsoleData data,
  bool isSelectionMode = false,
  Set<String> selectedInvoiceIds = const {},
  ValueChanged<String>? onSearchChanged,
  ValueChanged<AdminInvoiceFilter>? onFilterChanged,
  ValueChanged<AdminInvoiceSort>? onSortChanged,
  VoidCallback? onSortDirectionChanged,
  Future<void> Function()? onRefresh,
  VoidCallback? onCreateInvoice,
  ValueChanged<String>? onToggleSelection,
  ValueChanged<Invoice>? onInvoiceTapped,
  VoidCallback? onMarkSelectedPaid,
  VoidCallback? onDeleteSelected,
}) {
  return AdminInvoiceConsoleView(
    data: data,
    isLoading: false,
    isBusy: false,
    errorMessage: null,
    selectedInvoiceIds: selectedInvoiceIds,
    isSelectionMode: isSelectionMode,
    onBack: () {},
    onRefresh: onRefresh ?? () async {},
    onRetry: () {},
    onSearchChanged: onSearchChanged ?? (_) {},
    onFilterChanged: onFilterChanged ?? (_) {},
    onSortChanged: onSortChanged ?? (_) {},
    onSortDirectionChanged: onSortDirectionChanged ?? () {},
    onCreateInvoice: onCreateInvoice ?? () {},
    onEnterSelectionMode: () {},
    onExitSelectionMode: () {},
    onToggleSelection: onToggleSelection ?? (_) {},
    onInvoiceTapped: onInvoiceTapped ?? (_) {},
    onMarkSelectedPaid: onMarkSelectedPaid ?? () {},
    onDeleteSelected: onDeleteSelected ?? () {},
  );
}

AdminInvoiceConsoleData _data() {
  return buildAdminInvoiceConsoleData(
    invoices: [
      _invoice(id: 'unpaid', number: 'INV-100', amount: 320),
      _invoice(
        id: 'paid',
        number: 'INV-099',
        amount: 180,
        status: InvoiceStatus.paid,
      ),
    ],
  );
}

Invoice _invoice({
  required String id,
  required String number,
  double amount = 180,
  InvoiceStatus status = InvoiceStatus.unpaid,
  String? notes,
}) {
  return Invoice(
    id: id,
    parentId: 'parent-1',
    parentName: 'Pat Parent',
    parentEmail: 'pat@example.com',
    lineItems: [
      {
        'studentName': 'Ella Parent',
        'description': 'Tutoring',
        'quantity': 2,
        'unitAmount': amount / 2,
        'lineTotal': amount,
      },
    ],
    weeks: 2,
    amountDue: amount,
    status: status,
    dueDate: DateTime(2026, 8, 20),
    createdAt: DateTime(2026, 7, 20),
    invoiceNumber: number,
    adminNotes: notes,
  );
}
