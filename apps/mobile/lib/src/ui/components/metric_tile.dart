import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// A translucent tile in the navy header showing one headline number and its
/// label — `3 / classes today`. Designed to sit on [AppColors.ink]; it will not
/// read correctly on a light background.
///
/// [showDot] adds the unread indicator beside the value.
class MetricTile extends StatelessWidget {
  final String value;
  final String label;
  final Color valueColor;
  final bool showDot;
  final VoidCallback? onTap;

  const MetricTile({
    super.key,
    required this.value,
    required this.label,
    this.onTap,
    this.valueColor = Colors.white,
    this.showDot = false,
  });

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm + AppSpacing.xxs,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.display(fontSize: 20, color: valueColor)
                      .copyWith(height: 1),
                ),
              ),
              if (showDot) ...[
                const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
                Container(
                  width: AppSizes.unreadDot,
                  height: AppSizes.unreadDot,
                  decoration: const BoxDecoration(
                    color: AppColors.unread,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 3),
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: AppText.body(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: AppColors.onInkMuted,
            ).copyWith(height: 1.25),
          ),
        ],
      ),
    );

    return Semantics(
      button: onTap != null,
      label: '$value $label',
      excludeSemantics: true,
      child: Material(
        color: AppColors.onInkSurface,
        shape: RoundedRectangleBorder(
          side: const BorderSide(color: AppColors.onInkBorder),
          borderRadius: BorderRadius.circular(AppRadii.tile),
        ),
        clipBehavior: Clip.antiAlias,
        child: onTap == null ? content : InkWell(onTap: onTap, child: content),
      ),
    );
  }
}
