import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The uppercase, letter-spaced label that introduces each block inside a
/// content sheet — `TODAY`, `NEEDS ATTENTION`, `QUICK ACTIONS`.
///
/// Supply at most one of [trailing] (static metadata, e.g. a date) or
/// [actionLabel] (a tappable link, e.g. `All`).
class SectionLabel extends StatelessWidget {
  final String title;
  final String? trailing;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// Draws the label and its [trailing] metadata in brand blue instead of the
  /// usual muted grey. The admin timetable uses it to pick out the time slot
  /// happening now from the rest of the day.
  final bool highlighted;

  const SectionLabel({
    super.key,
    required this.title,
    this.trailing,
    this.actionLabel,
    this.onAction,
    this.highlighted = false,
  }) : assert(
          trailing == null || actionLabel == null,
          'Use either trailing metadata or an action label, not both.',
        );

  @override
  Widget build(BuildContext context) {
    final tone = highlighted ? AppColors.blue600 : AppColors.muted;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(
          child: Text(
            title,
            style: AppText.body(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: tone,
            ).copyWith(letterSpacing: AppSizes.sectionLabelTracking),
          ),
        ),
        if (trailing != null)
          Text(
            trailing!,
            style: AppText.body(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: tone,
            ),
          ),
        if (actionLabel != null)
          InkWell(
            onTap: onAction,
            borderRadius: BorderRadius.circular(AppSpacing.sm),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xxs),
              child: Text(
                actionLabel!,
                style: AppText.body(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.blue,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
