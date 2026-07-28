import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';

/// Which slice of billing is showing.
enum AdminBillingFilter { all, overdue, unpaid, paid }

/// One invoice on the billing console.
@immutable
class AdminBillingInvoice {
  final String id;

  /// `INV-0219`, or the document id when no number has been assigned.
  final String reference;

  /// `Chen family`.
  final String familyLabel;

  final double amountDue;
  final DateTime dueDate;

  /// Days past the due date; zero or negative when not yet due.
  final int daysOverdue;

  /// `12 days overdue`, `due in 3 days`, `due today`.
  final String dueLabel;

  /// When the automatic reminder job will next contact this family, e.g.
  /// `next reminder tomorrow`. Null once the invoice is paid.
  ///
  /// Shown in place of the reference's `reminded ×2` and its `Remind` button:
  /// nothing records what has been sent, and no manual trigger exists, so what
  /// can honestly be shown is what is going to happen next.
  final String? nextReminderLabel;

  const AdminBillingInvoice({
    required this.id,
    required this.reference,
    required this.familyLabel,
    required this.amountDue,
    required this.dueDate,
    required this.daysOverdue,
    required this.dueLabel,
    required this.nextReminderLabel,
  });

  bool get isOverdue => daysOverdue > 0;

  /// `$320.00 · 12 days overdue · next reminder in 2 days`.
  String get subtitle => [
        formatCurrency(amountDue),
        dueLabel,
        if (nextReminderLabel != null) nextReminderLabel!,
      ].join(' · ');
}

/// A settled invoice, for the recent-payments list.
@immutable
class AdminBillingPayment {
  final String id;
  final String reference;
  final String familyLabel;
  final double amount;

  /// `Paid today`, `Paid yesterday`, `Paid 12 Jul`.
  ///
  /// The reference also names the card — `Visa ····4242` — which the payment
  /// record does not store. That contract is deliberately deferred to the end
  /// of the redesign (P00), so the method is omitted rather than invented.
  final String paidLabel;

  const AdminBillingPayment({
    required this.id,
    required this.reference,
    required this.familyLabel,
    required this.amount,
    required this.paidLabel,
  });
}

@immutable
class AdminBillingViewData {
  final double outstandingTotal;

  /// `$4,860` for the headline figure.
  final String outstandingLabel;

  /// `23 unpaid invoices · 9 overdue`.
  final String summary;

  final int unpaidCount;
  final int overdueCount;

  final AdminBillingFilter filter;

  /// Invoices matching the filter, worst first.
  final List<AdminBillingInvoice> invoices;

  /// Settled invoices, newest first. Empty unless the filter includes paid.
  final List<AdminBillingPayment> payments;

  final String? errorMessage;

  const AdminBillingViewData({
    required this.outstandingTotal,
    required this.outstandingLabel,
    required this.summary,
    required this.unpaidCount,
    required this.overdueCount,
    required this.filter,
    required this.invoices,
    required this.payments,
    this.errorMessage,
  });

  bool get isEmpty => invoices.isEmpty && payments.isEmpty;

  /// The heading above [invoices], which changes with the filter.
  String get invoicesLabel => switch (filter) {
        AdminBillingFilter.paid => '',
        AdminBillingFilter.unpaid => 'UNPAID',
        _ => 'OVERDUE',
      };
}

/// Builds the admin billing console.
///
/// Pure, so the totals, ordering and reminder rules are testable without
/// Firestore.
AdminBillingViewData buildAdminBillingViewData({
  required List<Invoice> invoices,
  required DateTime now,
  AdminBillingFilter filter = AdminBillingFilter.all,
  int recentPaymentLimit = 5,
  String? errorMessage,
}) {
  final today = DateTime(now.year, now.month, now.day);

  final unpaid = invoices
      .where((invoice) => invoice.status != InvoiceStatus.paid)
      .toList(growable: false);

  final outstanding =
      unpaid.fold<double>(0, (total, invoice) => total + invoice.amountDue);

  final rows =
      unpaid.map((invoice) => _toRow(invoice, today)).toList(growable: false)
        // Worst first: most overdue at the top, then soonest due.
        ..sort((a, b) => b.daysOverdue.compareTo(a.daysOverdue));

  final overdue = rows.where((row) => row.isOverdue).toList(growable: false);

  final payments = invoices
      .where((invoice) => invoice.status == InvoiceStatus.paid)
      .toList(growable: false)
    ..sort((a, b) => (b.paidAt ?? b.dueDate).compareTo(a.paidAt ?? a.dueDate));

  final visibleInvoices = switch (filter) {
    AdminBillingFilter.all => overdue,
    AdminBillingFilter.overdue => overdue,
    AdminBillingFilter.unpaid =>
      rows.where((row) => !row.isOverdue).toList(growable: false),
    AdminBillingFilter.paid => const <AdminBillingInvoice>[],
  };

  final showPayments =
      filter == AdminBillingFilter.all || filter == AdminBillingFilter.paid;

  return AdminBillingViewData(
    outstandingTotal: outstanding,
    outstandingLabel: formatCurrencyShort(outstanding),
    summary: _summary(unpaid.length, overdue.length),
    unpaidCount: unpaid.length,
    overdueCount: overdue.length,
    filter: filter,
    invoices: visibleInvoices,
    payments: showPayments
        ? payments
            .take(recentPaymentLimit)
            .map((invoice) => _toPayment(invoice, today))
            .toList(growable: false)
        : const [],
    errorMessage: errorMessage,
  );
}

