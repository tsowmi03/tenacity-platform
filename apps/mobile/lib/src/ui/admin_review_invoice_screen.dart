import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/invoice_draft_model.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class AdminReviewInvoiceScreen extends StatefulWidget {
  const AdminReviewInvoiceScreen({super.key, required this.initialDraft});

  final InvoiceDraft initialDraft;

  @override
  State<AdminReviewInvoiceScreen> createState() =>
      _AdminReviewInvoiceScreenState();
}

class _LineItemResult {
  const _LineItemResult({
    required this.description,
    required this.quantity,
    required this.unitAmount,
  });

  final String description;
  final int quantity;
  final double unitAmount;
}

class _LineItemEditor {
  _LineItemEditor({required Map<String, dynamic> initial})
      : extra = Map<String, dynamic>.from(initial)
          ..remove('description')
          ..remove('quantity')
          ..remove('unitAmount')
          ..remove('lineTotal'),
        description = TextEditingController(
          text: (initial['description'] ?? '').toString(),
        ),
        quantity = TextEditingController(
          text: ((initial['quantity'] as num?)?.toInt() ?? 1).toString(),
        ),
        unitAmount = TextEditingController(
          text: ((initial['unitAmount'] as num?)?.toDouble() ?? 0)
              .toStringAsFixed(2),
        );

  final Map<String, dynamic> extra;
  final TextEditingController description;
  final TextEditingController quantity;
  final TextEditingController unitAmount;

  int get parsedQuantity => int.tryParse(quantity.text.trim()) ?? 0;

  double? get parsedUnitAmountOrNull {
    final value = double.tryParse(unitAmount.text.trim());
    return value != null && value.isFinite ? value : null;
  }

  double get parsedUnitAmount => parsedUnitAmountOrNull ?? 0.0;

  double get lineTotal => parsedQuantity * parsedUnitAmount;

  Map<String, dynamic> toLineItemMap() => {
        ...extra,
        'description': description.text.trim(),
        'quantity': parsedQuantity,
        'unitAmount': parsedUnitAmount,
        'lineTotal': lineTotal,
      };

  void dispose() {
    description.dispose();
    quantity.dispose();
    unitAmount.dispose();
  }
}

class _AdminReviewInvoiceScreenState extends State<AdminReviewInvoiceScreen> {
  late final NumberFormat _currency;
  late List<_LineItemEditor> _items;
  late final TextEditingController _overrideController;
  late final TextEditingController _notesController;

  bool _overrideEnabled = false;
  bool _isSaving = false;
  bool _submissionLocked = false;

  @override
  void initState() {
    super.initState();
    _currency = NumberFormat.currency(locale: 'en_AU', symbol: r'$');
    _items = widget.initialDraft.lineItems
        .map((item) => _LineItemEditor(initial: item))
        .toList();
    _overrideEnabled = widget.initialDraft.overrideTotal != null;
    _overrideController = TextEditingController(
      text: (widget.initialDraft.overrideTotal ?? 0).toStringAsFixed(2),
    );
    _notesController = TextEditingController(
      text: widget.initialDraft.adminNotes ?? '',
    );
  }

