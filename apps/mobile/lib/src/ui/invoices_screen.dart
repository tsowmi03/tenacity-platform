import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:url_launcher/url_launcher.dart';

import '../controllers/connectivity_controller.dart';
import '../controllers/invoice_controller.dart';
import '../models/invoice_model.dart';
import '../helpers/offline_action_guard.dart';
import '../services/payment_verification_result.dart';
import '../widgets/offline_cached_data_notice.dart';
import 'components/components.dart';
import 'invoices/parent_invoices_data.dart';
import 'theme/design_tokens.dart';

abstract interface class ParentInvoicePaymentSheet {
  Future<void> prepare(String clientSecret);
  Future<void> present();
}

class StripeParentInvoicePaymentSheet implements ParentInvoicePaymentSheet {
  const StripeParentInvoicePaymentSheet();

  @override
  Future<void> prepare(String clientSecret) {
    return Stripe.instance.initPaymentSheet(
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

  @override
  Future<void> present() => Stripe.instance.presentPaymentSheet();
}

typedef ParentInvoiceUriLauncher = Future<bool> Function(Uri uri);

Future<bool> _launchParentInvoiceUri(Uri uri) {
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// A parent's billing screen: what is owed, how to settle it, and what has
/// already been paid.
class InvoicesScreen extends StatefulWidget {
  final String parentId;
  final ParentInvoicePaymentSheet paymentSheet;
  final ParentInvoiceUriLauncher openExternalUri;
  final DateTime Function() now;

  const InvoicesScreen({
    super.key,
    required this.parentId,
    ParentInvoicePaymentSheet? paymentSheet,
    ParentInvoiceUriLauncher? openExternalUri,
    DateTime Function()? now,
  })  : paymentSheet = paymentSheet ?? const StripeParentInvoicePaymentSheet(),
        openExternalUri = openExternalUri ?? _launchParentInvoiceUri,
        now = now ?? DateTime.now;

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  bool _isProcessingPayment = false;
  bool _isVerifyingPayment = false;
  Set<String> _activePaymentInvoiceIds = const {};
  _PendingInvoicePayment? _pendingPayment;
  _InvoiceFeedback? _feedback;

  // Cache PaymentIntent client secrets so retries/cancels don't create
  // duplicates.
  String? _payAllClientSecret;
  String? _payAllKey;
  final Map<String, String> _payNowClientSecretCache = {};

  // PDF requests are cached and coalesced so rebuilds and repeated taps do not
  // ask the backend to generate the same document more than once.
  final Map<String, String> _pdfUrlCache = {};
  final Map<String, Future<String>> _pdfUrlRequests = {};
  String? _openingPdfInvoiceId;
  String? _scheduledPdfPrefetchKey;
  bool _paymentReconciliationScheduled = false;
  int _scopeGeneration = 0;

  /// Set once the parent asks to see settled invoices beyond the recent few.
  bool _showAllHistory = false;

  @override
  void initState() {
    super.initState();
    _scheduleInvoiceListener();
  }

  @override
  void didUpdateWidget(covariant InvoicesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.parentId == widget.parentId) return;

    _scopeGeneration++;
    _payAllClientSecret = null;
    _payAllKey = null;
    _payNowClientSecretCache.clear();
    _pdfUrlCache.clear();
    _pdfUrlRequests.clear();
    _pendingPayment = null;
    _feedback = null;
    _isProcessingPayment = false;
    _isVerifyingPayment = false;
    _activePaymentInvoiceIds = const {};
    _openingPdfInvoiceId = null;
    _showAllHistory = false;
    _scheduledPdfPrefetchKey = null;
    _paymentReconciliationScheduled = false;
    _scheduleInvoiceListener();
  }

  void _scheduleInvoiceListener() {
    final parentId = widget.parentId;
    final generation = _scopeGeneration;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_isCurrentScope(generation)) return;
      context.read<InvoiceController>().listenToInvoicesForParent(parentId);
    });
  }

  bool _isCurrentScope(int generation) {
    return mounted && generation == _scopeGeneration;
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

  Future<String> _getPdfUrl(String invoiceId) {
    final cached = _pdfUrlCache[invoiceId];
    if (cached != null) return Future.value(cached);

    final inFlight = _pdfUrlRequests[invoiceId];
    if (inFlight != null) return inFlight;

    final parentId = widget.parentId;
    late final Future<String> request;
    request = context
        .read<InvoiceController>()
        .fetchInvoicePdf(invoiceId)
        .then((url) {
      if (mounted && widget.parentId == parentId) {
        _pdfUrlCache[invoiceId] = url;
      }
      return url;
    }).whenComplete(() {
      if (identical(_pdfUrlRequests[invoiceId], request)) {
        _pdfUrlRequests.remove(invoiceId);
      }
    });
    _pdfUrlRequests[invoiceId] = request;
    return request;
  }

  void _schedulePdfPrefetch(List<Invoice> invoices, {required bool isOnline}) {
    if (!isOnline || invoices.isEmpty) return;

    final invoiceIds = invoices.map((invoice) => invoice.id).toList()..sort();
    final key = invoiceIds.join('|');
    if (_scheduledPdfPrefetchKey == key) return;
    _scheduledPdfPrefetchKey = key;
    final generation = _scopeGeneration;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_isCurrentScope(generation) ||
          !context.read<ConnectivityController>().isOnline ||
          _scheduledPdfPrefetchKey != key) {
        return;
      }
      for (final invoiceId in invoiceIds) {
        unawaited(_getPdfUrl(invoiceId).catchError((Object _) => ''));
      }
    });
  }

  Future<void> _payAll({
    required double outstandingAmount,
    required List<Invoice> unpaidInvoices,
  }) async {
    final generation = _scopeGeneration;
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'pay invoices',
    )) {
      return;
    }
    if (!_isCurrentScope(generation)) return;

    await _runPayment(
      invoiceIds: unpaidInvoices.map((invoice) => invoice.id).toSet(),
      getClientSecret: () => _getOrCreatePayAllClientSecret(
        outstandingAmount: outstandingAmount,
        unpaidInvoices: unpaidInvoices,
      ),
    );
  }

  Future<void> _payInvoice(Invoice invoice) async {
    final generation = _scopeGeneration;
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'pay this invoice',
    )) {
      return;
    }
    if (!_isCurrentScope(generation)) return;

    await _runPayment(
      invoiceIds: {invoice.id},
      getClientSecret: () async {
        final cents = (invoice.amountDue * 100).round();
        final key = '${invoice.id}|${widget.parentId}|aud|$cents';
        final paymentController = context.read<InvoiceController>();

        final cached = _payNowClientSecretCache[key];
        final clientSecret = cached ??
            await paymentController.initiatePaymentForInvoice(
              invoiceId: invoice.id,
              parentId: widget.parentId,
              amount: invoice.amountDue,
              currency: 'aud',
            );
        _payNowClientSecretCache[key] = clientSecret;
        return clientSecret;
      },
    );
  }

  Future<void> _runPayment({
    required Set<String> invoiceIds,
    required Future<String> Function() getClientSecret,
  }) async {
    if (_isProcessingPayment || _pendingPayment != null || invoiceIds.isEmpty) {
      return;
    }
    final generation = _scopeGeneration;

    setState(() {
      _isProcessingPayment = true;
      _activePaymentInvoiceIds = invoiceIds;
      _feedback = null;
    });

    try {
      final clientSecret = await getClientSecret();
      if (!_isCurrentScope(generation)) return;
      await widget.paymentSheet.prepare(clientSecret);
      if (!_isCurrentScope(generation)) return;
      await widget.paymentSheet.present();

      if (!_isCurrentScope(generation)) return;

      setState(() {
        _pendingPayment = _PendingInvoicePayment(
          clientSecret: clientSecret,
          invoiceIds: invoiceIds,
        );
        _feedback = const _InvoiceFeedback(
          tone: _InvoiceFeedbackTone.info,
          title: 'Confirming your payment',
          message: 'Keep this screen open while we check the receipt.',
        );
      });
      await _verifyPendingPayment();
    } on StripeException catch (error) {
      if (!_isCurrentScope(generation)) return;
      final canceled = error.error.code == FailureCode.Canceled;
      setState(() {
        _feedback = canceled
            ? const _InvoiceFeedback(
                tone: _InvoiceFeedbackTone.neutral,
                title: 'Payment cancelled',
                message: 'No charge was made. You can pay when you are ready.',
              )
            : const _InvoiceFeedback(
                tone: _InvoiceFeedbackTone.error,
                title: 'Payment could not be started',
                message:
                    'Your invoices are unchanged. Check your details and try again.',
              );
      });
    } catch (error) {
      debugPrint('Payment failed: ${error.toString()}');
      if (!_isCurrentScope(generation)) return;
      setState(() {
        _feedback = const _InvoiceFeedback(
          tone: _InvoiceFeedbackTone.error,
          title: 'Payment could not be started',
          message:
              'Your invoices are unchanged. Check your connection and try again.',
        );
      });
    } finally {
      if (_isCurrentScope(generation)) {
        setState(() {
          _isProcessingPayment = false;
          _activePaymentInvoiceIds = const {};
        });
      }
    }
  }

  Future<void> _verifyPendingPayment() async {
    final pending = _pendingPayment;
    if (pending == null || _isVerifyingPayment) return;
    final generation = _scopeGeneration;

    setState(() {
      _isVerifyingPayment = true;
      _feedback = const _InvoiceFeedback(
        tone: _InvoiceFeedbackTone.info,
        title: 'Confirming your payment',
        message: 'Keep this screen open while we check the receipt.',
      );
    });

    try {
      final verification = await context
          .read<InvoiceController>()
          .verifyPaymentStatus(pending.clientSecret);
      if (!_isCurrentScope(generation) ||
          !identical(_pendingPayment, pending)) {
        return;
      }

      setState(() {
        // A payment the server says never went through is a different thing
        // from one we could not ask about, and telling them apart is new — the
        // old bool collapsed both into "still confirming".
        _feedback = switch (verification.outcome) {
          PaymentVerificationOutcome.succeeded => const _InvoiceFeedback(
              tone: _InvoiceFeedbackTone.success,
              title: 'Payment received',
              message:
                  'Your invoice list will update as soon as the receipt is recorded.',
            ),
          PaymentVerificationOutcome.notSucceeded => const _InvoiceFeedback(
              tone: _InvoiceFeedbackTone.error,
              title: 'Payment was not completed',
              message:
                  'You have not been charged and your invoices are unchanged. '
                  'Check your card details and try again.',
            ),
          PaymentVerificationOutcome.pending ||
          PaymentVerificationOutcome.unavailable =>
            const _InvoiceFeedback(
              tone: _InvoiceFeedbackTone.warning,
              title: 'We are still confirming your payment',
              message:
                  'Do not pay these invoices again. Check the payment status in a moment.',
              action: _InvoiceFeedbackAction.checkPayment,
            ),
        };
      });
    } catch (error) {
      debugPrint('Payment verification failed: $error');
      if (!_isCurrentScope(generation) ||
          !identical(_pendingPayment, pending)) {
        return;
      }
      setState(() {
        _feedback = const _InvoiceFeedback(
          tone: _InvoiceFeedbackTone.warning,
          title: 'We are still confirming your payment',
          message:
              'Do not pay these invoices again. Check the payment status in a moment.',
          action: _InvoiceFeedbackAction.checkPayment,
        );
      });
    } finally {
      if (_isCurrentScope(generation) && identical(_pendingPayment, pending)) {
        setState(() => _isVerifyingPayment = false);
      }
    }
  }

  void _schedulePaymentReconciliation(List<Invoice> invoices) {
    final pending = _pendingPayment;
    if (pending == null || _paymentReconciliationScheduled) return;

    final byId = {for (final invoice in invoices) invoice.id: invoice};
    final isRecorded = pending.invoiceIds.every(
      (invoiceId) => byId[invoiceId]?.status == InvoiceStatus.paid,
    );
    if (!isRecorded) return;

    _paymentReconciliationScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _paymentReconciliationScheduled = false;
      if (!mounted || !identical(_pendingPayment, pending)) return;
      setState(() {
        _pendingPayment = null;
        _feedback = const _InvoiceFeedback(
          tone: _InvoiceFeedbackTone.success,
          title: 'Payment received',
          message: 'Your paid invoices are now in History.',
        );
      });
      _payNowClientSecretCache.removeWhere(
        (key, _) => pending.invoiceIds.any((id) => key.startsWith('$id|')),
      );
      if (pending.invoiceIds.length > 1) {
        _payAllClientSecret = null;
        _payAllKey = null;
      }
    });
  }

  Future<void> _openPdf(String invoiceId) async {
    if (_openingPdfInvoiceId != null) return;
    final generation = _scopeGeneration;

    try {
      if (!await OfflineActionGuard.ensureOnline(
        context,
        action: 'open this invoice PDF',
      )) {
        return;
      }
      if (!_isCurrentScope(generation)) return;

      setState(() {
        _openingPdfInvoiceId = invoiceId;
        _feedback = null;
      });

      final pdfUrl = await _getPdfUrl(invoiceId);
      if (!_isCurrentScope(generation)) return;
      final pdfUri = Uri.tryParse(pdfUrl);
      final opened = pdfUri != null &&
          (pdfUri.scheme == 'https' || pdfUri.scheme == 'http') &&
          await widget.openExternalUri(pdfUri);
      if (!opened && _isCurrentScope(generation)) _showPdfError();
    } catch (error) {
      if (!_isCurrentScope(generation)) return;
      _showPdfError();
    } finally {
      if (_isCurrentScope(generation) && _openingPdfInvoiceId == invoiceId) {
        setState(() => _openingPdfInvoiceId = null);
      }
    }
  }

  void _showPdfError() {
    setState(() {
      _feedback = const _InvoiceFeedback(
        tone: _InvoiceFeedbackTone.error,
        title: 'Invoice PDF unavailable',
        message: 'The document could not be opened. Please try again.',
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final invoiceController = context.watch<InvoiceController>();
    final invoices = invoiceController.invoices;
    final isOnline = context.watch<ConnectivityController>().isOnline;
    _schedulePdfPrefetch(invoices, isOnline: isOnline);
    _schedulePaymentReconciliation(invoices);

    final data = buildParentInvoicesViewData(
      invoices: invoices,
      now: widget.now(),
      historyLimit: _showAllHistory ? invoices.length : 3,
    );
    final unpaidInvoices =
        invoices.where((i) => i.status != InvoiceStatus.paid).toList();
    final paymentBusy = _isProcessingPayment || _isVerifyingPayment;
    final pendingInvoiceIds = _pendingPayment?.invoiceIds ?? const <String>{};
    final loadError = invoiceController.invoiceLoadError;

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
                busy: paymentBusy || _pendingPayment != null,
                payAllLabel: _activePaymentInvoiceIds.length > 1
                    ? 'Opening payment…'
                    : data.payAllLabel,
                onPayAll: () => _payAll(
                  outstandingAmount: data.outstandingAmount,
                  unpaidInvoices: unpaidInvoices,
                ),
              ),
              Expanded(
                child: ContentSheet(
                  scrollKey: const Key('parent-invoices-scroll'),
                  children: [
                    if (_feedback != null) ...[
                      _InvoiceFeedbackCard(
                        feedback: _feedback!,
                        actionBusy: _isVerifyingPayment,
                        onAction: _feedback!.action ==
                                _InvoiceFeedbackAction.checkPayment
                            ? _verifyPendingPayment
                            : null,
                        onDismiss:
                            _isVerifyingPayment || _pendingPayment != null
                                ? null
                                : () => setState(() => _feedback = null),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                    ],
                    if (invoiceController.isLoading)
                      const _InvoiceLoadingState()
                    else if (loadError != null)
                      ErrorStateView(
                        title: 'Invoices could not be loaded',
                        message: loadError,
                        onRetry: _scheduleInvoiceListener,
                      )
                    else if (data.isEmpty)
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
                            payLabel: _activePaymentInvoiceIds.contains(
                              row.invoiceId,
                            )
                                ? 'Opening payment…'
                                : pendingInvoiceIds.contains(row.invoiceId)
                                    ? 'Confirming…'
                                    : 'Pay now',
                            payBusy: _activePaymentInvoiceIds.contains(
                                  row.invoiceId,
                                ) ||
                                pendingInvoiceIds.contains(row.invoiceId),
                            pdfBusy: _openingPdfInvoiceId == row.invoiceId,
                            payDisabled: paymentBusy || _pendingPayment != null,
                            pdfDisabled: _openingPdfInvoiceId != null,
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
                            pdfBusy: _openingPdfInvoiceId ==
                                data.history[i].invoiceId,
                            actionsDisabled: _openingPdfInvoiceId != null,
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

enum _InvoiceFeedbackTone { neutral, info, success, warning, error }

enum _InvoiceFeedbackAction { none, checkPayment }

@immutable
class _InvoiceFeedback {
  final _InvoiceFeedbackTone tone;
  final String title;
  final String message;
  final _InvoiceFeedbackAction action;

  const _InvoiceFeedback({
    required this.tone,
    required this.title,
    required this.message,
    this.action = _InvoiceFeedbackAction.none,
  });
}

@immutable
class _PendingInvoicePayment {
  final String clientSecret;
  final Set<String> invoiceIds;

  const _PendingInvoicePayment({
    required this.clientSecret,
    required this.invoiceIds,
  });
}

class _InvoiceFeedbackCard extends StatelessWidget {
  final _InvoiceFeedback feedback;
  final bool actionBusy;
  final VoidCallback? onAction;
  final VoidCallback? onDismiss;

  const _InvoiceFeedbackCard({
    required this.feedback,
    required this.actionBusy,
    required this.onAction,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final (foreground, background, icon) = switch (feedback.tone) {
      _InvoiceFeedbackTone.neutral => (
          AppColors.muted,
          AppColors.skeleton.withValues(alpha: 0.65),
          Icons.info_outline_rounded,
        ),
      _InvoiceFeedbackTone.info => (
          AppColors.blue,
          AppColors.blue50,
          Icons.hourglass_top_rounded,
        ),
      _InvoiceFeedbackTone.success => (
          AppColors.success,
          AppColors.successSurface,
          Icons.check_circle_outline_rounded,
        ),
      _InvoiceFeedbackTone.warning => (
          AppColors.warning,
          AppColors.warning.withValues(alpha: 0.1),
          Icons.schedule_rounded,
        ),
      _InvoiceFeedbackTone.error => (
          AppColors.danger,
          AppColors.danger.withValues(alpha: 0.08),
          Icons.error_outline_rounded,
        ),
    };

    return Container(
      key: const Key('parent-invoice-feedback'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: foreground.withValues(alpha: 0.2)),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xxs),
            child: Icon(icon, size: 20, color: foreground),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  feedback.title,
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  feedback.message,
                  style: AppText.body(
                    fontSize: 12.5,
                    color: AppColors.text,
                  ).copyWith(height: 1.4),
                ),
                if (onAction != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  TextButton(
                    key: const Key('parent-invoice-feedback-action'),
                    onPressed: actionBusy ? null : onAction,
                    style: TextButton.styleFrom(
                      foregroundColor: foreground,
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(
                        AppSizes.minTouchTarget,
                        AppSizes.minTouchTarget,
                      ),
                      alignment: Alignment.centerLeft,
                    ),
                    child: Text(
                      actionBusy ? 'Checking…' : 'Check again',
                      style: AppText.body(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: foreground,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (onDismiss != null)
            IconButton(
              key: const Key('parent-invoice-feedback-dismiss'),
              onPressed: onDismiss,
              tooltip: 'Dismiss',
              icon: const Icon(Icons.close_rounded),
              color: AppColors.muted,
              iconSize: 18,
              visualDensity: VisualDensity.compact,
            ),
        ],
      ),
    );
  }
}

class _InvoiceLoadingState extends StatelessWidget {
  const _InvoiceLoadingState();

  @override
  Widget build(BuildContext context) {
    return const Column(
      key: Key('parent-invoices-loading'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionLabel(title: 'UNPAID'),
        SizedBox(height: AppSpacing.labelGap),
        SkeletonBlock(height: 146),
        SizedBox(height: AppSpacing.lg),
        SkeletonBlock(height: 78),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  final ParentInvoicesViewData data;
  final bool busy;
  final String payAllLabel;
  final VoidCallback onPayAll;

  const _Header({
    required this.data,
    required this.busy,
    required this.payAllLabel,
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
              label: payAllLabel,
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
  final String payLabel;
  final bool payBusy;
  final bool pdfBusy;
  final bool payDisabled;
  final bool pdfDisabled;
  final VoidCallback onPay;
  final VoidCallback onOpenPdf;

  const _UnpaidCard({
    required this.row,
    required this.payLabel,
    required this.payBusy,
    required this.pdfBusy,
    required this.payDisabled,
    required this.pdfDisabled,
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
                            onPressed: payDisabled ? null : onPay,
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.blue,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              textStyle: AppText.body(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (payBusy) ...[
                                  const SizedBox.square(
                                    dimension: 14,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: AppSpacing.sm),
                                ],
                                Flexible(
                                  child: Text(
                                    payLabel,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.labelGap),
                        OutlinedButton.icon(
                          key: Key('parent-invoice-pdf-${row.invoiceId}'),
                          onPressed: pdfDisabled ? null : onOpenPdf,
                          icon: pdfBusy
                              ? const SizedBox.square(
                                  dimension: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(
                                  Icons.description_outlined,
                                  size: 15,
                                ),
                          label: Text(pdfBusy ? 'Opening' : 'PDF'),
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
  final bool pdfBusy;
  final bool actionsDisabled;
  final VoidCallback onOpenPdf;

  const _HistoryRow({
    required this.row,
    required this.showDivider,
    required this.pdfBusy,
    required this.actionsDisabled,
    required this.onOpenPdf,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        key: Key('parent-invoice-history-${row.invoiceId}'),
        onTap: actionsDisabled ? null : onOpenPdf,
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
              const SizedBox(width: AppSpacing.sm),
              if (pdfBusy)
                const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                const Icon(
                  Icons.description_outlined,
                  size: 17,
                  color: AppColors.muted,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
