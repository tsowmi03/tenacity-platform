import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../controllers/invoice_controller.dart';
import '../models/invoice_draft_model.dart';

class AdminReviewInvoiceScreen extends StatefulWidget {
  const AdminReviewInvoiceScreen({super.key, required this.initialDraft});

  final InvoiceDraft initialDraft;

  @override
  State<AdminReviewInvoiceScreen> createState() =>
      _AdminReviewInvoiceScreenState();
}

class _LineItemEditor {
  _LineItemEditor({required Map<String, dynamic> initial})
      : extra = Map<String, dynamic>.from(initial)
          ..remove('description')
          ..remove('quantity')
          ..remove('unitAmount')
          ..remove('lineTotal'),
        description = TextEditingController(
            text: (initial['description'] ?? '').toString()),
        quantity = TextEditingController(
            text: ((initial['quantity'] as num?)?.toInt() ?? 1).toString()),
        unitAmount = TextEditingController(
            text: ((initial['unitAmount'] as num?)?.toDouble() ?? 0)
                .toStringAsFixed(2));

  final Map<String, dynamic> extra;
  final TextEditingController description;
  final TextEditingController quantity;
  final TextEditingController unitAmount;

  void dispose() {
    description.dispose();
    quantity.dispose();
    unitAmount.dispose();
  }

  int get parsedQuantity => int.tryParse(quantity.text.trim()) ?? 0;

  double get parsedUnitAmount => double.tryParse(unitAmount.text.trim()) ?? 0.0;

  double get lineTotal => parsedQuantity * parsedUnitAmount;

  Map<String, dynamic> toLineItemMap() {
    return {
      ...extra,
      'description': description.text.trim(),
      'quantity': parsedQuantity,
      'unitAmount': parsedUnitAmount,
      'lineTotal': lineTotal,
    };
  }
}

class _AdminReviewInvoiceScreenState extends State<AdminReviewInvoiceScreen> {
  late final NumberFormat _currency;

  late List<_LineItemEditor> _items;

  bool _overrideEnabled = false;
  late final TextEditingController _overrideController;

  late final TextEditingController _notesController;

  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _currency = NumberFormat.currency(locale: 'en_AU', symbol: r'$');

    _items = widget.initialDraft.lineItems
        .map((li) => _LineItemEditor(initial: li))
        .toList();

    _overrideEnabled = widget.initialDraft.overrideTotal != null;
    _overrideController = TextEditingController(
      text: (widget.initialDraft.overrideTotal ?? 0.0).toStringAsFixed(2),
    );

    _notesController =
        TextEditingController(text: widget.initialDraft.adminNotes ?? '');
  }

  @override
  void dispose() {
    for (final item in _items) {
      item.dispose();
    }
    _overrideController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  double get _lineItemsTotal {
    return _items.fold<double>(0.0, (sum, item) => sum + item.lineTotal);
  }

  double? get _overrideTotal {
    if (!_overrideEnabled) return null;
    return double.tryParse(_overrideController.text.trim());
  }

  double get _finalTotal => _overrideTotal ?? _lineItemsTotal;

  double get _overrideDelta {
    final override = _overrideTotal;
    if (override == null) return 0.0;
    return override - _lineItemsTotal;
  }

  Future<void> _addLineItemDialog() async {
    final desc = TextEditingController();
    final qty = TextEditingController(text: '1');
    final unit = TextEditingController(text: '0.00');

    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Add line item'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: desc,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: qty,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Quantity',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: unit,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Unit amount',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Add'),
            ),
          ],
        );
      },
    );

    if (result == true) {
      final li = {
        'description': desc.text.trim(),
        'quantity': int.tryParse(qty.text.trim()) ?? 1,
        'unitAmount': double.tryParse(unit.text.trim()) ?? 0.0,
      };

      setState(() {
        _items.add(_LineItemEditor(initial: li));
      });
    }

    desc.dispose();
    qty.dispose();
    unit.dispose();
  }

  Future<void> _save() async {
    if (_items.isEmpty) {
      _showSnackBar('Add at least one line item.');
      return;
    }

    for (final item in _items) {
      if (item.description.text.trim().isEmpty) {
        _showSnackBar('All line items must have a description.');
        return;
      }
      if (item.parsedQuantity <= 0) {
        _showSnackBar('All line items must have quantity > 0.');
        return;
      }
    }

    final override = _overrideTotal;
    if (_overrideEnabled) {
      if (override == null) {
        _showSnackBar('Enter a valid override total.');
        return;
      }
      if (override < 0) {
        _showSnackBar('Override total cannot be negative.');
        return;
      }
    }

    setState(() {
      _isSaving = true;
    });

    try {
      final draft = widget.initialDraft.copyWith(
        lineItems: _items.map((e) => e.toLineItemMap()).toList(),
        overrideTotal: _overrideEnabled ? override : null,
        adminNotes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      );

      final controller = context.read<InvoiceController>();
      await controller.createInvoiceFromDraft(draft);

      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      _showSnackBar('Failed to create invoice: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.initialDraft;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Review Invoice'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _save,
            child: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Create'),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      draft.parentName,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(draft.parentEmail),
                    const SizedBox(height: 8),
                    Text('Weeks: ${draft.weeks}'),
                    Text(
                      'Due: ${DateFormat('dd MMM yyyy').format(draft.dueDate)}',
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        'Computed total: ${_currency.format(draft.computedTotal)}'),
                    const SizedBox(height: 4),
                    Text(
                        'Current line items total: ${_currency.format(_lineItemsTotal)}'),
                    const Divider(height: 20),
                    Text(
                      'Final total: ${_currency.format(_finalTotal)}',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Override final total'),
                      value: _overrideEnabled,
                      onChanged: (v) {
                        setState(() {
                          _overrideEnabled = v;
                        });
                      },
                    ),
                    if (_overrideEnabled)
                      Column(
                        children: [
                          TextField(
                            controller: _overrideController,
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            decoration: const InputDecoration(
                              labelText: 'Override total',
                              border: OutlineInputBorder(),
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'An "Admin adjustment" line will be added: ${_currency.format(_overrideDelta)}',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.secondary,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesController,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Admin notes (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Line items',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                TextButton.icon(
                  onPressed: _isSaving ? null : _addLineItemDialog,
                  icon: const Icon(Icons.add),
                  label: const Text('Add'),
                )
              ],
            ),
            const SizedBox(height: 8),
            ..._items.asMap().entries.map((entry) {
              final index = entry.key;
              final item = entry.value;

              final studentName = (item.extra['studentName'] ?? '').toString();
              final subtitle = studentName.trim().isEmpty
                  ? null
                  : Text('Student: $studentName');

              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Item ${index + 1}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          IconButton(
                            tooltip: 'Remove',
                            onPressed: _isSaving
                                ? null
                                : () {
                                    setState(() {
                                      item.dispose();
                                      _items.removeAt(index);
                                    });
                                  },
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                      if (subtitle != null) subtitle,
                      const SizedBox(height: 8),
                      TextField(
                        controller: item.description,
                        decoration: const InputDecoration(
                          labelText: 'Description',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: item.quantity,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: 'Quantity',
                                border: OutlineInputBorder(),
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: item.unitAmount,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              decoration: const InputDecoration(
                                labelText: 'Unit amount',
                                border: OutlineInputBorder(),
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Line total: ${_currency.format(item.lineTotal)}',
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
