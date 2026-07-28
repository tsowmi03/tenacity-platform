import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_billing_data.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_billing_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the outstanding headline, overdue and payments',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data())));
    await tester.pump();

    expect(find.text('TOTAL OUTSTANDING'), findsOneWidget);
    expect(find.text(r'$4,860'), findsOneWidget);
    expect(find.text('23 unpaid invoices · 9 overdue'), findsOneWidget);

    expect(find.text('OVERDUE'), findsOneWidget);
    expect(find.text('Chen family — INV-0219'), findsOneWidget);
    expect(
      find.text(r'$320.00 · 12 days overdue · next reminder in 2 days'),
      findsOneWidget,
    );

    expect(find.text('RECENT PAYMENTS'), findsOneWidget);
    expect(find.text('PAID'), findsOneWidget);
  });

  testWidgets('ships nothing the data cannot back', (tester) async {
    // Reminders are automatic and record nothing, so no send button and no
    // "reminded ×N"; the payment record stores no card, so no "Visa ····4242".
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data())));
    await tester.pump();

    expect(find.textContaining('Send'), findsNothing);
    expect(find.text('Remind'), findsNothing);
    expect(find.text('Follow up'), findsNothing);
    expect(find.textContaining('reminded ×'), findsNothing);
    expect(find.textContaining('Visa'), findsNothing);
    expect(find.textContaining('····'), findsNothing);
  });

  testWidgets('the filter chips report the chosen filter', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final chosen = <AdminBillingFilter>[];
    await tester.pumpWidget(
      _host(_view(data: _data(), onFilterChanged: chosen.add)),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('admin-billing-filter-paid')));
    await tester.pump();

    expect(chosen, [AdminBillingFilter.paid]);
  });

  testWidgets('New invoice and View all both route out', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    var created = 0;
    var viewedAll = 0;
    await tester.pumpWidget(
      _host(
        _view(
          data: _data(),
          onNewInvoice: () => created++,
          onViewAll: () => viewedAll++,
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('admin-billing-new')));
    await tester.pump();
    await tester.dragUntilVisible(
      find.byKey(const Key('admin-billing-view-all')),
      find.byKey(const Key('admin-billing-scroll')),
      const Offset(0, -120),
    );
    await tester.tap(find.byKey(const Key('admin-billing-view-all')));
    await tester.pump();

    expect(created, 1);
    expect(viewedAll, 1);
  });

  testWidgets('an empty filter explains itself', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(
        _view(
          data: _data(
            invoices: const [],
            payments: const [],
            filter: AdminBillingFilter.overdue,
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('admin-billing-empty')), findsOneWidget);
    expect(find.text('No invoice is overdue.'), findsOneWidget);
  });

  testWidgets('an error offers a retry and hides the list', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(_view(data: _data(error: 'Check your connection.'))),
    );
    await tester.pump();

    expect(find.byKey(const Key('admin-billing-error')), findsOneWidget);
    expect(find.text('RECENT PAYMENTS'), findsNothing);
  });

  for (final size in const [Size(320, 720), Size(430, 932)]) {
    testWidgets('renders at ${size.width.toInt()} wide', (tester) async {
      await _setViewport(tester, size);

      await tester.pumpWidget(_host(_view(data: _data())));
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('TOTAL OUTSTANDING'), findsOneWidget);
    });
  }

  testWidgets('renders at text scale 1.3 on the narrowest width',
      (tester) async {
    await _setViewport(tester, const Size(320, 720));

    await tester.pumpWidget(_host(_view(data: _data()), textScale: 1.3));
    await tester.pump();

    expect(tester.takeException(), isNull);
  });
}

Future<void> _setViewport(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Widget _host(Widget child, {double textScale = 1.0}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    home: MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
      child: child,
    ),
  );
}

Widget _view({
  required AdminBillingViewData data,
  ValueChanged<AdminBillingFilter>? onFilterChanged,
  VoidCallback? onNewInvoice,
  VoidCallback? onViewAll,
}) {
  return AdminBillingView(
    data: data,
    onRefresh: () async {},
    onFilterChanged: onFilterChanged ?? (_) {},
    onInvoiceTapped: (_) {},
    onNewInvoice: onNewInvoice ?? () {},
    onViewAll: onViewAll ?? () {},
    onRetry: () {},
  );
}

AdminBillingViewData _data({
  List<AdminBillingInvoice>? invoices,
  List<AdminBillingPayment>? payments,
  AdminBillingFilter filter = AdminBillingFilter.all,
  String? error,
}) {
  return AdminBillingViewData(
    outstandingTotal: 4860,
    outstandingLabel: r'$4,860',
    summary: '23 unpaid invoices · 9 overdue',
    unpaidCount: 23,
    overdueCount: 9,
    filter: filter,
    invoices: invoices ??
        [
          AdminBillingInvoice(
            id: 'i1',
            reference: 'INV-0219',
            familyLabel: 'Chen family',
            amountDue: 320,
            dueDate: DateTime(2026, 7, 16),
            daysOverdue: 12,
            dueLabel: '12 days overdue',
            nextReminderLabel: 'next reminder in 2 days',
          ),
        ],
    payments: payments ??
        const [
          AdminBillingPayment(
            id: 'p1',
            reference: 'INV-0224',
            familyLabel: 'Nguyen family',
            amount: 240,
            paidLabel: 'Paid today',
          ),
        ],
    errorMessage: error,
  );
}
