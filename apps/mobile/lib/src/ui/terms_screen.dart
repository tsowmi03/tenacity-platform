import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/ui/terms/terms_reader_view.dart';
import 'package:url_launcher/url_launcher.dart';

class TermsScreen extends StatelessWidget {
  final bool requireAcceptance;
  final bool waitingForStatus;
  final String? previousVersion;

  const TermsScreen({
    super.key,
    this.requireAcceptance = true,
    this.waitingForStatus = false,
    this.previousVersion,
  });

  Future<void> _accept(BuildContext context) async {
    final authController = context.read<AuthController>();
    final termsController = context.read<TermsController>();
    final user = authController.currentUser;
    if (user == null) return;

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'accept the terms',
    )) {
      return;
    }
    if (!context.mounted) return;

    try {
      await termsController.acceptTerms(
        user.uid,
        '${user.firstName} ${user.lastName}'.trim(),
      );
    } catch (_) {
      // The controller exposes a user-safe inline error and leaves the gate in
      // place. A failed acceptance must never navigate into the app.
    }
  }

  Future<void> _openLink(BuildContext context, String rawUrl) async {
    final messenger = ScaffoldMessenger.of(context);
    final uri = Uri.tryParse(rawUrl);
    var opened = false;
    try {
      opened = uri != null &&
          await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!context.mounted || opened) return;
    messenger.showSnackBar(
      const SnackBar(content: Text('That link could not be opened.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final termsController = context.watch<TermsController>();
    final terms = termsController.currentTerms;
    final isCheckingGate = requireAcceptance &&
        (waitingForStatus || termsController.isCheckingStatus);

    if (terms == null || isCheckingGate) {
      final isLoading = isCheckingGate ||
          termsController.isLoadingTerms ||
          termsController.loadErrorMessage == null;
      return TermsGateStateView(
        isLoading: isLoading,
        errorMessage: termsController.loadErrorMessage,
        requireAcceptance: requireAcceptance,
        onBack:
            requireAcceptance ? null : () => Navigator.of(context).maybePop(),
        onRetry: termsController.loadTerms,
      );
    }

    return TermsReaderView(
      terms: terms,
      requireAcceptance: requireAcceptance,
      previousVersion: previousVersion,
      isAccepting: termsController.isAccepting,
      actionErrorMessage: termsController.actionErrorMessage,
      onBack: requireAcceptance ? null : () => Navigator.of(context).maybePop(),
      onDecline: requireAcceptance
          ? () => unawaited(context.read<AuthController>().logout())
          : null,
      onAccept: requireAcceptance ? () => _accept(context) : null,
      onOpenLink: (url) => _openLink(context, url),
    );
  }
}
