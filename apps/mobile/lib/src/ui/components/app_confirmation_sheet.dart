import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/app_bottom_sheet.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The visual weight of a decision requested by [AppConfirmationSheet].
///
/// The action label also carries the tone in semantics, so colour is not the
/// only way a destructive or cautionary decision is communicated.
enum AppConfirmationTone {
  standard,
  caution,
  destructive,
}

/// A V3 decision surface for actions that must be explicitly confirmed.
///
/// Confirmation remains separate from the work itself. The sheet returns the
/// decision, then the calling screen performs its existing online guard and
/// mutation after the modal route has closed.
class AppConfirmationSheet extends StatelessWidget {
  final String title;
  final String message;
  final String confirmLabel;
  final String cancelLabel;
  final AppConfirmationTone tone;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final Key? confirmKey;

  const AppConfirmationSheet({
    super.key,
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.onConfirm,
    required this.onCancel,
    this.cancelLabel = 'Cancel',
    this.tone = AppConfirmationTone.standard,
    this.confirmKey,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: title,
      namesRoute: true,
      scopesRoute: true,
      explicitChildNodes: true,
      child: AppBottomSheet(
        title: title,
        footer: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                key: const Key('app-confirmation-cancel'),
                onPressed: onCancel,
                child: Text(cancelLabel),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: _ConfirmationButton(
                buttonKey: confirmKey ?? const Key('app-confirmation-confirm'),
                label: confirmLabel,
                tone: tone,
                onPressed: onConfirm,
              ),
            ),
          ],
        ),
        child: Text(
          message,
          key: const Key('app-confirmation-message'),
          style: AppText.body(fontSize: 14, color: AppColors.ink)
              .copyWith(height: 1.45),
        ),
      ),
    );
  }
}

class _ConfirmationButton extends StatelessWidget {
  final Key buttonKey;
  final String label;
  final AppConfirmationTone tone;
  final VoidCallback onPressed;

  const _ConfirmationButton({
    required this.buttonKey,
    required this.label,
    required this.tone,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final semanticLabel = switch (tone) {
      AppConfirmationTone.standard => label,
      AppConfirmationTone.caution => '$label. Caution.',
      AppConfirmationTone.destructive => '$label. Destructive action.',
    };
    final style = switch (tone) {
      AppConfirmationTone.standard => null,
      AppConfirmationTone.caution => FilledButton.styleFrom(
          backgroundColor: AppColors.warning,
          foregroundColor: Colors.white,
        ),
      AppConfirmationTone.destructive => FilledButton.styleFrom(
          backgroundColor: AppColors.danger,
          foregroundColor: Colors.white,
        ),
    };

    return Semantics(
      button: true,
      enabled: true,
      label: semanticLabel,
      onTap: onPressed,
      excludeSemantics: true,
      child: FilledButton(
        key: buttonKey,
        style: style,
        onPressed: onPressed,
        child: Text(label),
      ),
    );
  }
}

/// Opens a V3 confirmation and resolves to `false` for every non-confirming
/// exit, including the cancel action, a swipe, and a barrier dismissal.
Future<bool> showAppConfirmationSheet({
  required BuildContext context,
  required String title,
  required String message,
  required String confirmLabel,
  String cancelLabel = 'Cancel',
  AppConfirmationTone tone = AppConfirmationTone.standard,
  Key? confirmKey,
}) async {
  final confirmed = await showAppBottomSheet<bool>(
    context: context,
    builder: (sheetContext) => AppConfirmationSheet(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      cancelLabel: cancelLabel,
      tone: tone,
      confirmKey: confirmKey,
      onCancel: () => Navigator.of(sheetContext).pop(false),
      onConfirm: () => Navigator.of(sheetContext).pop(true),
    ),
  );

  return confirmed ?? false;
}
