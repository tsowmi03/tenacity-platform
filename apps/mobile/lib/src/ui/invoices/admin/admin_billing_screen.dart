import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';
import 'package:tenacity/src/ui/admin_invoice_view.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_billing_data.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_billing_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Loads billing and hands it to [AdminBillingView].
///
/// This is the summary console from the reference design. The full invoice
/// list — filter, sort, search, multi-select and bulk actions — remains
/// [AdminInvoiceView], reached through `View all invoices`, so none of that
/// behaviour is reimplemented here. The pushed console and its create/review
/// chain now use the same V3 design system.
class AdminBillingScreen extends StatefulWidget {
  const AdminBillingScreen({super.key});

  @override
  State<AdminBillingScreen> createState() => _AdminBillingScreenState();
}

class _AdminBillingScreenState extends State<AdminBillingScreen> {
  List<Invoice> _invoices = const [];
  AdminBillingFilter _filter = AdminBillingFilter.all;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final invoices = await context.read<InvoiceController>().getAllInvoices();
      if (!mounted) return;
      setState(() {
        _invoices = invoices;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = 'Check your connection and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const ColoredBox(
        color: AppColors.ink,
        child: SafeArea(
          child: Center(
            child: CircularProgressIndicator(color: AppColors.blue300),
          ),
        ),
      );
    }

    final data = buildAdminBillingViewData(
      invoices: _invoices,
      now: DateTime.now(),
      filter: _filter,
      errorMessage: _error,
    );

    return AdminBillingView(
      data: data,
      onRefresh: _load,
      onRetry: _load,
      onFilterChanged: (filter) => setState(() => _filter = filter),
      onNewInvoice: () async {
        await Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AdminCreateInvoiceScreen()),
        );
        if (mounted) await _load();
      },
      // Both the whole list and a single invoice open the existing console,
      // which is where every invoice action already lives.
      onViewAll: _openFullList,
      onInvoiceTapped: (_) => _openFullList(),
    );
  }

  Future<void> _openFullList() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AdminInvoiceView()),
    );
    if (mounted) await _load();
  }
}
