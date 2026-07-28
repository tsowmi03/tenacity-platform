import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_billing_data.dart';

final _today = DateTime(2026, 7, 28);

void main() {
  group('next reminder', _nextReminder);
  group('totals', _totals);
  group('ordering', _ordering);
  group('filters', _filters);
  group('labels', _labels);
  group('exclusions', _exclusions);
}

/// The scheduler sends seven days before the due date, on the due date, and
/// every seventh day after it. These pin this screen to that rule; if
/// `invoiceReminderScheduler` changes, these fail first.
void _nextReminder() {
  DateTime? next(int daysUntilDue) => nextReminderDate(
        due: _today.add(Duration(days: daysUntilDue)),
        today: _today,
      );

  test('well before the due date, the seven-day warning is next', () {
    expect(next(30), DateTime(2026, 8, 20)); // due 27 Aug, warning 20 Aug
    expect(next(8), DateTime(2026, 7, 29));
  });

  test('exactly seven days out, the warning is today', () {
    expect(next(7), DateTime(2026, 8, 4));
  });

  test('inside the last week, the due date itself is next', () {
    expect(next(3), DateTime(2026, 7, 31));
    expect(next(1), DateTime(2026, 7, 29));
  });

  test('on the due date, it is today', () {
    expect(next(0), _today);
  });

  test('once overdue, it is the next seventh day after the due date', () {
    // Due 3 days ago: the first overdue reminder lands 7 days after due.
    expect(next(-3), _today.add(const Duration(days: 4)));
    // Due 8 days ago: the 7-day one has passed, the 14-day one is next.
    expect(next(-8), _today.add(const Duration(days: 6)));
  });

  test('exactly a multiple of seven days overdue means today', () {
    expect(next(-7), _today);
    expect(next(-14), _today);
  });
}

void _totals() {
  test('outstanding counts unpaid only', () {
    final data = _build([
      _invoice(id: 'a', amount: 320, dueIn: -12),
      _invoice(id: 'b', amount: 240, dueIn: -6),
      _invoice(id: 'c', amount: 180, dueIn: 5),
      _invoice(id: 'd', amount: 999, dueIn: -30, status: InvoiceStatus.paid),
    ]);

    expect(data.outstandingTotal, 740);
    expect(data.unpaidCount, 3);
    expect(data.overdueCount, 2);
    expect(data.summary, '3 unpaid invoices · 2 overdue');
  });

  test('with nothing overdue the summary says so', () {
    final data = _build([_invoice(id: 'a', amount: 100, dueIn: 5)]);

    expect(data.summary, '1 unpaid invoice');
  });

  test('an invoice due today is not overdue', () {
    final data = _build([_invoice(id: 'a', amount: 100, dueIn: 0)]);

    expect(data.overdueCount, 0);
    expect(data.invoices, isEmpty); // the All filter lists overdue only
  });
}

void _ordering() {
  test('the worst overdue comes first', () {
    final data = _build([
      _invoice(id: 'mild', amount: 100, dueIn: -2),
      _invoice(id: 'worst', amount: 100, dueIn: -30),
      _invoice(id: 'middle', amount: 100, dueIn: -9),
    ]);

    expect(data.invoices.map((i) => i.id), ['worst', 'middle', 'mild']);
  });

  test('recent payments are newest first and capped', () {
    final data = _build(
      [
        for (var i = 1; i <= 8; i++)
          _invoice(
            id: 'p$i',
            amount: 100,
            dueIn: -i,
            status: InvoiceStatus.paid,
            paidDaysAgo: i,
          ),
      ],
      limit: 3,
    );

    expect(data.payments.map((p) => p.id), ['p1', 'p2', 'p3']);
  });
}

