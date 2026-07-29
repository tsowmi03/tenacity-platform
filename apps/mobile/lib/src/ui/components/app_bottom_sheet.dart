import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The V3 modal sheet: a grabber, a display title, an optional subtitle, a
/// body that scrolls when it has to, and a footer that never does.
///
/// Sheets are how the app asks for a decision — pick a child, confirm a
/// booking — so the footer stays pinned. A confirm button that scrolls out of
/// view on a small phone is the difference between a family completing a
/// booking and abandoning it.
class AppBottomSheet extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;

  /// Pinned beneath the body, above the safe area.
  final Widget? footer;

  /// Fraction of the screen the sheet may occupy before its body scrolls.
  final double maxHeightFactor;

  const AppBottomSheet({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.footer,
    this.maxHeightFactor = 0.85,
  });

  @override
  Widget build(BuildContext context) {
    // Measured from what the sheet is actually given, not from the window.
    // A modal route hands down the space the sheet may use; reading
    // MediaQuery instead assumes the sheet fills the screen, and returns a
    // height of zero anywhere the media query has been replaced rather than
    // extended.
    return LayoutBuilder(
      builder: (context, constraints) => _build(constraints),
    );
  }

  Widget _build(BoxConstraints constraints) {
    final available = constraints.maxHeight;
    final maxHeight =
        available.isFinite ? available * maxHeightFactor : double.infinity;

    return Container(
      constraints: BoxConstraints(maxHeight: maxHeight),
      decoration: const BoxDecoration(
        color: AppColors.paper,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppRadii.sheet),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: AppColors.paper,
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const _Grabber(),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.md,
                  AppSpacing.screenH,
                  AppSpacing.lg,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppText.display(fontSize: 20),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        subtitle!,
                        style: AppText.body(
                          fontSize: 13,
                          color: AppColors.muted,
                        ).copyWith(height: 1.4),
                      ),
                    ],
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenH,
                    0,
                    AppSpacing.screenH,
                    AppSpacing.lg,
                  ),
                  child: child,
                ),
              ),
              if (footer != null) _Footer(child: footer!),
            ],
          ),
        ),
      ),
    );
  }
}

class _Grabber extends StatelessWidget {
  const _Grabber();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.labelGap),
      child: Center(
        child: Container(
          width: 38,
          height: 4,
          decoration: BoxDecoration(
            color: AppColors.line,
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
        ),
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  final Widget child;

  const _Footer({required this.child});

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
        border: Border(top: BorderSide(color: AppColors.lineSoft)),
      ),
      child: child,
    );
  }
}

/// Cancel beside a primary action, the pairing every confirming sheet uses.
///
/// The primary button carries its own busy state rather than being swapped for
/// a spinner, so the footer keeps its height while the work runs.
class SheetActions extends StatelessWidget {
  final String confirmLabel;
  final VoidCallback? onConfirm;
  final VoidCallback? onCancel;
  final bool isBusy;
  final String cancelLabel;

  const SheetActions({
    super.key,
    required this.confirmLabel,
    required this.onConfirm,
    required this.onCancel,
    this.isBusy = false,
    this.cancelLabel = 'Cancel',
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: isBusy ? null : onCancel,
            child: Text(cancelLabel),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: FilledButton(
            key: const Key('sheet-confirm'),
            onPressed: isBusy ? null : onConfirm,
            child: isBusy
                ? const SizedBox(
                    width: AppSpacing.lg,
                    height: AppSpacing.lg,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : Text(confirmLabel),
          ),
        ),
      ],
    );
  }
}

/// Opens [builder] as a V3 modal sheet.
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool allowUserDismissal = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    isDismissible: allowUserDismissal,
    enableDrag: allowUserDismissal,
    backgroundColor: Colors.transparent,
    barrierColor: AppColors.scrim,
    builder: (context) => PopScope(
      canPop: allowUserDismissal,
      child: AnimatedPadding(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: builder(context),
      ),
    ),
  );
}
