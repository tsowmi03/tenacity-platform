import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_invoice_console_data.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_invoice_console_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

typedef AdminInvoiceUriLauncher = Future<bool> Function(Uri uri);

Future<bool> _launchAdminInvoiceUri(Uri uri) async {
  if (!await canLaunchUrl(uri)) return false;
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// The complete admin invoice console.
///
/// The billing destination shows the concise A06 summary. This pushed screen
/// retains the operational surface behind it: search, status filtering,
/// sorting, multi-select, bulk status/deletion actions, invoice details, PDF
/// retrieval and invoice creation.
class AdminInvoiceView extends StatefulWidget {
  const AdminInvoiceView({
    super.key,
    this.openExternalUri = _launchAdminInvoiceUri,
  });

  final AdminInvoiceUriLauncher openExternalUri;

  @override
  State<AdminInvoiceView> createState() => _AdminInvoiceViewState();
}

class _AdminInvoiceViewState extends State<AdminInvoiceView> {
  AdminInvoiceFilter _filter = AdminInvoiceFilter.all;
  AdminInvoiceSort _sort = AdminInvoiceSort.dueDate;
  bool _sortAscending = true;
  String _searchQuery = '';

  List<Invoice> _invoices = const [];
  final Set<String> _selectedInvoiceIds = {};

  bool _isLoading = true;
  bool _isBusy = false;
  bool _isSelectionMode = false;
  String? _errorMessage;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadInvoices();
    });
  }

  Future<void> _loadInvoices() async {
    final generation = ++_loadGeneration;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final invoices = await context.read<InvoiceController>().getAllInvoices();
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _invoices = invoices;
        _selectedInvoiceIds.removeWhere(
          (id) => !invoices.any((invoice) => invoice.id == id),
        );
        if (_selectedInvoiceIds.isEmpty) _isSelectionMode = false;
        _isLoading = false;
      });
    } catch (error, stackTrace) {
      if (!mounted || generation != _loadGeneration) return;
      // Shown under the console's "We couldn't load invoices" heading, so the
      // reason alone.
      final presented = presentError(
        error,
        action: 'load the invoices',
        operation: Operation.read,
        stackTrace: stackTrace,
      );
      setState(() {
        _isLoading = false;
        _errorMessage = presented.reason;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = buildAdminInvoiceConsoleData(
      invoices: _invoices,
      filter: _filter,
      sort: _sort,
      sortAscending: _sortAscending,
      searchQuery: _searchQuery,
    );

    return PopScope(
      canPop: !_isBusy && !_isSelectionMode,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop || _isBusy) return;
        if (_isSelectionMode) _exitSelectionMode();
      },
      child: Scaffold(
        backgroundColor: AppColors.ink,
        body: AdminInvoiceConsoleView(
          data: data,
          isLoading: _isLoading,
          isBusy: _isBusy,
          errorMessage: _errorMessage,
          selectedInvoiceIds: _selectedInvoiceIds,
          isSelectionMode: _isSelectionMode,
          onBack: () => Navigator.of(context).pop(),
          onRefresh: _loadInvoices,
          onRetry: _loadInvoices,
          onSearchChanged: (query) => setState(() => _searchQuery = query),
          onFilterChanged: (filter) => setState(() => _filter = filter),
          onSortChanged: (sort) => setState(() => _sort = sort),
          onSortDirectionChanged: () =>
              setState(() => _sortAscending = !_sortAscending),
          onCreateInvoice: _openCreateInvoice,
          onEnterSelectionMode: _enterSelectionMode,
          onExitSelectionMode: _exitSelectionMode,
          onToggleSelection: _toggleSelection,
          onInvoiceTapped: _showInvoiceDetails,
          onMarkSelectedPaid: _markSelectedAsPaid,
          onDeleteSelected: _deleteSelectedInvoices,
        ),
      ),
    );
  }

  Future<void> _openCreateInvoice() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AdminCreateInvoiceScreen()),
    );
    if (mounted) await _loadInvoices();
  }

  void _enterSelectionMode() {
    setState(() {
      _isSelectionMode = true;
      _selectedInvoiceIds.clear();
    });
  }

  void _exitSelectionMode() {
    setState(() {
      _isSelectionMode = false;
      _selectedInvoiceIds.clear();
    });
  }

  void _toggleSelection(String invoiceId) {
    setState(() {
      if (_selectedInvoiceIds.remove(invoiceId)) {
        if (_selectedInvoiceIds.isEmpty) _isSelectionMode = false;
      } else {
        _selectedInvoiceIds.add(invoiceId);
        _isSelectionMode = true;
      }
    });
  }

  Future<void> _showInvoiceDetails(Invoice invoice) {
    return showAdminInvoiceDetailSheet(
      context: context,
      invoice: invoice,
      onMarkPaid: _markInvoicePaid,
      onOpenPdf: _openInvoicePdf,
      onDelete: _deleteInvoice,
    );
  }

  Future<bool> _markInvoicePaid(Invoice invoice) async {
    final reference = invoiceReference(invoice);
    final confirmed = await _confirm(
      title: 'Mark invoice as paid?',
      message: '$reference for ${invoice.parentName} will be recorded as paid. '
          'This changes its status in Tenacity.',
      confirmLabel: 'Mark paid',
    );
    if (!confirmed || !mounted) return false;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'mark this invoice as paid',
    )) {
      return false;
    }
    if (!mounted) return false;

    setState(() => _isBusy = true);
    try {
      await context.read<InvoiceController>().markInvoiceAsPaid(invoice.id);
      if (!mounted) return false;
      await _loadInvoices();
      _notify('Invoice marked as paid.');
      return true;
    } catch (_) {
      _notify('The invoice could not be updated. Try again.');
      return false;
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _openInvoicePdf(Invoice invoice) async {
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'download this invoice PDF',
    )) {
      return;
    }
    if (!mounted) return;

    try {
      final url =
          await context.read<InvoiceController>().fetchInvoicePdf(invoice.id);
      if (!mounted) return;
      final uri = Uri.parse(url);
      if (!await widget.openExternalUri(uri)) {
        throw Exception('The PDF could not be opened.');
      }
    } catch (_) {
      _notify('The invoice PDF could not be opened. Try again.');
    }
  }

  Future<bool> _deleteInvoice(Invoice invoice) async {
    final reference = invoiceReference(invoice);
    final confirmed = await _confirm(
      title: 'Delete $reference?',
      message: 'This permanently deletes the invoice from Tenacity. '
          'An invoice already created in Xero is not deleted.',
      confirmLabel: 'Delete invoice',
      destructive: true,
    );
    if (!confirmed || !mounted) return false;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'delete this invoice',
    )) {
      return false;
    }
    if (!mounted) return false;

    setState(() => _isBusy = true);
    try {
      await context.read<InvoiceController>().deleteInvoice(invoice.id);
      if (!mounted) return false;
      await _loadInvoices();
      _notify('Invoice deleted.');
      return true;
    } catch (_) {
      _notify('The invoice could not be deleted. Try again.');
      return false;
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _markSelectedAsPaid() async {
    final count = _selectedInvoiceIds.length;
    if (count == 0 || _isBusy) return;

    final confirmed = await _confirm(
      title: 'Mark selected as paid?',
      message:
          '$count ${count == 1 ? 'invoice' : 'invoices'} will be recorded as '
          'paid in Tenacity.',
      confirmLabel: 'Mark paid',
    );
    if (!confirmed || !mounted) return;
    if (_isBusy) return;

    final ids = [..._selectedInvoiceIds];
    setState(() => _isBusy = true);
    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'mark invoices as paid',
      )) {
        return;
      }
      if (!mounted) return;

      final controller = context.read<InvoiceController>();
      for (final id in ids) {
        await controller.markInvoiceAsPaid(id);
      }
      if (!mounted) return;
      _exitSelectionMode();
      await _loadInvoices();
      _notify('Selected invoices marked as paid.');
    } catch (_) {
      if (mounted) {
        _exitSelectionMode();
        await _loadInvoices();
      }
      _notify('The selected invoices could not all be updated. The list was '
          'refreshed; check their status before trying again.');
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _deleteSelectedInvoices() async {
    final count = _selectedInvoiceIds.length;
    if (count == 0 || _isBusy) return;

    final confirmed = await _confirm(
      title: 'Delete selected invoices?',
      message: 'This permanently deletes $count '
          '${count == 1 ? 'invoice' : 'invoices'} from Tenacity. '
          'Invoices already created in Xero are not deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!confirmed || !mounted) return;
    if (_isBusy) return;

    final ids = [..._selectedInvoiceIds];
    setState(() => _isBusy = true);
    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'delete invoices',
      )) {
        return;
      }
      if (!mounted) return;

      final controller = context.read<InvoiceController>();
      for (final id in ids) {
        await controller.deleteInvoice(id);
      }
      if (!mounted) return;
      _exitSelectionMode();
      await _loadInvoices();
      _notify('Selected invoices deleted.');
    } catch (_) {
      if (mounted) {
        _exitSelectionMode();
        await _loadInvoices();
      }
      _notify('The selected invoices could not all be deleted. The list was '
          'refreshed; check it before trying again.');
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<bool> _confirm({
    required String title,
    required String message,
    required String confirmLabel,
    bool destructive = false,
  }) {
    return showAppConfirmationSheet(
      context: context,
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      tone: destructive
          ? AppConfirmationTone.destructive
          : AppConfirmationTone.standard,
      confirmKey: const Key('admin-invoice-confirm'),
    );
  }

  void _notify(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}