void _filters() {
  final invoices = [
    _invoice(id: 'overdue', amount: 100, dueIn: -5),
    _invoice(id: 'upcoming', amount: 100, dueIn: 5),
    _invoice(
      id: 'settled',
      amount: 100,
      dueIn: -20,
      status: InvoiceStatus.paid,
      paidDaysAgo: 1,
    ),
  ];

  test('all shows overdue plus recent payments', () {
    final data = _build(invoices);
    expect(data.invoices.map((i) => i.id), ['overdue']);
    expect(data.payments.map((p) => p.id), ['settled']);
  });

  test('unpaid shows what is not yet overdue', () {
    final data = _build(invoices, filter: AdminBillingFilter.unpaid);
    expect(data.invoices.map((i) => i.id), ['upcoming']);
    expect(data.payments, isEmpty);
  });

  test('overdue hides payments', () {
    final data = _build(invoices, filter: AdminBillingFilter.overdue);
    expect(data.invoices.map((i) => i.id), ['overdue']);
    expect(data.payments, isEmpty);
  });

  test('paid shows payments only', () {
    final data = _build(invoices, filter: AdminBillingFilter.paid);
    expect(data.invoices, isEmpty);
    expect(data.payments.map((p) => p.id), ['settled']);
  });
}

void _labels() {
  test('a family label is built from the surname', () {
    final data = _build([
      _invoice(id: 'a', amount: 320, dueIn: -12, parentName: 'Wei Chen'),
    ]);

    expect(data.invoices.single.familyLabel, 'Chen family');
  });

  test('a one-word name is used as-is rather than mangled', () {
    final data = _build([
      _invoice(id: 'a', amount: 100, dueIn: -1, parentName: 'Cher'),
    ]);

    expect(data.invoices.single.familyLabel, 'Cher');
  });

  test('the document id stands in for a missing invoice number', () {
    final data = _build([
      _invoice(id: 'abc123', amount: 100, dueIn: -1, number: null),
    ]);

    expect(data.invoices.single.reference, 'abc123');
  });

  test('the subtitle carries amount, lateness and the next reminder', () {
    final data = _build([
      _invoice(id: 'a', amount: 320, dueIn: -3, parentName: 'Wei Chen'),
    ]);

    // Due 3 days ago, so the seven-day reminder lands in 4 days.
    expect(
      data.invoices.single.subtitle,
      '\$320.00 · 3 days overdue · next reminder in 4 days',
    );
  });

  test('one day overdue reads in the singular', () {
    final data = _build([_invoice(id: 'a', amount: 100, dueIn: -1)]);

    expect(data.invoices.single.dueLabel, '1 day overdue');
  });
}

void _exclusions() {
  test('nothing claims a reminder was sent, or names a card', () {
    // Nothing records what reminders went out, and the payment record has no
    // card brand or last four digits (P00, deferred). Neither is invented.
    final data = _build([
      _invoice(id: 'a', amount: 320, dueIn: -12),
      _invoice(
        id: 'b',
        amount: 240,
        dueIn: -2,
        status: InvoiceStatus.paid,
        paidDaysAgo: 0,
      ),
    ]);

    expect(data.invoices.single.subtitle, isNot(contains('reminded')));
    expect(data.payments.single.paidLabel, 'Paid today');
    expect(data.payments.single.paidLabel, isNot(contains('Visa')));
    expect(data.payments.single.paidLabel, isNot(contains('····')));
  });
}

AdminBillingViewData _build(
  List<Invoice> invoices, {
  AdminBillingFilter filter = AdminBillingFilter.all,
  int limit = 5,
}) {
  return buildAdminBillingViewData(
    invoices: invoices,
    now: _today,
    filter: filter,
    recentPaymentLimit: limit,
  );
}

Invoice _invoice({
  required String id,
  required double amount,
  required int dueIn,
  InvoiceStatus status = InvoiceStatus.unpaid,
  String parentName = 'Wei Chen',
  String? number = 'INV-0219',
  int paidDaysAgo = 0,
}) {
  return Invoice(
    id: id,
    parentId: 'p-$id',
    parentName: parentName,
    parentEmail: '',
    lineItems: const [],
    weeks: 1,
    amountDue: amount,
    status: status,
    dueDate: _today.add(Duration(days: dueIn)),
    createdAt: _today.subtract(const Duration(days: 30)),
    invoiceNumber: number,
    paidAt: status == InvoiceStatus.paid
        ? _today.subtract(Duration(days: paidDaysAgo))
        : null,
  );
}
