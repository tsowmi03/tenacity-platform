import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// A scheduled-item row: a leading time column, a coloured rule, the class
/// title and its metadata, and an optional trailing widget such as a
/// [StatusPill] or [PillButton].
///
/// This is the densest repeating unit in the designs — it carries the timetable
/// on every role's classes screen and the "today" block on every dashboard.
class LedgerRow extends StatelessWidget {
  final String time;
  final String? duration;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color accent;
  final Color background;

  const LedgerRow({
    super.key,
    required this.time,
    required this.title,
    this.duration,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.accent = AppColors.blue,
    this.background = AppColors.blue50,
  });

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: 13,
      ),
      child: Row(
        children: [
          SizedBox(
            width: AppSizes.ledgerTimeColumn,
            child: Column(
              children: [
                Text(
                  time,
                  style: AppText.display(fontSize: 17, color: AppColors.blue600)
                      .copyWith(height: 1.1),
                ),
                if (duration != null)
                  Text(
                    duration!,
                    style: AppText.body(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w500,
                      color: AppColors.muted,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Container(
            width: AppSizes.ledgerRuleWidth,
            height: AppSizes.ledgerRuleHeight,
            decoration: BoxDecoration(
              color: accent,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: AppSpacing.sectionGap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.body(
                      fontSize: 12.5,
                      color: AppColors.muted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: AppSpacing.sm),
            trailing!,
          ],
        ],
      ),
    );

    return Material(
      color: background,
      borderRadius: BorderRadius.circular(AppRadii.md),
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? content : InkWell(onTap: onTap, child: content),
    );
  }
}

/// Placeholder shown in place of a [LedgerRow] when there is nothing scheduled.
/// Keeps the sheet's rhythm instead of collapsing the section away.
class LedgerRowEmpty extends StatelessWidget {
  final IconData icon;
  final String message;
  final VoidCallback? onTap;

  const LedgerRowEmpty({
    super.key,
    required this.message,
    this.icon = Icons.event_available_outlined,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: 13,
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.blue, size: 22),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              message,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppText.body(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );

    return Material(
      color: AppColors.blue50,
      borderRadius: BorderRadius.circular(AppRadii.md),
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? content : InkWell(onTap: onTap, child: content),
    );
  }
}
