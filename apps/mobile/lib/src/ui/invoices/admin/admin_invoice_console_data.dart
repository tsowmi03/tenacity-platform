import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/invoice_model.dart';

enum AdminInvoiceFilter { all, unpaid, paid, overdue }

enum AdminInvoiceSort { dueDate, amount, createdDate, parentName }

@immutable
class AdminInvoiceConsoleRow {
  const AdminInvoiceConsoleRow({
    required this.invoice,
    required this.reference,
    required this.amountLabel,
    required this.dueLabel,
    required this.createdLabel,
    required this.studentLabel,
  });

  final Invoice invoice;
  final String reference;
  final String amountLabel;
  final String dueLabel;
  final String createdLabel;
  final String studentLabel;

  String get id => invoice.id;
  String get parentName => invoice.parentName;
  String get parentEmail => invoice.parentEmail;
  InvoiceStatus get status => invoice.status;
}

@immutable
class AdminInvoiceConsoleData {
  const AdminInvoiceConsoleData({
    required this.rows,
    required this.totalCount,
    required this.unpaidCount,
    required this.overdueCount,
    required this.paidCount,
    required this.outstandingTotal,
    required this.outstandingLabel,
    required this.filter,
    required this.sort,
    required this.sortAscending,
    required this.searchQuery,
  });

  final List<AdminInvoiceConsoleRow> rows;
  final int totalCount;
  final int unpaidCount;
  final int overdueCount;
  final int paidCount;
  final double outstandingTotal;
  final String outstandingLabel;
  final AdminInvoiceFilter filter;
  final AdminInvoiceSort sort;
  final bool sortAscending;
  final String searchQuery;

  int get resultCount => rows.length;

  String get summary {
    final noun = totalCount == 1 ? 'invoice' : 'invoices';
    return '$totalCount $noun · $outstandingLabel outstanding';
  }

  String get resultLabel {
    final noun = resultCount == 1 ? 'invoice' : 'invoices';
    return '$resultCount $noun';
  }
}

AdminInvoiceConsoleData buildAdminInvoiceConsoleData({
  required List<Invoice> invoices,
  AdminInvoiceFilter filter = AdminInvoiceFilter.all,
  AdminInvoiceSort sort = AdminInvoiceSort.dueDate,
  bool sortAscending = true,
  String searchQuery = '',
}) {
  final query = searchQuery.trim().toLowerCase();
  final matching = invoices.where((invoice) {
    final matchesFilter = switch (filter) {
      AdminInvoiceFilter.all => true,
      AdminInvoiceFilter.unpaid => invoice.status == InvoiceStatus.unpaid,
      AdminInvoiceFilter.paid => invoice.status == InvoiceStatus.paid,
      AdminInvoiceFilter.overdue => invoice.status == InvoiceStatus.overdue,
    };
    if (!matchesFilter) return false;
    if (query.isEmpty) return true;

    return invoice.parentName.toLowerCase().contains(query) ||
        invoice.parentEmail.toLowerCase().contains(query) ||
        invoiceReference(invoice).toLowerCase().contains(query) ||
        invoice.id.toLowerCase().contains(query) ||
        invoice.lineItems.any(
          (item) =>
              (item['studentName'] ?? '').toString().toLowerCase().contains(
                    query,
                  ) ||
              (item['description'] ?? '').toString().toLowerCase().contains(
                    query,
                  ),
        );
  }).toList(growable: false);

  final sorted = [...matching]..sort((a, b) {
      // The legacy console grouped the All view by status after applying the
      // chosen sort. Keep that contract: overdue first, then unpaid, then paid.
      if (filter == AdminInvoiceFilter.all) {
        final statusComparison =
            _statusRank(a.status).compareTo(_statusRank(b.status));
        if (statusComparison != 0) return statusComparison;
      }

      final comparison = switch (sort) {
        AdminInvoiceSort.dueDate => a.dueDate.compareTo(b.dueDate),
        AdminInvoiceSort.amount => a.amountDue.compareTo(b.amountDue),
        AdminInvoiceSort.createdDate => a.createdAt.compareTo(b.createdAt),
        AdminInvoiceSort.parentName =>
          a.parentName.toLowerCase().compareTo(b.parentName.toLowerCase()),
      };
      return sortAscending ? comparison : -comparison;
    });

  final unpaid = invoices.where(
    (invoice) =>
        invoice.status == InvoiceStatus.unpaid ||
        invoice.status == InvoiceStatus.overdue,
  );
  final outstanding = unpaid.fold<double>(
    0,
    (sum, invoice) => sum + invoice.amountDue,
  );

  return AdminInvoiceConsoleData(
    rows: sorted.map(_toRow).toList(growable: false),
    totalCount: invoices.length,
    unpaidCount: invoices
        .where((invoice) => invoice.status == InvoiceStatus.unpaid)
        .length,
    overdueCount: invoices
        .where((invoice) => invoice.status == InvoiceStatus.overdue)
        .length,
    paidCount: invoices
        .where((invoice) => invoice.status == InvoiceStatus.paid)
        .length,
    outstandingTotal: outstanding,
    outstandingLabel: _currency.format(outstanding),
    filter: filter,
    sort: sort,
    sortAscending: sortAscending,
    searchQuery: searchQuery,
  );
}

final NumberFormat _currency =
    NumberFormat.currency(locale: 'en_AU', symbol: r'$');

final DateFormat _date = DateFormat('d MMM yyyy');

AdminInvoiceConsoleRow _toRow(Invoice invoice) {
  final studentNames = <String>{};
  for (final item in invoice.lineItems) {
    final name = (item['studentName'] ?? '').toString().trim();
    if (name.isNotEmpty) studentNames.add(name);
  }

  return AdminInvoiceConsoleRow(
    invoice: invoice,
    reference: invoiceReference(invoice),
    amountLabel: _currency.format(invoice.amountDue),
    dueLabel: 'Due ${_date.format(invoice.dueDate.toLocal())}',
    createdLabel: 'Created ${_date.format(invoice.createdAt.toLocal())}',
    studentLabel: studentNames.join(', '),
  );
}

String invoiceReference(Invoice invoice) {
  final stored = invoice.invoiceNumber?.trim() ?? '';
  if (stored.isEmpty) return invoice.id;
  if (RegExp(r'^\d+$').hasMatch(stored)) return 'INV-$stored';
  return stored;
}

int _statusRank(InvoiceStatus status) => switch (status) {
      InvoiceStatus.overdue => 0,
      InvoiceStatus.unpaid => 1,
      InvoiceStatus.paid => 2,
    };
