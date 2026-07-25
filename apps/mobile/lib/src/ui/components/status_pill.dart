import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Visual weight of a [StatusPill], chosen by what the status means rather than
/// by colour, so screens never pick hex values themselves.
enum StatusTone {
  /// Settled and expected — `CONFIRMED`, `PAID`, `DONE`.
  neutral,

  /// Active or highlighted — `RUNNING`, `ONE-OFF`, an audience badge.
  info,

  /// Wants the user to do something — `MARK ROLL`, `NO ROLL`.
  action,

  /// Something is wrong or late — `OVERDUE`, `FULL`.
  danger,

  /// Complete and positive — used sparingly.
  success,
}

/// The designs use two pill sizes: a standard one on record rows, and a smaller
/// one for inline badges such as an announcement's audience.
enum StatusPillSize { standard, compact }

/// A small rounded label carrying a record's state. Uppercase content is the
/// convention in the reference designs, but the widget does not force it —
/// pass the exact text you want shown.
class StatusPill extends StatelessWidget {
  final String label;
  final StatusTone tone;
  final StatusPillSize size;

  const StatusPill({
    super.key,
    required this.label,
    this.tone = StatusTone.neutral,
    this.size = StatusPillSize.standard,
  });

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (tone) {
      StatusTone.neutral => (AppColors.blue50, AppColors.muted),
      StatusTone.info => (AppColors.blue100, AppColors.blue600),
      StatusTone.action => (AppColors.ink, Colors.white),
      StatusTone.danger => (const Color(0x1AD64545), AppColors.danger),
      StatusTone.success => (AppColors.successSurface, AppColors.success),
    };

    final isCompact = size == StatusPillSize.compact;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: isCompact ? AppSpacing.sm : AppSpacing.labelGap,
        vertical: isCompact ? 3 : AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        label,
        style: AppText.body(
          fontSize: isCompact ? 9.5 : 10.5,
          fontWeight: FontWeight.w700,
          color: foreground,
        ).copyWith(letterSpacing: isCompact ? 0.4 : 0.32),
      ),
    );
  }
}

/// The filled pill used as a row's primary action — `Pay`, `Assign`,
/// `Open roll`. Distinct from [StatusPill] because it is tappable and sized for
/// touch.
class PillButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;

  const PillButton({super.key, required this.label, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: onPressed == null ? AppColors.disabled : AppColors.ink,
      borderRadius: BorderRadius.circular(AppRadii.pill),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.sm,
          ),
          child: Text(
            label,
            style: AppText.body(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
