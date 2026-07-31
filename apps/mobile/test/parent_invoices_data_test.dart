import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/payment_model.dart';
import 'package:tenacity/src/ui/invoices/parent_invoices_data.dart';

void main() {
  final now = DateTime(2026, 7, 26, 10);

  Invoice invoice({
    required String id,
    String? number,
    double amount = 180,
    DateTime? due,
    DateTime? paidAt,
    InvoiceStatus status = InvoiceStatus.unpaid,
    int weeks = 2,
    List<Map<String, dynamic>> lineItems = const [],
    List<Payment> payments = const [],
  }) {
    return Invoice(
      id: id,
      parentId: 'p1',
      parentName: 'Sarah Nguyen',
      parentEmail: 'sarah@example.com',
      lineItems: lineItems,
      weeks: weeks,
      amountDue: amount,
      status: status,
      dueDate: due ?? DateTime(2026, 7, 31),
      createdAt: DateTime(2026, 7, 1),
      studentIds: const [],
      payments: payments,
      invoiceNumber: number,
      paidAt: paidAt,
    );
  }

  Map<String, dynamic> line(String studentName, int quantity) => {
        'studentName': studentName,
        'quantity': quantity,
        'unitAmount': 70,
        'lineTotal': 70 * quantity,
      };

  group('outstanding summary', () {
    test('totals only what is unpaid', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(id: 'a', amount: 180),
          invoice(id: 'b', amount: 240),
          invoice(
            id: 'settled',
            amount: 500,
            status: InvoiceStatus.paid,
            paidAt: DateTime(2026, 6, 20),
          ),
        ],
        now: now,
      );

      expect(data.outstandingAmount, 420);
      expect(data.outstandingLabel, r'$420.00');
      expect(data.payAllLabel, r'Pay all — $420.00');
    });

    test('describes when the soonest invoice falls due', () {
      String summaryFor(DateTime due) => buildParentInvoicesViewData(
            invoices: [invoice(id: 'a', due: due)],
            now: now,
          ).outstandingSummary;

      expect(summaryFor(DateTime(2026, 7, 26)), '1 unpaid invoice · due today');
      expect(
        summaryFor(DateTime(2026, 7, 27)),
        '1 unpaid invoice · due tomorrow',
      );
      expect(
        summaryFor(DateTime(2026, 7, 31)),
        '1 unpaid invoice · due Friday',
      );
      expect(
        summaryFor(DateTime(2026, 8, 20)),
        '1 unpaid invoice · due Thu 20 Aug',
      );
      expect(
        summaryFor(DateTime(2026, 7, 20)),
        '1 unpaid invoice · overdue since 20 Jul',
      );
    });

    test('pluralises the invoice count', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(id: 'a', due: DateTime(2026, 7, 31)),
          invoice(id: 'b', due: DateTime(2026, 8, 7)),
        ],
        now: now,
      );

      expect(data.outstandingSummary, startsWith('2 unpaid invoices'));
    });

    test('a settled account says so', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(
            id: 'a',
            status: InvoiceStatus.paid,
            paidAt: DateTime(2026, 6, 20),
          ),
        ],
        now: now,
      );

      expect(data.outstandingAmount, 0);
      expect(data.outstandingLabel, r'$0.00');
      expect(data.outstandingSummary, "You're all paid up");
      expect(data.hasOutstanding, isFalse);
      expect(data.showPayAll, isFalse);
    });
  });

  group('pay all', () {
    test('is offered only when it settles more than one invoice', () {
      // With a single invoice it would duplicate that invoice's own Pay now.
      final one = buildParentInvoicesViewData(
        invoices: [invoice(id: 'a')],
        now: now,
      );
      expect(one.showPayAll, isFalse);

      final two = buildParentInvoicesViewData(
        invoices: [invoice(id: 'a'), invoice(id: 'b')],
        now: now,
      );
      expect(two.showPayAll, isTrue);
    });
  });

  group('unpaid rows', () {
    test('names the children and counts the lessons', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(
            id: 'a',
            number: 'INV-0231',
            lineItems: [
              line('Ella Nguyen', 2),
              line('Max Nguyen', 2),
            ],
          ),
        ],
        now: now,
      );

      expect(data.unpaid.single.title, 'Ella & Max — 4 lessons');
    });

    test('falls back to the lesson count with no student names', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(id: 'a', lineItems: [
            {'quantity': 1, 'lineTotal': 70},
          ]),
        ],
        now: now,
      );

      expect(data.unpaid.single.title, '1 lesson');
    });

    test('carries the reference, period and due date in the subtitle', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(id: 'a', number: 'INV-0231', due: DateTime(2026, 7, 31)),
        ],
        now: now,
      );

      expect(
        data.unpaid.single.subtitle,
        'INV-0231 · 2 weeks · due Fri 31 Jul',
      );
    });

    test('falls back to the document id without an invoice number', () {
      final data = buildParentInvoicesViewData(
        invoices: [invoice(id: 'raw-doc-id')],
        now: now,
      );

      expect(data.unpaid.single.reference, 'raw-doc-id');
    });

    test('marks an invoice overdue by date, not only by status', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(
            id: 'a',
            due: DateTime(2026, 7, 20),
            status: InvoiceStatus.unpaid,
          ),
        ],
        now: now,
      );

      expect(data.unpaid.single.isOverdue, isTrue);
      expect(data.unpaid.single.statusLabel, 'OVERDUE');
    });

    test('orders by soonest due first', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(id: 'later', due: DateTime(2026, 8, 20)),
          invoice(id: 'sooner', due: DateTime(2026, 7, 28)),
        ],
        now: now,
      );

      expect(data.unpaid.map((r) => r.invoiceId), ['sooner', 'later']);
    });
  });

  group('history', () {
    test('shows the most recently paid first, limited', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          for (var i = 1; i <= 5; i++)
            invoice(
              id: 'inv$i',
              number: 'INV-000$i',
              status: InvoiceStatus.paid,
              paidAt: DateTime(2026, i, 10),
            ),
        ],
        now: now,
      );

      expect(data.history, hasLength(3));
      expect(data.history.first.reference, 'INV-0005');
      expect(data.history.last.reference, 'INV-0003');
    });

    test('reports when more history exists', () {
      final many = [
        for (var i = 1; i <= 5; i++)
          invoice(
            id: 'inv$i',
            status: InvoiceStatus.paid,
            paidAt: DateTime(2026, i, 10),
          ),
      ];

      expect(hasMoreHistory(invoices: many), isTrue);
      expect(hasMoreHistory(invoices: many.take(3).toList()), isFalse);
    });

    test('says when an invoice was paid', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(
            id: 'a',
            number: 'INV-0224',
            status: InvoiceStatus.paid,
            paidAt: DateTime(2026, 6, 20),
          ),
        ],
        now: now,
      );

      // The design also shows the card used, but the payment record stores no
      // brand or last four digits, so it is omitted rather than invented.
      expect(data.history.single.subtitle, 'Paid 20 Jun');
      expect(data.history.single.statusLabel, 'PAID');
    });

    test('falls back to the payment record when paidAt is missing', () {
      final data = buildParentInvoicesViewData(
        invoices: [
          invoice(
            id: 'a',
            status: InvoiceStatus.paid,
            payments: [
              Payment(
                id: 'pay1',
                amountPaid: 180,
                paidAt: DateTime(2026, 6, 18),
                method: PaymentMethod.stripe,
              ),
            ],
          ),
        ],
        now: now,
      );

      expect(data.history.single.subtitle, 'Paid 18 Jun');
    });

    test('degrades gracefully when nothing records the payment date', () {
      final data = buildParentInvoicesViewData(
        invoices: [invoice(id: 'a', status: InvoiceStatus.paid)],
        now: now,
      );

      expect(data.history.single.subtitle, 'Paid');
    });
  });

  group('empty', () {
    test('an account with no invoices at all', () {
      final data = buildParentInvoicesViewData(invoices: const [], now: now);

      expect(data.isEmpty, isTrue);
      expect(data.unpaid, isEmpty);
      expect(data.history, isEmpty);
      expect(data.outstandingLabel, r'$0.00');
    });
  });
}
