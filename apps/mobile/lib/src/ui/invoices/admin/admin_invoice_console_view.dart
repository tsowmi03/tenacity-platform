import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_invoice_console_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class AdminInvoiceConsoleView extends StatelessWidget {
  const AdminInvoiceConsoleView({
    super.key,
    required this.data,
    required this.isLoading,
    required this.isBusy,
    required this.errorMessage,
    required this.selectedInvoiceIds,
    required this.isSelectionMode,
    required this.onBack,
    required this.onRefresh,
    required this.onRetry,
    required this.onSearchChanged,
    required this.onFilterChanged,
    required this.onSortChanged,
    required this.onSortDirectionChanged,
    required this.onCreateInvoice,
    required this.onEnterSelectionMode,
    required this.onExitSelectionMode,
    required this.onToggleSelection,
    required this.onInvoiceTapped,
    required this.onMarkSelectedPaid,
    required this.onDeleteSelected,
  });

  final AdminInvoiceConsoleData data;
  final bool isLoading;
  final bool isBusy;
  final String? errorMessage;
  final Set<String> selectedInvoiceIds;
  final bool isSelectionMode;
  final VoidCallback onBack;
  final Future<void> Function() onRefresh;
  final VoidCallback onRetry;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<AdminInvoiceFilter> onFilterChanged;
  final ValueChanged<AdminInvoiceSort> onSortChanged;
  final VoidCallback onSortDirectionChanged;
  final VoidCallback onCreateInvoice;
  final VoidCallback onEnterSelectionMode;
  final VoidCallback onExitSelectionMode;
  final ValueChanged<String> onToggleSelection;
  final ValueChanged<Invoice> onInvoiceTapped;
  final VoidCallback onMarkSelectedPaid;
  final VoidCallback onDeleteSelected;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(
              title: isSelectionMode
                  ? '${selectedInvoiceIds.length} selected'
                  : 'All invoices',
              subtitle: isSelectionMode
                  ? 'Choose invoices, then apply a bulk action'
                  : data.summary,
              onBack: isBusy
                  ? null
                  : isSelectionMode
                      ? onExitSelectionMode
                      : onBack,
              trailing: isSelectionMode
                  ? IconButton(
                      key: const Key('admin-invoice-selection-clear'),
                      tooltip: 'Cancel selection',
                      onPressed: isBusy ? null : onExitSelectionMode,
                      color: Colors.white,
                      icon: const Icon(Icons.close_rounded),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          key: const Key('admin-invoice-select'),
                          tooltip: 'Select invoices',
                          onPressed:
                              isLoading || isBusy ? null : onEnterSelectionMode,
                          color: Colors.white,
                          icon: const Icon(Icons.checklist_rounded),
                        ),
                        IconButton(
                          key: const Key('admin-invoice-create'),
                          tooltip: 'New invoice',
                          onPressed:
                              isLoading || isBusy ? null : onCreateInvoice,
                          color: Colors.white,
                          icon: const Icon(Icons.add_rounded),
                        ),
                      ],
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenH,
                0,
                AppSpacing.screenH,
                AppSpacing.md,
              ),
              child: Column(
                children: [
                  SearchField(
                    hintText: 'Search parent, student or invoice',
                    initialValue: data.searchQuery,
                    onChanged: onSearchChanged,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  SegmentedFilter(
                    segments: const ['All', 'Unpaid', 'Paid', 'Overdue'],
                    selectedIndex: data.filter.index,
                    onSelected: (index) =>
                        onFilterChanged(AdminInvoiceFilter.values[index]),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _Toolbar(
                      data: data,
                      enabled: !isLoading && !isBusy,
                      onSortChanged: onSortChanged,
                      onSortDirectionChanged: onSortDirectionChanged,
                      onRefresh: onRefresh,
                    ),
                    if (isSelectionMode)
                      _SelectionActions(
                        selectedCount: selectedInvoiceIds.length,
                        isBusy: isBusy,
                        onMarkPaid: onMarkSelectedPaid,
                        onDelete: onDeleteSelected,
                      ),
                    Expanded(
                      child: _Body(
                        data: data,
                        isLoading: isLoading,
                        isBusy: isBusy,
                        errorMessage: errorMessage,
                        selectedInvoiceIds: selectedInvoiceIds,
                        isSelectionMode: isSelectionMode,
                        onRefresh: onRefresh,
                        onRetry: onRetry,
                        onToggleSelection: onToggleSelection,
                        onInvoiceTapped: onInvoiceTapped,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.data,
    required this.enabled,
    required this.onSortChanged,
    required this.onSortDirectionChanged,
    required this.onRefresh,
  });

  final AdminInvoiceConsoleData data;
  final bool enabled;
  final ValueChanged<AdminInvoiceSort> onSortChanged;
  final VoidCallback onSortDirectionChanged;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.sm,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              data.resultLabel,
              style: AppText.body(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: AppColors.muted,
              ),
            ),
          ),
          PopupMenuButton<AdminInvoiceSort>(
            key: const Key('admin-invoice-sort'),
            enabled: enabled,
            initialValue: data.sort,
            tooltip: 'Sort invoices',
            onSelected: onSortChanged,
            itemBuilder: (_) => [
              for (final sort in AdminInvoiceSort.values)
                PopupMenuItem(value: sort, child: Text(_sortLabel(sort))),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _sortLabel(data.sort),
                    style: AppText.body(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: enabled ? AppColors.blue : AppColors.disabled,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Icon(
                    Icons.expand_more_rounded,
                    size: 18,
                    color: enabled ? AppColors.blue : AppColors.disabled,
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            key: const Key('admin-invoice-sort-direction'),
            tooltip: data.sortAscending ? 'Sort descending' : 'Sort ascending',
            onPressed: enabled ? onSortDirectionChanged : null,
            icon: Icon(
              data.sortAscending
                  ? Icons.arrow_upward_rounded
                  : Icons.arrow_downward_rounded,
              size: 18,
            ),
          ),
          IconButton(
            key: const Key('admin-invoice-refresh'),
            tooltip: 'Refresh invoices',
            onPressed: enabled ? () => onRefresh() : null,
            icon: const Icon(Icons.refresh_rounded, size: 19),
          ),
        ],
      ),
    );
  }
}

