import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:url_launcher/url_launcher.dart';

import '../controllers/connectivity_controller.dart';
import '../controllers/invoice_controller.dart';
import '../models/invoice_model.dart';
import '../helpers/offline_action_guard.dart';
import '../widgets/offline_cached_data_notice.dart';
import 'components/components.dart';
import 'invoices/parent_invoices_data.dart';
import 'theme/design_tokens.dart';

/// A parent's billing screen: what is owed, how to settle it, and what has
/// already been paid.
///
/// The payment handling below — client-secret caching, in-flight guards,
/// offline guards and verification — is carried over unchanged from the
/// previous design. Only the presentation is new.
class InvoicesScreen extends StatefulWidget {
  final String parentId;
  const InvoicesScreen({super.key, required this.parentId});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  bool _isProcessingPayment = false;

  // Prevent accidental double-trigger (tap/rebuild) creating multiple intents.
  bool _isPayAllInFlight = false;
  bool _isPayNowInFlight = false;

  // Cache PaymentIntent client secrets so retries/cancels don't create
  // duplicates.
  String? _payAllClientSecret;
  String? _payAllKey;
  final Map<String, String> _payNowClientSecretCache = {};

  // PDF URL cache for prefetching
  final Map<String, String> _pdfUrlCache = {};

  /// Set once the parent asks to see settled invoices beyond the recent few.
  bool _showAllHistory = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context
          .read<InvoiceController>()
          .listenToInvoicesForParent(widget.parentId);
    });
  }

  String _makePayAllKey({
    required double outstandingAmount,
    required List<Invoice> unpaidInvoices,
  }) {
    final invoiceIds = unpaidInvoices.map((i) => i.id).toList()..sort();
    final amountCents = (outstandingAmount * 100).round();
    return '${widget.parentId}|aud|$amountCents|${invoiceIds.join(",")}';
  }

  Future<String> _getOrCreatePayAllClientSecret({
    required double outstandingAmount,
    required List<Invoice> unpaidInvoices,
  }) async {
    final key = _makePayAllKey(
      outstandingAmount: outstandingAmount,
      unpaidInvoices: unpaidInvoices,
    );

    if (_payAllKey == key && _payAllClientSecret != null) {
      return _payAllClientSecret!;
    }

    final invoiceController = context.read<InvoiceController>();
    final unpaidInvoiceIds =
        unpaidInvoices.map((invoice) => invoice.id).toList();

    final clientSecret = await invoiceController.initiatePaymentForInvoices(
      invoiceIds: unpaidInvoiceIds,
      parentId: widget.parentId,
      amount: outstandingAmount,
      currency: 'aud',
    );

    _payAllKey = key;
    _payAllClientSecret = clientSecret;
    return clientSecret;
  }

  Future<void> _initPaymentSheet(String clientSecret) async {
    await Stripe.instance.initPaymentSheet(
      paymentSheetParameters: SetupPaymentSheetParameters(
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Tenacity Tutoring',
        applePay: const PaymentSheetApplePay(
          merchantCountryCode: 'AU',
        ),
        googlePay: const PaymentSheetGooglePay(
          merchantCountryCode: 'AU',
          currencyCode: 'AUD',
          testEnv: false,
        ),
      ),
    );
  }

  // Prefetch PDF URLs for all invoices
  Future<void> _prefetchPdfUrls(List<Invoice> invoices) async {
    if (!context.read<ConnectivityController>().isOnline) return;
    final controller = context.read<InvoiceController>();
    for (final invoice in invoices) {
      if (!_pdfUrlCache.containsKey(invoice.id)) {
        try {
          final url = await controller.fetchInvoicePdf(invoice.id);
          _pdfUrlCache[invoice.id] = url;
        } catch (error) {
          // A prefetch failure is not worth surfacing; opening the PDF will
          // fetch it again and report properly if it still fails.
        }
      }
    }
  }

  Future<void> _payAll({
    required double outstandingAmount,
    required List<Invoice> unpaidInvoices,
  }) async {
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'pay invoices',
    )) {
      return;
    }
    if (!mounted) return;

    setState(() {
      _isProcessingPayment = true;
      _isPayAllInFlight = true;
    });
    final paymentController = context.read<InvoiceController>();
    try {
      final clientSecret = await _getOrCreatePayAllClientSecret(
        outstandingAmount: outstandingAmount,
        unpaidInvoices: unpaidInvoices,
      );

      await _initPaymentSheet(clientSecret);
      await Stripe.instance.presentPaymentSheet();

      if (!mounted) return;

      final isVerified =
          await paymentController.verifyPaymentStatus(clientSecret);

      if (!mounted) return;

      // The webhook marks the invoices paid, so nothing is written here.
      _showMessage(
        isVerified ? 'Payment successful!' : 'Payment could not be verified.',
      );
    } catch (error) {
      debugPrint('Payment failed: ${error.toString()}');
      if (mounted) _showMessage('Payment failed. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          _isProcessingPayment = false;
          _isPayAllInFlight = false;
        });
      }
    }
  }

  Future<void> _payInvoice(Invoice invoice) async {
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'pay this invoice',
    )) {
      return;
    }
    if (!mounted) return;

    setState(() {
      _isProcessingPayment = true;
      _isPayNowInFlight = true;
    });
    final paymentController = context.read<InvoiceController>();
    try {
      final cents = (invoice.amountDue * 100).round();
      final key = '${invoice.id}|${widget.parentId}|aud|$cents';

      final cached = _payNowClientSecretCache[key];
      final clientSecret = cached ??
          await paymentController.initiatePaymentForInvoice(
            invoiceId: invoice.id,
            parentId: widget.parentId,
            amount: invoice.amountDue,
            currency: 'aud',
          );
      _payNowClientSecretCache[key] = clientSecret;

      await _initPaymentSheet(clientSecret);
      await Stripe.instance.presentPaymentSheet();

      if (!mounted) return;

      final isVerified =
          await paymentController.verifyPaymentStatus(clientSecret);

      if (!mounted) return;

      // The webhook marks the invoice paid, so nothing is written here.
      _showMessage(
        isVerified ? 'Payment successful!' : 'Payment could not be verified.',
      );
    } catch (error) {
      debugPrint('Payment failed: ${error.toString()}');
      if (mounted) _showMessage('Payment failed. Please try again.');
    } finally {
      if (mounted) {
        setState(() {
          _isProcessingPayment = false;
          _isPayNowInFlight = false;
        });
      }
    }
  }

  Future<void> _openPdf(String invoiceId) async {
    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'open this invoice PDF',
      )) {
        return;
      }
      if (!mounted) return;

      String? pdfUrl = _pdfUrlCache[invoiceId];
      if (pdfUrl == null) {
        final fetchedUrl =
            await context.read<InvoiceController>().fetchInvoicePdf(invoiceId);
        if (!mounted) return;
        pdfUrl = fetchedUrl;
        _pdfUrlCache[invoiceId] = pdfUrl;
      }

      final pdfUri = Uri.parse(pdfUrl);
      if (await canLaunchUrl(pdfUri)) {
        await launchUrl(pdfUri);
      } else {
        if (!mounted) return;
        _showMessage('Could not open the invoice PDF.');
      }
    } catch (error) {
      if (!mounted) return;
      _showMessage('Unable to open invoice PDF');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final invoiceController = context.watch<InvoiceController>();
    final invoices = invoiceController.invoices;

    if (invoiceController.isLoading) {
      return const Scaffold(
        backgroundColor: AppColors.ink,
        body: SafeArea(
          child: Center(
            child: CircularProgressIndicator(color: AppColors.blue300),
          ),
        ),
      );
    }

    if (invoices.isNotEmpty) {
      _prefetchPdfUrls(invoices);
    }

    final data = buildParentInvoicesViewData(
      invoices: invoices,
      now: DateTime.now(),
      historyLimit: _showAllHistory ? invoices.length : 3,
    );
    final unpaidInvoices =
        invoices.where((i) => i.status != InvoiceStatus.paid).toList();
    final busy = _isProcessingPayment || _isPayAllInFlight || _isPayNowInFlight;

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: Material(
        color: AppColors.ink,
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              _Header(
                data: data,
                busy: busy,
                onPayAll: () => _payAll(
                  outstandingAmount: data.outstandingAmount,
                  unpaidInvoices: unpaidInvoices,
                ),
              ),
              Expanded(
                child: ContentSheet(
                  scrollKey: const Key('parent-invoices-scroll'),
                  children: [
                    if (data.isEmpty)
                      const OfflineAwareEmptyState(
                        emptyMessage: 'No invoices yet',
                        offlineEmptyMessage:
                            'No saved invoices available offline.',
                      )
                    else ...[
                      if (data.unpaid.isNotEmpty) ...[
                        const SectionLabel(title: 'UNPAID'),
                        const SizedBox(height: AppSpacing.labelGap),
                        for (final row in data.unpaid) ...[
                          _UnpaidCard(
                            row: row,
                            busy: busy,
                            onPay: () => _payInvoice(
                              invoices.firstWhere((i) => i.id == row.invoiceId),
                            ),
                            onOpenPdf: () => _openPdf(row.invoiceId),
                          ),
                          const SizedBox(height: 18),
                        ],
                      ],
                      if (data.history.isNotEmpty) ...[
                        const SectionLabel(title: 'HISTORY'),
                        const SizedBox(height: 6),
                        for (var i = 0; i < data.history.length; i++)
                          _HistoryRow(
                            row: data.history[i],
                            showDivider: i < data.history.length - 1,
                            onOpenPdf: () =>
                                _openPdf(data.history[i].invoiceId),
                          ),
                        if (!_showAllHistory &&
                            hasMoreHistory(invoices: invoices))
                          Center(
                            child: TextButton(
                              key: const Key('parent-invoices-view-all'),
                              onPressed: () =>
                                  setState(() => _showAllHistory = true),
                              child: const Text('View all invoices'),
                            ),
                          ),
                      ],
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final ParentInvoicesViewData data;
  final bool busy;
  final VoidCallback onPayAll;

  const _Header({
    required this.data,
    required this.busy,
    required this.onPayAll,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xs,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Image.asset(
            'lib/assets/img/Tenacity-Vertical-Logo-White.png',
            height: 28,
            alignment: Alignment.centerLeft,
            fit: BoxFit.contain,
            excludeFromSemantics: true,
            errorBuilder: (_, __, ___) => Text(
              'TENACITY',
              style: AppText.display(fontSize: 15, color: Colors.white),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            'TOTAL OUTSTANDING',
            style: AppText.body(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: AppColors.blue300,
            ).copyWith(letterSpacing: 1.68),
          ),
          const SizedBox(height: 7),
          Text(
            data.outstandingLabel,
            maxLines: 1,
            style: AppText.display(fontSize: 42, color: Colors.white)
                .copyWith(height: 1, letterSpacing: -0.42),
          ),
          const SizedBox(height: 7),
          Text(
            data.outstandingSummary,
            style: AppText.body(
              fontSize: 13,
              color: Colors.white.withValues(alpha: 0.6),
            ),
          ),
          if (data.showPayAll) ...[
            const SizedBox(height: AppSpacing.sm),
            _PayAllButton(
              label: data.payAllLabel,
              onPressed: busy ? null : onPayAll,
            ),
            const SizedBox(height: AppSpacing.xxs),
            Text(
              'Apple Pay · Google Pay · Card',
              textAlign: TextAlign.center,
              style: AppText.body(
                fontSize: 11.5,
                color: Colors.white.withValues(alpha: 0.45),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PayAllButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;

  const _PayAllButton({required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: onPressed == null ? Colors.white54 : Colors.white,
      borderRadius: BorderRadius.circular(AppRadii.pill),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: const Key('parent-invoices-pay-all'),
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 13),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: AppText.body(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: AppColors.ink,
            ),
          ),
        ),
      ),
    );
  }
}

class _UnpaidCard extends StatelessWidget {
  final ParentInvoiceRow row;
  final bool busy;
  final VoidCallback onPay;
  final VoidCallback onOpenPdf;

  const _UnpaidCard({
    required this.row,
    required this.busy,
    required this.onPay,
    required this.onOpenPdf,
  });

  @override
  Widget build(BuildContext context) {
    // Overdue is called out on the leading edge as well as in the pill.
    final accent = row.isOverdue ? AppColors.danger : AppColors.blue;

    return Container(
      key: Key('parent-invoice-${row.invoiceId}'),
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: accent),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  15,
                  AppSpacing.lg,
                  15,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                row.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.body(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.ink,
                                ),
                              ),
                              const SizedBox(height: AppSpacing.xxs),
                              Text(
                                row.subtitle,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.body(
                                  fontSize: 12.5,
                                  color: AppColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpacing.labelGap),
                        Text(
                          row.amountLabel,
                          style: AppText.display(
                            fontSize: 19,
                            color: AppColors.ink,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            key: Key('parent-invoice-pay-${row.invoiceId}'),
                            onPressed: busy ? null : onPay,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.blue,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              textStyle: AppText.body(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            child: const Text('Pay now'),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.labelGap),
                        OutlinedButton.icon(
                          key: Key('parent-invoice-pdf-${row.invoiceId}'),
                          onPressed: onOpenPdf,
                          icon: const Icon(
                            Icons.description_outlined,
                            size: 15,
                          ),
                          label: const Text('PDF'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.navy,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius:
                                  BorderRadius.circular(AppRadii.pill),
                            ),
                            textStyle: AppText.body(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                            ),
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
    );
  }
}

class _HistoryRow extends StatelessWidget {
  final ParentInvoiceRow row;
  final bool showDivider;
  final VoidCallback onOpenPdf;

  const _HistoryRow({
    required this.row,
    required this.showDivider,
    required this.onOpenPdf,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        key: Key('parent-invoice-history-${row.invoiceId}'),
        onTap: onOpenPdf,
        child: Container(
          padding: const EdgeInsets.symmetric(
            vertical: AppSpacing.md,
            horizontal: AppSpacing.xxs,
          ),
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
                      row.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      row.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Text(
                row.amountLabel,
                style: AppText.body(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.muted,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              StatusPill(
                label: row.statusLabel,
                tone: row.status == InvoiceStatus.paid
                    ? StatusTone.success
                    : StatusTone.danger,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