  @override
  void dispose() {
    FocusManager.instance.primaryFocus?.unfocus();
    for (final item in _items) {
      item.dispose();
    }
    _overrideController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  double get _lineItemsTotal =>
      _items.fold(0, (total, item) => total + item.lineTotal);

  double? get _overrideTotal {
    if (!_overrideEnabled) return null;
    final value = double.tryParse(_overrideController.text.trim());
    return value != null && value.isFinite ? value : null;
  }

  double get _finalTotal => _overrideTotal ?? _lineItemsTotal;

  double get _overrideDelta {
    final override = _overrideTotal;
    return override == null ? 0 : override - _lineItemsTotal;
  }

  Future<void> _addLineItem() async {
    final result = await showAppBottomSheet<_LineItemResult>(
      context: context,
      builder: (_) => const _AddLineItemSheet(),
    );
    if (result == null || !mounted) return;

    setState(() {
      _items.add(
        _LineItemEditor(
          initial: {
            'description': result.description,
            'quantity': result.quantity,
            'unitAmount': result.unitAmount,
          },
        ),
      );
    });
  }

  void _removeLineItem(int index) {
    FocusManager.instance.primaryFocus?.unfocus();
    final removed = _items.removeAt(index);
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) => removed.dispose());
  }

  Future<void> _save() async {
    if (_isSaving) return;
    if (_items.isEmpty) {
      _notify('Add at least one line item.');
      return;
    }
    for (final item in _items) {
      if (item.description.text.trim().isEmpty) {
        _notify('All line items must have a description.');
        return;
      }
      if (item.parsedQuantity <= 0) {
        _notify('All line items must have quantity greater than zero.');
        return;
      }
      if (item.parsedUnitAmountOrNull == null) {
        _notify('All line items must have a valid unit amount.');
        return;
      }
    }

    final override = _overrideTotal;
    if (_overrideEnabled) {
      if (override == null) {
        _notify('Enter a valid override total.');
        return;
      }
      if (override < 0) {
        _notify('Override total cannot be negative.');
        return;
      }
    }

    if (_finalTotal < 0) {
      _notify('Invoice total cannot be negative.');
      return;
    }

    setState(() => _isSaving = true);
    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'create this invoice',
      )) {
        return;
      }
      if (!mounted) return;
      setState(() => _submissionLocked = true);

      final initial = widget.initialDraft;
      // Construct the final draft explicitly. InvoiceDraft.copyWith uses `??`,
      // so it cannot clear an initial override when the switch is turned off.
      final draft = InvoiceDraft(
        createRequestId: initial.createRequestId,
        parentId: initial.parentId,
        parentName: initial.parentName,
        parentEmail: initial.parentEmail,
        lineItems: _items.map((item) => item.toLineItemMap()).toList(),
        weeks: initial.weeks,
        dueDate: initial.dueDate,
        computedTotal: initial.computedTotal,
        studentIds: initial.studentIds,
        overrideTotal: _overrideEnabled ? override : null,
        adminNotes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
        createdByAdminId: initial.createdByAdminId,
      );

      await context.read<InvoiceController>().createInvoiceFromDraft(draft);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      _notify(
        'The invoice outcome could not be confirmed. Keep this review '
        'unchanged and try again, or close and refresh invoices.',
      );
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.initialDraft;
    final editingEnabled = !_isSaving && !_submissionLocked;

    return PopScope(
      canPop: !_isSaving,
      child: Scaffold(
        backgroundColor: AppColors.ink,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              DetailHeader(
                title: 'Review invoice',
                subtitle: draft.parentName,
                onBack: _isSaving ? null : () => Navigator.of(context).pop(),
              ),
              Expanded(
                child: ContentSheet.fixed(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      Expanded(
                        child: SingleChildScrollView(
                          key: const Key('admin-review-invoice-scroll'),
                          padding: const EdgeInsets.fromLTRB(
                            AppSpacing.screenH,
                            AppSpacing.xl,
                            AppSpacing.screenH,
                            AppSpacing.xxl,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _FinalTotalCard(
                                totalLabel: _currency.format(_finalTotal),
                                lineItemCount: _items.length,
                              ),
                              const SizedBox(height: AppSpacing.sectionGap),
                              const SectionLabel(title: 'INVOICE DETAILS'),
                              const SizedBox(height: AppSpacing.labelGap),
                              _InvoiceDetailsCard(
                                parentName: draft.parentName,
                                parentEmail: draft.parentEmail,
                                weeks: draft.weeks,
                                dueDate: draft.dueDate,
                              ),
                              const SizedBox(height: AppSpacing.sectionGap),
                              const SectionLabel(title: 'TOTAL'),
                              const SizedBox(height: AppSpacing.labelGap),
                              _TotalsCard(
                                computedTotal:
                                    _currency.format(draft.computedTotal),
                                lineItemsTotal:
                                    _currency.format(_lineItemsTotal),
                                finalTotal: _currency.format(_finalTotal),
                                overrideEnabled: _overrideEnabled,
                                overrideController: _overrideController,
                                overrideDelta: _currency.format(_overrideDelta),
                                enabled: editingEnabled,
                                onOverrideChanged: (enabled) {
                                  setState(() => _overrideEnabled = enabled);
                                },
                                onTotalChanged: () => setState(() {}),
                              ),
                              const SizedBox(height: AppSpacing.sectionGap),
                              const SectionLabel(title: 'ADMIN NOTES'),
                              const SizedBox(height: AppSpacing.labelGap),
                              TextField(
                                key: const Key('admin-review-invoice-notes'),
                                controller: _notesController,
                                enabled: editingEnabled,
                                minLines: 2,
                                maxLines: 4,
                                decoration: const InputDecoration(
                                  hintText: 'Optional internal notes',
                                ),
                              ),
                              const SizedBox(height: AppSpacing.sectionGap),
                              SectionLabel(
                                title: 'LINE ITEMS',
                                actionLabel: editingEnabled ? 'Add item' : null,
                                onAction: editingEnabled ? _addLineItem : null,
                              ),
                              const SizedBox(height: AppSpacing.labelGap),
                              if (_items.isEmpty)
                                const LedgerRowEmpty(
                                  key: Key('admin-review-invoice-no-items'),
                                  message: 'No line items',
                                )
                              else
                                for (var index = 0;
                                    index < _items.length;
                                    index++) ...[
                                  _LineItemCard(
                                    key: ObjectKey(_items[index]),
                                    index: index,
                                    item: _items[index],
                                    currency: _currency,
                                    enabled: editingEnabled,
                                    onChanged: () => setState(() {}),
                                    onRemove: () => _removeLineItem(index),
                                  ),
                                  if (index < _items.length - 1)
                                    const SizedBox(height: AppSpacing.sm),
                                ],
                            ],
                          ),
                        ),
                      ),
                      _CreateFooter(
                        isBusy: _isSaving,
                        onCreate: _save,
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

class _FinalTotalCard extends StatelessWidget {
  const _FinalTotalCard({
    required this.totalLabel,
    required this.lineItemCount,
  });

  final String totalLabel;
  final int lineItemCount;

  @override
  Widget build(BuildContext context) {
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
                  'FINAL TOTAL',
                  style: AppText.body(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.muted,
                  ).copyWith(letterSpacing: 1.2),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  totalLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.display(fontSize: 30),
                ),
              ],
            ),
          ),
          StatusPill(
            label: '$lineItemCount ${lineItemCount == 1 ? 'ITEM' : 'ITEMS'}',
            tone: StatusTone.info,
          ),
        ],
      ),
    );
  }
}

