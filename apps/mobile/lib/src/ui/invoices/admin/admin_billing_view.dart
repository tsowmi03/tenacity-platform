import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_billing_data.dart';

/// The admin billing console: what is outstanding, who is overdue, what has
/// just been paid, and a way into the full invoice list.
///
/// Presentation only.
///
/// **Documented omissions** (§7, §11). The reference carries a `Send 9
/// reminders` button and a `Follow up` / `Remind` action on each overdue row,
/// plus a `reminded ×2` count. Reminders are already automatic — a scheduled
/// job contacts families seven days before the due date, on it, and weekly
/// after — and nothing is recorded when one is sent, so none of those can
/// report what they did. What is shown instead is when the next reminder will
/// go out. The reference also names the card on a payment (`Visa ····4242`),
/// which the payment record does not store; that contract is deferred (P00).
class AdminBillingView extends StatelessWidget {
  final AdminBillingViewData data;
  final Future<void> Function() onRefresh;
  final ValueChanged<AdminBillingFilter> onFilterChanged;
  final ValueChanged<AdminBillingInvoice> onInvoiceTapped;
  final VoidCallback onNewInvoice;
  final VoidCallback onViewAll;
  final VoidCallback onRetry;

  const AdminBillingView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onFilterChanged,
    required this.onInvoiceTapped,
    required this.onNewInvoice,
    required this.onViewAll,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(data: data, onNewInvoice: onNewInvoice),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('admin-billing-scroll'),
                onRefresh: onRefresh,
                children: [
                  _Filters(
                    selected: data.filter,
                    onChanged: onFilterChanged,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  if (data.errorMessage != null)
                    ErrorStateView(
                      key: const Key('admin-billing-error'),
                      title: "We couldn't load billing",
                      message: data.errorMessage,
                      onRetry: onRetry,
                    )
                  else ...[
                    if (data.invoices.isNotEmpty) ...[
                      SectionLabel(title: data.invoicesLabel),
                      const SizedBox(height: AppSpacing.labelGap),
                      for (final invoice in data.invoices) ...[
                        _InvoiceCard(
                          key: Key('admin-billing-invoice-${invoice.id}'),
                          invoice: invoice,
                          onTap: () => onInvoiceTapped(invoice),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                      const SizedBox(height: AppSpacing.md),
                    ],
                    if (data.payments.isNotEmpty) ...[
                      const SectionLabel(title: 'RECENT PAYMENTS'),
                      const SizedBox(height: 6),
                      for (var i = 0; i < data.payments.length; i++)
                        _PaymentRow(
                          key: Key(
                            'admin-billing-payment-${data.payments[i].id}',
                          ),
                          payment: data.payments[i],
                          showDivider: i < data.payments.length - 1,
                        ),
                    ],
                    if (data.isEmpty)
                      EmptyStateView(
                        key: const Key('admin-billing-empty'),
                        icon: Icons.receipt_long_outlined,
                        title: 'Nothing here',
                        message: _emptyMessage(data.filter),
                      ),
                    const SizedBox(height: AppSpacing.md),
                    Center(
                      child: TextButton(
                        key: const Key('admin-billing-view-all'),
                        onPressed: onViewAll,
                        child: Text(
                          'View all invoices',
                          style: AppText.body(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.blue,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _emptyMessage(AdminBillingFilter filter) => switch (filter) {
      AdminBillingFilter.overdue => 'No invoice is overdue.',
      AdminBillingFilter.unpaid => 'Nothing is waiting to be paid.',
      AdminBillingFilter.paid => 'No payments recorded yet.',
      AdminBillingFilter.all => 'No invoices to show.',
    };

class _Header extends StatelessWidget {
  final AdminBillingViewData data;
  final VoidCallback onNewInvoice;

  const _Header({required this.data, required this.onNewInvoice});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const BrandLogo(),
          const SizedBox(height: 10),
          Text(
            'TOTAL OUTSTANDING',
            style: AppText.body(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: AppColors.blue300,
            ).copyWith(letterSpacing: 1.7),
          ),
          const SizedBox(height: 6),
          Text(
            data.outstandingLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            // The reference sets this in ExtraBold, which is not among the
            // bundled Bricolage weights; Bold substitutes, as on P04.
            style: AppText.display(
              fontSize: 42,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ).copyWith(height: 1, letterSpacing: -0.4),
          ),
          const SizedBox(height: 6),
          Text(
            data.summary,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.body(fontSize: 13, color: Colors.white60),
          ),
          const SizedBox(height: AppSpacing.md),
          // The reference pairs `New` with `Send N reminders`. Reminders are
          // automatic and record nothing, so only `New` is shipped.
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              key: const Key('admin-billing-new'),
              onPressed: onNewInvoice,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.blue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 12,
                ),
                shape: const StadiumBorder(),
              ),
              icon: const Icon(Icons.add_rounded, size: 18),
              label: Text(
                'New invoice',
                style: AppText.body(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  final AdminBillingFilter selected;
  final ValueChanged<AdminBillingFilter> onChanged;

  const _Filters({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final filter in AdminBillingFilter.values) ...[
            if (filter != AdminBillingFilter.values.first)
              const SizedBox(width: 7),
            _FilterChip(
              key: Key('admin-billing-filter-${filter.name}'),
              label: _label(filter),
              selected: filter == selected,
              onTap: () => onChanged(filter),
            ),
          ],
        ],
      ),
    );
  }

  static String _label(AdminBillingFilter filter) => switch (filter) {
        AdminBillingFilter.all => 'All',
        AdminBillingFilter.overdue => 'Overdue',
        AdminBillingFilter.unpaid => 'Unpaid',
        AdminBillingFilter.paid => 'Paid',
      };
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.ink : AppColors.blue50,
      borderRadius: BorderRadius.circular(AppRadii.pill),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Text(
            label,
            style: AppText.body(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : AppColors.muted,
            ),
          ),
        ),
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  final AdminBillingInvoice invoice;
  final VoidCallback onTap;

  const _InvoiceCard({
    super.key,
    required this.invoice,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // The reference grades the left edge: red once a family is well past due,
    // amber when they have only just slipped.
    final accent = invoice.daysOverdue >= 7
        ? AppColors.danger
        : invoice.isOverdue
            ? AppColors.warning
            : AppColors.blue;

    // The reference draws the accent as `border-left: 4px solid`. Expressing
    // that as a non-uniform Border alongside a borderRadius is what Flutter
    // rejects outright, so the edge is a sibling bar inside a clipped, evenly
    // bordered card instead.
    return Material(
      color: AppColors.paper,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: accent),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 13,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${invoice.familyLabel} — ${invoice.reference}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.body(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.ink,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              invoice.subtitle,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.body(
                                fontSize: 12,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      const Icon(
                        Icons.chevron_right_rounded,
                        size: AppSpacing.xl,
                        color: AppColors.muted,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  final AdminBillingPayment payment;
  final bool showDivider;

  const _PaymentRow({
    super.key,
    required this.payment,
    required this.showDivider,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 2),
      decoration: BoxDecoration(
        border: showDivider
            ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
            : null,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${payment.familyLabel} · ${payment.reference}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  payment.paidLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            formatCurrency(payment.amount),
            style: AppText.body(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          const StatusPill(
            label: 'PAID',
            tone: StatusTone.success,
            size: StatusPillSize.compact,
          ),
        ],
      ),
    );
  }
}
