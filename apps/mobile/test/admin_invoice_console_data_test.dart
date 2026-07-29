import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_invoice_console_data.dart';

void main() {
  group('summary', () {
    test('counts stored statuses and outstanding money', () {
      final data = buildAdminInvoiceConsoleData(
        invoices: [
          _invoice(
            id: 'overdue',
            status: InvoiceStatus.overdue,
            amount: 220,
          ),
          _invoice(id: 'unpaid', amount: 180),
          _invoice(id: 'paid', status: InvoiceStatus.paid, amount: 999),
        ],
      );

      expect(data.totalCount, 3);
      expect(data.overdueCount, 1);
      expect(data.unpaidCount, 1);
      expect(data.paidCount, 1);
      expect(data.outstandingTotal, 400);
      expect(data.outstandingLabel, r'$400.00');
      expect(data.summary, r'3 invoices · $400.00 outstanding');
    });
  });

  group('filter and search', () {
    final invoices = [
      _invoice(
        id: 'chen',
        parentName: 'Wei Chen',
        number: '375',
        studentName: 'Alex Chen',
        description: 'English tutoring',
      ),
      _invoice(
        id: 'nguyen',
        parentName: 'Mina Nguyen',
        number: 'INV-900',
        studentName: 'Sam Nguyen',
        description: 'Mathematics tutoring',
        status: InvoiceStatus.paid,
      ),
      _invoice(
        id: 'jones',
        parentName: 'Pat Jones',
        status: InvoiceStatus.overdue,
      ),
    ];

    test('filters by each stored status', () {
      expect(
        buildAdminInvoiceConsoleData(
          invoices: invoices,
          filter: AdminInvoiceFilter.unpaid,
        ).rows.map((row) => row.id),
        ['chen'],
      );
      expect(
        buildAdminInvoiceConsoleData(
          invoices: invoices,
          filter: AdminInvoiceFilter.paid,
        ).rows.map((row) => row.id),
        ['nguyen'],
      );
      expect(
        buildAdminInvoiceConsoleData(
          invoices: invoices,
          filter: AdminInvoiceFilter.overdue,
        ).rows.map((row) => row.id),
        ['jones'],
      );
    });

    test('searches parent, student, description and reference', () {
      for (final query in ['wei', 'alex', 'english', '375', 'INV-375']) {
        final data = buildAdminInvoiceConsoleData(
          invoices: invoices,
          searchQuery: query,
        );
        expect(data.rows.map((row) => row.id), ['chen'], reason: query);
      }
    });

    test('search is trimmed and case insensitive', () {
      final data = buildAdminInvoiceConsoleData(
        invoices: invoices,
        searchQuery: '  NGUYEN ',
      );
      expect(data.rows.map((row) => row.id), ['nguyen']);
    });
  });

  group('sorting', () {
    test('All keeps overdue, unpaid and paid groups', () {
      final data = buildAdminInvoiceConsoleData(
        invoices: [
          _invoice(
            id: 'paid',
            status: InvoiceStatus.paid,
            parentName: 'A Parent',
          ),
          _invoice(
            id: 'unpaid',
            parentName: 'B Parent',
          ),
          _invoice(
            id: 'overdue',
            status: InvoiceStatus.overdue,
            parentName: 'Z Parent',
          ),
        ],
        sort: AdminInvoiceSort.parentName,
      );

      expect(data.rows.map((row) => row.id), ['overdue', 'unpaid', 'paid']);
    });

    test('sort direction applies within a status group', () {
      final invoices = [
        _invoice(id: 'low', amount: 100),
        _invoice(id: 'high', amount: 300),
      ];

      expect(
        buildAdminInvoiceConsoleData(
          invoices: invoices,
          sort: AdminInvoiceSort.amount,
        ).rows.map((row) => row.id),
        ['low', 'high'],
      );
      expect(
        buildAdminInvoiceConsoleData(
          invoices: invoices,
          sort: AdminInvoiceSort.amount,
          sortAscending: false,
        ).rows.map((row) => row.id),
        ['high', 'low'],
      );
    });
  });

  test('numeric references receive the established invoice prefix', () {
    final data = buildAdminInvoiceConsoleData(
      invoices: [_invoice(id: 'a', number: '375')],
    );
    expect(data.rows.single.reference, 'INV-375');
  });

  test('student labels de-duplicate repeated session line items', () {
    final invoice = _invoice(id: 'a', studentName: 'Alex Chen');
    final duplicate = Invoice(
      id: invoice.id,
      parentId: invoice.parentId,
      parentName: invoice.parentName,
      parentEmail: invoice.parentEmail,
      lineItems: [...invoice.lineItems, ...invoice.lineItems],
      weeks: invoice.weeks,
      amountDue: invoice.amountDue,
      status: invoice.status,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      invoiceNumber: invoice.invoiceNumber,
    );

    final data = buildAdminInvoiceConsoleData(invoices: [duplicate]);
    expect(data.rows.single.studentLabel, 'Alex Chen');
  });
}

Invoice _invoice({
  required String id,
  InvoiceStatus status = InvoiceStatus.unpaid,
  double amount = 180,
  String parentName = 'Pat Parent',
  String? number = 'INV-100',
  String studentName = 'Ella Parent',
  String description = 'Tutoring',
}) {
  return Invoice(
    id: id,
    parentId: 'parent-$id',
    parentName: parentName,
    parentEmail: '$id@example.com',
    lineItems: [
      {
        'studentName': studentName,
        'description': description,
        'quantity': 2,
        'unitAmount': amount / 2,
        'lineTotal': amount,
      },
    ],
    weeks: 2,
    amountDue: amount,
    status: status,
    dueDate: DateTime(2026, 8, id.hashCode.abs() % 20 + 1),
    createdAt: DateTime(2026, 7, id.hashCode.abs() % 20 + 1),
    invoiceNumber: number,
  );
}