class _InvoiceDetailsCard extends StatelessWidget {
  const _InvoiceDetailsCard({
    required this.parentName,
    required this.parentEmail,
    required this.weeks,
    required this.dueDate,
  });

  final String parentName;
  final String parentEmail;
  final int weeks;
  final DateTime dueDate;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        children: [
          _SummaryRow(
            icon: Icons.person_outline_rounded,
            label: parentName,
            value: parentEmail,
          ),
          const Divider(height: AppSpacing.xl),
          _SummaryRow(
            icon: Icons.calendar_today_outlined,
            label: '$weeks ${weeks == 1 ? 'week' : 'weeks'}',
            value: 'Due ${DateFormat('d MMM yyyy').format(dueDate)}',
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.blue),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.body(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
              if (value.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 11.5,
                    color: AppColors.muted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({
    required this.computedTotal,
    required this.lineItemsTotal,
    required this.finalTotal,
    required this.overrideEnabled,
    required this.overrideController,
    required this.overrideDelta,
    required this.enabled,
    required this.onOverrideChanged,
    required this.onTotalChanged,
  });

  final String computedTotal;
  final String lineItemsTotal;
  final String finalTotal;
  final bool overrideEnabled;
  final TextEditingController overrideController;
  final String overrideDelta;
  final bool enabled;
  final ValueChanged<bool> onOverrideChanged;
  final VoidCallback onTotalChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        children: [
          _AmountRow(label: 'System calculation', value: computedTotal),
          const SizedBox(height: AppSpacing.sm),
          _AmountRow(label: 'Edited line items', value: lineItemsTotal),
          const Divider(height: AppSpacing.xl),
          _AmountRow(label: 'Final total', value: finalTotal, strong: true),
          const SizedBox(height: AppSpacing.sm),
          SwitchListTile.adaptive(
            key: const Key('admin-review-invoice-override-toggle'),
            contentPadding: EdgeInsets.zero,
            title: Text(
              'Override final total',
              style: AppText.body(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
            subtitle: Text(
              'A matching admin adjustment is added for Xero.',
              style: AppText.body(fontSize: 11.5, color: AppColors.muted),
            ),
            value: overrideEnabled,
            onChanged: enabled ? onOverrideChanged : null,
          ),
          if (overrideEnabled) ...[
            const SizedBox(height: AppSpacing.sm),
            TextField(
              key: const Key('admin-review-invoice-override'),
              controller: overrideController,
              enabled: enabled,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Override total'),
              onChanged: (_) => onTotalChanged(),
            ),
            const SizedBox(height: AppSpacing.sm),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Admin adjustment: $overrideDelta',
                style: AppText.body(
                  fontSize: 11.5,
                  color: AppColors.blue600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AmountRow extends StatelessWidget {
  const _AmountRow({
    required this.label,
    required this.value,
    this.strong = false,
  });

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: AppText.body(
              fontSize: 12.5,
              fontWeight: strong ? FontWeight.w700 : FontWeight.w400,
              color: strong ? AppColors.ink : AppColors.muted,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          value,
          style: AppText.body(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppColors.ink,
          ),
        ),
      ],
    );
  }
}

class _LineItemCard extends StatelessWidget {
  const _LineItemCard({
    super.key,
    required this.index,
    required this.item,
    required this.currency,
    required this.enabled,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final _LineItemEditor item;
  final NumberFormat currency;
  final bool enabled;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final studentName = (item.extra['studentName'] ?? '').toString().trim();

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Item ${index + 1}',
                      style: AppText.body(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink,
                      ),
                    ),
                    if (studentName.isNotEmpty)
                      Text(
                        studentName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.body(
                          fontSize: 11.5,
                          color: AppColors.muted,
                        ),
                      ),
                  ],
                ),
              ),
              IconButton(
                key: Key('admin-review-invoice-remove-$index'),
                tooltip: 'Remove line item',
                onPressed: enabled ? onRemove : null,
                color: AppColors.danger,
                icon: const Icon(Icons.delete_outline_rounded, size: 20),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          TextField(
            key: Key('admin-review-invoice-description-$index'),
            controller: item.description,
            enabled: enabled,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Description'),
          ),
          const SizedBox(height: AppSpacing.md),
          LayoutBuilder(
            builder: (context, constraints) {
              final quantity = TextField(
                key: Key('admin-review-invoice-quantity-$index'),
                controller: item.quantity,
                enabled: enabled,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Quantity'),
                onChanged: (_) => onChanged(),
              );
              final unit = TextField(
                key: Key('admin-review-invoice-unit-$index'),
                controller: item.unitAmount,
                enabled: enabled,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(labelText: 'Unit amount'),
                onChanged: (_) => onChanged(),
              );

              if (constraints.maxWidth < 320) {
                return Column(
                  children: [
                    quantity,
                    const SizedBox(height: AppSpacing.md),
                    unit,
                  ],
                );
              }
              return Row(
                children: [
                  Expanded(child: quantity),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: unit),
                ],
              );
            },
          ),
          const SizedBox(height: AppSpacing.md),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              'Line total ${currency.format(item.lineTotal)}',
              style: AppText.body(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CreateFooter extends StatelessWidget {
  const _CreateFooter({required this.isBusy, required this.onCreate});

  final bool isBusy;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.md,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      decoration: const BoxDecoration(
        color: AppColors.paper,
        border: Border(top: BorderSide(color: AppColors.lineSoft)),
      ),
      child: FilledButton.icon(
        key: const Key('admin-review-invoice-create'),
        onPressed: isBusy ? null : onCreate,
        icon: isBusy
            ? const SizedBox(
                width: 17,
                height: 17,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2,
                ),
              )
            : const Icon(Icons.check_rounded, size: 18),
        label: Text(isBusy ? 'Creating…' : 'Create invoice'),
      ),
    );
  }
}

class _AddLineItemSheet extends StatefulWidget {
  const _AddLineItemSheet();

  @override
  State<_AddLineItemSheet> createState() => _AddLineItemSheetState();
}

class _AddLineItemSheetState extends State<_AddLineItemSheet> {
  late final TextEditingController _description;
  late final TextEditingController _quantity;
  late final TextEditingController _unitAmount;
  String? _error;

  @override
  void initState() {
    super.initState();
    _description = TextEditingController();
    _quantity = TextEditingController(text: '1');
    _unitAmount = TextEditingController(text: '0.00');
  }

  @override
  void dispose() {
    _description.dispose();
    _quantity.dispose();
    _unitAmount.dispose();
    super.dispose();
  }

  void _submit() {
    final description = _description.text.trim();
    final quantity = int.tryParse(_quantity.text.trim()) ?? 0;
    final unitAmount = double.tryParse(_unitAmount.text.trim()) ?? double.nan;

    final error = switch ((description, quantity, unitAmount)) {
      ('', _, _) => 'Enter a description.',
      (_, <= 0, _) => 'Quantity must be greater than zero.',
      (_, _, final amount) when !amount.isFinite =>
        'Enter a valid unit amount.',
      _ => null,
    };
    if (error != null) {
      setState(() => _error = error);
      return;
    }

    Navigator.of(context).pop(
      _LineItemResult(
        description: description,
        quantity: quantity,
        unitAmount: unitAmount,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppBottomSheet(
      title: 'Add line item',
      subtitle: 'Add a charge, discount or adjustment to this invoice.',
      footer: SheetActions(
        confirmLabel: 'Add item',
        onConfirm: _submit,
        onCancel: () => Navigator.of(context).pop(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_error != null) ...[
            Container(
              key: const Key('admin-review-add-item-error'),
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(AppRadii.sm),
              ),
              child: Text(
                _error!,
                style: AppText.body(
                  fontSize: 12.5,
                  color: AppColors.danger,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          TextField(
            key: const Key('admin-review-add-item-description'),
            controller: _description,
            autofocus: true,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Description'),
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
          ),
          const SizedBox(height: AppSpacing.md),
          LayoutBuilder(
            builder: (context, constraints) {
              final quantity = TextField(
                key: const Key('admin-review-add-item-quantity'),
                controller: _quantity,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Quantity'),
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              );
              final unit = TextField(
                key: const Key('admin-review-add-item-unit'),
                controller: _unitAmount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(labelText: 'Unit amount'),
                onSubmitted: (_) => _submit(),
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
              );

              if (constraints.maxWidth < 320) {
                return Column(
                  children: [
                    quantity,
                    const SizedBox(height: AppSpacing.md),
                    unit,
                  ],
                );
              }
              return Row(
                children: [
                  Expanded(child: quantity),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: unit),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