String _summary(int unpaid, int overdue) {
  final invoices = '$unpaid unpaid ${unpaid == 1 ? 'invoice' : 'invoices'}';
  return overdue == 0 ? invoices : '$invoices · $overdue overdue';
}

AdminBillingInvoice _toRow(Invoice invoice, DateTime today) {
  final due = _dateOnly(invoice.dueDate);
  final daysOverdue = today.difference(due).inDays;

  return AdminBillingInvoice(
    id: invoice.id,
    reference: _referenceLabel(invoice),
    familyLabel: _familyLabel(invoice.parentName),
    amountDue: invoice.amountDue,
    dueDate: due,
    daysOverdue: daysOverdue,
    dueLabel: _dueLabel(daysOverdue),
    nextReminderLabel: _nextReminderLabel(due, today),
  );
}

AdminBillingPayment _toPayment(Invoice invoice, DateTime today) {
  final paidAt = invoice.paidAt?.toLocal();

  return AdminBillingPayment(
    id: invoice.id,
    reference: _referenceLabel(invoice),
    familyLabel: _familyLabel(invoice.parentName),
    amount: invoice.amountDue,
    paidLabel: paidAt == null ? 'Paid' : 'Paid ${_paidWhen(paidAt, today)}',
  );
}

/// `Chen family` from a stored `Wei Chen`.
///
/// Falls back to the name as stored whenever the last word is not a usable
/// surname. Real records end in an initial often enough that taking the last
/// token blindly produced `I family`, which names nobody.
String _familyLabel(String parentName) {
  final trimmed = parentName.trim();
  final parts =
      trimmed.split(RegExp(r'\s+')).where((part) => part.isNotEmpty).toList();

  if (parts.isEmpty) return 'Family';
  if (parts.length == 1) return parts.first;

  // A single trailing letter, with or without a full stop, is an initial.
  final last = parts.last.replaceAll('.', '');
  if (last.length <= 1) return trimmed;

  return '$last family';
}

/// The invoice reference as an admin should read it.
///
/// Stored numbers are bare (`375`), which sits next to a dollar amount and
/// reads like one. A purely numeric reference is prefixed; anything already
/// carrying a prefix is left alone.
String _referenceLabel(Invoice invoice) {
  final stored = invoice.invoiceNumber?.trim() ?? '';
  if (stored.isEmpty) return invoice.id;
  if (RegExp(r'^\d+$').hasMatch(stored)) return 'INV-$stored';
  return stored;
}

String _dueLabel(int daysOverdue) {
  if (daysOverdue > 0) {
    return '$daysOverdue ${daysOverdue == 1 ? 'day' : 'days'} overdue';
  }
  if (daysOverdue == 0) return 'due today';
  final days = -daysOverdue;
  return 'due in $days ${days == 1 ? 'day' : 'days'}';
}

/// When the scheduled reminder job will next contact this family.
///
/// **Mirrors `invoiceReminderScheduler`** in
/// `backend/firebase/functions/lib/notifications/invoice_notifications.js`,
/// which runs daily at 10:00 Sydney and sends seven days before the due date,
/// on the due date, and every seventh day after it. Nothing is recorded when a
/// reminder is sent, so this is derived from the due date alone — if that
/// schedule changes, this must change with it.
String? _nextReminderLabel(DateTime due, DateTime today) {
  final next = nextReminderDate(due: due, today: today);
  if (next == null) return null;

  final days = next.difference(today).inDays;
  if (days <= 0) return 'reminder due today';
  if (days == 1) return 'next reminder tomorrow';
  if (days < 7) return 'next reminder in $days days';
  return 'next reminder ${DateFormat('d MMM').format(next)}';
}

/// The next date the reminder job will fire for an invoice due on [due],
/// on or after [today]. Visible for testing against the scheduler's rule.
DateTime? nextReminderDate({required DateTime due, required DateTime today}) {
  final daysUntilDue = due.difference(today).inDays;

  // More than a week out: the first reminder is the seven-day warning.
  if (daysUntilDue > 7) return due.subtract(const Duration(days: 7));

  // Within the week, including the due date itself.
  if (daysUntilDue >= 0) return due;

  // Overdue: every seventh day after the due date.
  final daysOverdue = -daysUntilDue;
  final elapsedWeeks = (daysOverdue / 7).ceil();
  return due.add(Duration(days: elapsedWeeks * 7));
}

String _paidWhen(DateTime paidAt, DateTime today) {
  final day = _dateOnly(paidAt);
  final difference = today.difference(day).inDays;
  if (difference == 0) return 'today';
  if (difference == 1) return 'yesterday';
  if (difference < 7) return '$difference days ago';
  return DateFormat('d MMM').format(day);
}

DateTime _dateOnly(DateTime value) {
  final local = value.toLocal();
  return DateTime(local.year, local.month, local.day);
}
