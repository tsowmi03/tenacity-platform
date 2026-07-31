import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';

/// An invoice as the parent's billing screen shows it.
@immutable
class ParentInvoiceRow {
  final String invoiceId;

  /// `INV-0231`, falling back to the document id when no number was assigned.
  final String reference;

  /// `Ella & Max — 4 lessons`, or just the lesson count when no student names
  /// were recorded on the invoice.
  final String title;

  /// `INV-0231 · Term 3, Weeks 1–2 · due Fri 18 Jul` for an unpaid invoice,
  /// `Paid 20 Jun` for a settled one.
  final String subtitle;

  final String amountLabel;
  final InvoiceStatus status;
  final bool isOverdue;

  const ParentInvoiceRow({
    required this.invoiceId,
    required this.reference,
    required this.title,
    required this.subtitle,
    required this.amountLabel,
    required this.status,
    required this.isOverdue,
  });

  String get statusLabel => switch (status) {
        InvoiceStatus.paid => 'PAID',
        InvoiceStatus.overdue => 'OVERDUE',
        InvoiceStatus.unpaid => isOverdue ? 'OVERDUE' : 'UNPAID',
      };
}

@immutable
class ParentInvoicesViewData {
  final double outstandingAmount;

  /// `$420.00` — the headline figure.
  final String outstandingLabel;

  /// `1 unpaid invoice · due Fri 18 Jul`, or `You're all paid up`.
  final String outstandingSummary;

  /// `Pay all — $420.00`.
  final String payAllLabel;

  final List<ParentInvoiceRow> unpaid;
  final List<ParentInvoiceRow> history;

  const ParentInvoicesViewData({
    required this.outstandingAmount,
    required this.outstandingLabel,
    required this.outstandingSummary,
    required this.payAllLabel,
    required this.unpaid,
    required this.history,
  });

  bool get hasOutstanding => outstandingAmount > 0;

  /// Pay-all only earns its place when it would settle more than one invoice;
  /// with a single one it duplicates that invoice's own Pay now.
  bool get showPayAll => unpaid.length > 1;

  bool get isEmpty => unpaid.isEmpty && history.isEmpty;
}

/// Derives the parent's billing screen.
///
/// Pure, so the totals, ordering and copy are testable without Stripe or
/// Firestore.
ParentInvoicesViewData buildParentInvoicesViewData({
  required List<Invoice> invoices,
  required DateTime now,

  /// How many settled invoices to show before "View all invoices".
  int historyLimit = 3,
}) {
  final today = DateTime(now.year, now.month, now.day);

  final unpaidInvoices = invoices
      .where((i) => i.status != InvoiceStatus.paid)
      .toList()
    ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
  final paidInvoices = invoices
      .where((i) => i.status == InvoiceStatus.paid)
      .toList()
    ..sort((a, b) => (b.paidAt ?? b.dueDate).compareTo(a.paidAt ?? a.dueDate));

  final outstanding = unpaidInvoices.fold<double>(
    0,
    (total, invoice) => total + invoice.amountDue,
  );

  return ParentInvoicesViewData(
    outstandingAmount: outstanding,
    outstandingLabel: formatCurrency(outstanding),
    outstandingSummary: _outstandingSummary(unpaidInvoices, today),
    payAllLabel: 'Pay all — ${formatCurrency(outstanding)}',
    unpaid: [
      for (final invoice in unpaidInvoices) _toRow(invoice, today),
    ],
    history: [
      for (final invoice in paidInvoices.take(historyLimit))
        _toRow(invoice, today),
    ],
  );
}

/// True when there are more settled invoices than the screen is showing.
bool hasMoreHistory({required List<Invoice> invoices, int historyLimit = 3}) {
  return invoices.where((i) => i.status == InvoiceStatus.paid).length >
      historyLimit;
}

