import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// An outlined shortcut card — a stroked icon above a short label. Used in the
/// `QUICK ACTIONS` grid at the foot of each dashboard.
class QuickActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  const QuickActionTile({
    super.key,
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.line, width: 1.5),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: 13,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                icon,
                size: AppSizes.quickActionIcon,
                color: onTap == null ? AppColors.disabled : AppColors.blue,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppText.body(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: onTap == null ? AppColors.disabled : AppColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Lays [tiles] out two-per-row with the design's 12px gutters, so dashboards
/// do not each rebuild the same grid arithmetic.
class QuickActionGrid extends StatelessWidget {
  final List<Widget> tiles;

  const QuickActionGrid({super.key, required this.tiles});

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < tiles.length; i += 2) {
      final hasSecond = i + 1 < tiles.length;
      rows.add(
        Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: tiles[i]),
            const SizedBox(width: AppSpacing.md),
            // Keep a trailing odd tile at half width rather than stretching it.
            Expanded(child: hasSecond ? tiles[i + 1] : const SizedBox.shrink()),
          ],
        ),
      );
    }

    return Column(
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.md),
          IntrinsicHeight(child: rows[i]),
        ],
      ],
    );
  }
}
