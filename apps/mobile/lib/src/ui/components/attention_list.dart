import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// One thing needing the user's attention: a status dot, a title and subtitle,
/// and either a trailing action or a chevron into the relevant screen.
class AttentionItem {
  final String title;
  final String subtitle;

  /// Colour of the leading dot. [AppColors.danger] for something wrong or
  /// overdue, [AppColors.blue] for informational.
  final Color tone;

  /// Shown at the end of the row instead of the chevron — typically a
  /// `PillButton` such as `Pay` or `Assign`.
  final Widget? action;

  final VoidCallback? onTap;

  const AttentionItem({
    required this.title,
    required this.subtitle,
    this.tone = AppColors.danger,
    this.action,
    this.onTap,
  });
}

/// The bordered `NEEDS ATTENTION` block: a hairline-outlined container whose
/// rows are separated by soft dividers.
class AttentionList extends StatelessWidget {
  final List<AttentionItem> items;

  const AttentionList({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            _AttentionRow(
              item: items[i],
              showDivider: i < items.length - 1,
            ),
        ],
      ),
    );
  }
}

class _AttentionRow extends StatelessWidget {
  final AttentionItem item;
  final bool showDivider;

  const _AttentionRow({required this.item, required this.showDivider});

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        border: showDivider
            ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
            : null,
      ),
      child: Row(
        children: [
          Container(
            width: AppSizes.attentionDot,
            height: AppSizes.attentionDot,
            decoration: BoxDecoration(
              color: item.tone,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  item.subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.body(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          if (item.action != null)
            item.action!
          else
            const Icon(
              Icons.chevron_right_rounded,
              size: AppSpacing.xl,
              color: AppColors.muted,
            ),
        ],
      ),
    );

    return Material(
      color: AppColors.paper,
      child: item.onTap == null
          ? content
          : InkWell(onTap: item.onTap, child: content),
    );
  }
}