String _sortLabel(AdminInvoiceSort sort) => switch (sort) {
      AdminInvoiceSort.dueDate => 'Due date',
      AdminInvoiceSort.amount => 'Amount',
      AdminInvoiceSort.createdDate => 'Created',
      AdminInvoiceSort.parentName => 'Parent',
    };

class _SelectionActions extends StatelessWidget {
  const _SelectionActions({
    required this.selectedCount,
    required this.isBusy,
    required this.onMarkPaid,
    required this.onDelete,
  });

  final int selectedCount;
  final bool isBusy;
  final VoidCallback onMarkPaid;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final enabled = selectedCount > 0 && !isBusy;
    return Container(
      key: const Key('admin-invoice-selection-actions'),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xs,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.lineSoft)),
      ),
      child: Row(
        children: [
          Expanded(
            child: FilledButton.icon(
              key: const Key('admin-invoice-bulk-paid'),
              onPressed: enabled ? onMarkPaid : null,
              icon: isBusy
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Icon(Icons.check_rounded, size: 18),
              label: const Text('Mark paid'),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: OutlinedButton.icon(
              key: const Key('admin-invoice-bulk-delete'),
              onPressed: enabled ? onDelete : null,
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.danger,
                side: BorderSide(
                  color: enabled ? AppColors.danger : AppColors.disabled,
                ),
              ),
              icon: const Icon(Icons.delete_outline_rounded, size: 18),
              label: const Text('Delete'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.data,
    required this.isLoading,
    required this.isBusy,
    required this.errorMessage,
    required this.selectedInvoiceIds,
    required this.isSelectionMode,
    required this.onRefresh,
    required this.onRetry,
    required this.onToggleSelection,
    required this.onInvoiceTapped,
  });

  final AdminInvoiceConsoleData data;
  final bool isLoading;
  final bool isBusy;
  final String? errorMessage;
  final Set<String> selectedInvoiceIds;
  final bool isSelectionMode;
  final Future<void> Function() onRefresh;
  final VoidCallback onRetry;
  final ValueChanged<String> onToggleSelection;
  final ValueChanged<Invoice> onInvoiceTapped;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return ListView(
        key: const Key('admin-invoice-loading'),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.sm,
          AppSpacing.screenH,
          AppSpacing.xxl,
        ),
        children: const [
          SkeletonBlock(height: 88),
          SizedBox(height: AppSpacing.sm),
          SkeletonBlock(height: 88),
          SizedBox(height: AppSpacing.sm),
          SkeletonBlock(height: 88),
        ],
      );
    }

    if (errorMessage != null) {
      return ListView(
        key: const Key('admin-invoice-error'),
        padding: const EdgeInsets.all(AppSpacing.screenH),
        children: [
          ErrorStateView(
            title: "We couldn't load invoices",
            message: errorMessage,
            onRetry: onRetry,
          ),
        ],
      );
    }

    if (data.rows.isEmpty) {
      return RefreshIndicator(
        color: AppColors.blue,
        onRefresh: onRefresh,
        child: ListView(
          key: const Key('admin-invoice-empty'),
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(AppSpacing.screenH),
          children: [
            EmptyStateView(
              icon: Icons.receipt_long_outlined,
              title: 'No invoices found',
              message: data.searchQuery.trim().isEmpty
                  ? 'There are no invoices in this view.'
                  : 'Try another parent, student or invoice number.',
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.blue,
      onRefresh: onRefresh,
      child: ListView.separated(
        key: const Key('admin-invoice-list'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.sm,
          AppSpacing.screenH,
          AppSpacing.xxl,
        ),
        itemCount: data.rows.length,
        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
        itemBuilder: (context, index) {
          final row = data.rows[index];
          return _InvoiceRow(
            key: Key('admin-invoice-row-${row.id}'),
            row: row,
            selected: selectedInvoiceIds.contains(row.id),
            isSelectionMode: isSelectionMode,
            enabled: !isBusy,
            onTap: () {
              if (isSelectionMode) {
                onToggleSelection(row.id);
              } else {
                onInvoiceTapped(row.invoice);
              }
            },
            onLongPress: isSelectionMode || isBusy
                ? null
                : () => onToggleSelection(row.id),
            onToggle: () => onToggleSelection(row.id),
          );
        },
      ),
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({
    super.key,
    required this.row,
    required this.selected,
    required this.isSelectionMode,
    required this.enabled,
    required this.onTap,
    required this.onLongPress,
    required this.onToggle,
  });

  final AdminInvoiceConsoleRow row;
  final bool selected;
  final bool isSelectionMode;
  final bool enabled;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final (tone, accent) = switch (row.status) {
      InvoiceStatus.paid => (StatusTone.success, AppColors.success),
      InvoiceStatus.overdue => (StatusTone.danger, AppColors.danger),
      InvoiceStatus.unpaid => (StatusTone.info, AppColors.blue),
    };

    return Material(
      color: selected ? AppColors.blue50 : AppColors.paper,
      shape: RoundedRectangleBorder(
        side: BorderSide(
          color: selected ? AppColors.blue : AppColors.line,
          width: selected ? 1.5 : 1,
        ),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: enabled ? onTap : null,
        onLongPress: onLongPress,
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: accent),
              if (isSelectionMode)
                Checkbox(
                  key: Key('admin-invoice-checkbox-${row.id}'),
                  value: selected,
                  onChanged: enabled ? (_) => onToggle() : null,
                ),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    isSelectionMode ? AppSpacing.xs : AppSpacing.lg,
                    AppSpacing.md,
                    AppSpacing.lg,
                    AppSpacing.md,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              row.reference,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.body(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.ink,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          StatusPill(
                            label: row.status.name.toUpperCase(),
                            tone: tone,
                            size: StatusPillSize.compact,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        row.parentName.isEmpty
                            ? 'Unknown parent'
                            : row.parentName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.body(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.text,
                        ),
                      ),
                      if (row.studentLabel.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          row.studentLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.body(
                            fontSize: 11.5,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.sm),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              row.dueLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.body(
                                fontSize: 11.5,
                                color: row.status == InvoiceStatus.overdue
                                    ? AppColors.danger
                                    : AppColors.muted,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Text(
                            row.amountLabel,
                            style: AppText.body(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.ink,
                            ),
                          ),
                        ],
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

Future<void> showAdminInvoiceDetailSheet({
  required BuildContext context,
  required Invoice invoice,
  required Future<bool> Function(Invoice invoice) onMarkPaid,
  required Future<void> Function(Invoice invoice) onOpenPdf,
  required Future<bool> Function(Invoice invoice) onDelete,
}) {
  return showAppBottomSheet<void>(
    context: context,
    allowUserDismissal: false,
    builder: (_) => _AdminInvoiceDetailSheet(
      invoice: invoice,
      onMarkPaid: onMarkPaid,
      onOpenPdf: onOpenPdf,
      onDelete: onDelete,
    ),
  );
}

class _AdminInvoiceDetailSheet extends StatefulWidget {
  const _AdminInvoiceDetailSheet({
    required this.invoice,
    required this.onMarkPaid,
    required this.onOpenPdf,
    required this.onDelete,
  });

  final Invoice invoice;
  final Future<bool> Function(Invoice invoice) onMarkPaid;
  final Future<void> Function(Invoice invoice) onOpenPdf;
  final Future<bool> Function(Invoice invoice) onDelete;

  @override
  State<_AdminInvoiceDetailSheet> createState() =>
      _AdminInvoiceDetailSheetState();
}

class _AdminInvoiceDetailSheetState extends State<_AdminInvoiceDetailSheet> {
  bool _isBusy = false;

  Future<void> _run(
    Future<bool> Function(Invoice invoice) action, {
    required bool closeOnSuccess,
  }) async {
    if (_isBusy) return;
    setState(() => _isBusy = true);
    try {
      final succeeded = await action(widget.invoice);
      if (succeeded && closeOnSuccess && mounted) {
        Navigator.of(context).pop();
      }
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _openPdf() async {
    if (_isBusy) return;
    setState(() => _isBusy = true);
    try {
      await widget.onOpenPdf(widget.invoice);
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final invoice = widget.invoice;
    final notes = invoice.adminNotes?.trim();
    final reference = invoiceReference(invoice);
    final currency = NumberFormat.currency(locale: 'en_AU', symbol: r'$');
    final date = DateFormat('d MMM yyyy');

    return AppBottomSheet(
      title: 'Invoice $reference',
      subtitle: invoice.parentName,
      maxHeightFactor: 0.92,
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              if (invoice.status != InvoiceStatus.paid) ...[
                Expanded(
                  child: FilledButton.icon(
                    key: const Key('admin-invoice-detail-paid'),
                    onPressed: _isBusy
                        ? null
                        : () => _run(
                              widget.onMarkPaid,
                              closeOnSuccess: true,
                            ),
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text('Mark paid'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
              ],
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('admin-invoice-detail-pdf'),
                  onPressed: _isBusy ? null : _openPdf,
                  icon: _isBusy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.description_outlined, size: 18),
                  label: const Text('Open PDF'),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          TextButton.icon(
            key: const Key('admin-invoice-detail-delete'),
            onPressed: _isBusy
                ? null
                : () => _run(widget.onDelete, closeOnSuccess: true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            icon: const Icon(Icons.delete_outline_rounded, size: 18),
            label: const Text('Delete invoice'),
          ),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              key: const Key('admin-invoice-detail-close'),
              onPressed: _isBusy ? null : () => Navigator.of(context).pop(),
              child: const Text('Close'),
            ),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _InvoiceAmountCard(invoice: invoice, currency: currency),
          const SizedBox(height: AppSpacing.sectionGap),
          const SectionLabel(title: 'DETAILS'),
          const SizedBox(height: AppSpacing.labelGap),
          _DetailRow(label: 'Parent', value: invoice.parentName),
          _DetailRow(label: 'Email', value: invoice.parentEmail),
          _DetailRow(
            label: 'Due',
            value: date.format(invoice.dueDate.toLocal()),
          ),
          _DetailRow(
            label: 'Created',
            value: date.format(invoice.createdAt.toLocal()),
          ),
          _DetailRow(label: 'Weeks', value: '${invoice.weeks}'),
          if (notes != null && notes.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sectionGap),
            const SectionLabel(title: 'ADMIN NOTES'),
            const SizedBox(height: AppSpacing.labelGap),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: AppColors.blue50,
                borderRadius: BorderRadius.circular(AppRadii.md),
              ),
              child: Text(
                notes,
                style: AppText.body(fontSize: 13, color: AppColors.text)
                    .copyWith(height: 1.45),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.sectionGap),
          const SectionLabel(title: 'LINE ITEMS'),
          const SizedBox(height: AppSpacing.labelGap),
          if (invoice.lineItems.isEmpty)
            const LedgerRowEmpty(message: 'No line items recorded')
          else
            for (var i = 0; i < invoice.lineItems.length; i++) ...[
              _LineItemRow(
                item: invoice.lineItems[i],
                currency: currency,
              ),
              if (i < invoice.lineItems.length - 1)
                const Divider(height: AppSpacing.xl),
            ],
        ],
      ),
    );
  }
}

class _InvoiceAmountCard extends StatelessWidget {
  const _InvoiceAmountCard({
    required this.invoice,
    required this.currency,
  });

  final Invoice invoice;
  final NumberFormat currency;

  @override
  Widget build(BuildContext context) {
    final tone = switch (invoice.status) {
      InvoiceStatus.paid => StatusTone.success,
      InvoiceStatus.overdue => StatusTone.danger,
      InvoiceStatus.unpaid => StatusTone.info,
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'AMOUNT DUE',
                  style: AppText.body(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.muted,
                  ).copyWith(letterSpacing: 1.2),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  currency.format(invoice.amountDue),
                  style: AppText.display(fontSize: 28),
                ),
              ],
            ),
          ),
          StatusPill(
            label: invoice.status.name.toUpperCase(),
            tone: tone,
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 76,
            child: Text(
              label,
              style: AppText.body(fontSize: 12, color: AppColors.muted),
            ),
          ),
          Expanded(
            child: Text(
              value.isEmpty ? 'Not recorded' : value,
              style: AppText.body(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LineItemRow extends StatelessWidget {
  const _LineItemRow({required this.item, required this.currency});

  final Map<String, dynamic> item;
  final NumberFormat currency;

  @override
  Widget build(BuildContext context) {
    final description = (item['description'] ?? 'Line item').toString();
    final student = (item['studentName'] ?? '').toString().trim();
    final quantity = (item['quantity'] as num?)?.toInt() ?? 0;
    final unitAmount = (item['unitAmount'] as num?)?.toDouble() ?? 0;
    final lineTotal =
        (item['lineTotal'] as num?)?.toDouble() ?? quantity * unitAmount;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  description,
                  style: AppText.body(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    if (student.isNotEmpty) student,
                    '$quantity × ${currency.format(unitAmount)}',
                  ].join(' · '),
                  style: AppText.body(fontSize: 11.5, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            currency.format(lineTotal),
            style: AppText.body(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