String _outstandingSummary(List<Invoice> unpaid, DateTime today) {
  if (unpaid.isEmpty) return "You're all paid up";

  final count = unpaid.length;
  final noun = count == 1 ? 'unpaid invoice' : 'unpaid invoices';
  final soonest = unpaid.first.dueDate.toLocal();
  final dueDay = DateTime(soonest.year, soonest.month, soonest.day);
  final days = dueDay.difference(today).inDays;

  final when = switch (days) {
    < 0 => 'overdue since ${DateFormat('d MMM').format(soonest)}',
    0 => 'due today',
    1 => 'due tomorrow',
    < 7 => 'due ${DateFormat('EEEE').format(soonest)}',
    _ => 'due ${DateFormat('EEE d MMM').format(soonest)}',
  };

  return '$count $noun · $when';
}

ParentInvoiceRow _toRow(Invoice invoice, DateTime today) {
  final reference = invoice.invoiceNumber?.trim().isNotEmpty == true
      ? invoice.invoiceNumber!.trim()
      : invoice.id;
  final dueDate = invoice.dueDate.toLocal();
  final isPaid = invoice.status == InvoiceStatus.paid;
  final isOverdue = !isPaid &&
      DateTime(dueDate.year, dueDate.month, dueDate.day).isBefore(today);

  return ParentInvoiceRow(
    invoiceId: invoice.id,
    reference: reference,
    title: isPaid
        ? '$reference · ${_periodLabel(invoice)}'
        : _unpaidTitle(invoice),
    subtitle: isPaid
        ? _paidSubtitle(invoice)
        : [
            reference,
            _periodLabel(invoice),
            'due ${DateFormat('EEE d MMM').format(dueDate)}',
          ].where((part) => part.isNotEmpty).join(' · '),
    amountLabel: formatCurrency(invoice.amountDue),
    status: invoice.status,
    isOverdue: isOverdue,
  );
}

/// `Ella & Max — 4 lessons`.
String _unpaidTitle(Invoice invoice) {
  final names = studentNamesOn(invoice);
  final lessons = lessonCountOn(invoice);
  final lessonLabel = '$lessons ${lessons == 1 ? 'lesson' : 'lessons'}';

  if (names.isEmpty) return lessonLabel;
  return '${joinNames(names)} — $lessonLabel';
}

/// `Paid 20 Jun`.
///
/// The design also shows the card used — `Visa ····4242` — but the payment
/// record stores no brand or last four digits. Rather than invent one, the
/// card is omitted until that contract lands. See P00 in
/// `V3_REDESIGN_ROADMAP.md`.
String _paidSubtitle(Invoice invoice) {
  final paidAt = invoice.paidAt ?? invoice.payments.lastOrNull?.paidAt;
  if (paidAt == null) return 'Paid';
  return 'Paid ${DateFormat('d MMM').format(paidAt.toLocal())}';
}

/// `Term 3, Weeks 1–2` where the invoice records a span, otherwise a plain
/// week count.
String _periodLabel(Invoice invoice) {
  if (invoice.weeks <= 0) return '';
  return '${invoice.weeks} ${invoice.weeks == 1 ? 'week' : 'weeks'}';
}

/// The distinct student names recorded on an invoice's line items.
///
/// Invoices store a snapshot of the student name per line, so this reads the
/// invoice rather than the current student records — a name change should not
/// rewrite history.
List<String> studentNamesOn(Invoice invoice) {
  final names = <String>[];
  for (final item in invoice.lineItems) {
    final raw =
        (item['studentName'] ?? item['student'] ?? '').toString().trim();
    if (raw.isEmpty) continue;
    // Line descriptions are per student per session, so the same name repeats.
    final firstName = raw.split(RegExp(r'\s+')).first;
    if (!names.contains(firstName)) names.add(firstName);
  }
  return names;
}

/// Total sessions billed, from the line item quantities.
int lessonCountOn(Invoice invoice) {
  var total = 0;
  for (final item in invoice.lineItems) {
    final quantity = item['quantity'];
    if (quantity is num) total += quantity.toInt();
  }
  return total;
}
