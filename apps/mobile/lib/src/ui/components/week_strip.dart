import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// One day in a [WeekStrip].
class WeekStripDay {
  final DateTime date;

  /// Shows a dot beneath the date, marking a day that has something on it.
  final bool hasSessions;

  const WeekStripDay({required this.date, this.hasSessions = false});
}

/// The Monday-to-Sunday day selector in the navy header.
///
/// Selecting a day filters the list below it. The dot marks days with classes,
/// so a family can see the shape of their week without scrolling.
class WeekStrip extends StatelessWidget {
  final List<WeekStripDay> days;

  /// The selected day, or null when the whole week is shown.
  final DateTime? selected;

  /// Called with the tapped day, or null when tapping the selected day again
  /// to clear the filter.
  final ValueChanged<DateTime?> onSelected;

  const WeekStrip({
    super.key,
    required this.days,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < days.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: _Day(
              day: days[i],
              selected: selected != null &&
                  DateUtils.isSameDay(days[i].date, selected),
              onTap: () {
                final isSelected = selected != null &&
                    DateUtils.isSameDay(days[i].date, selected);
                onSelected(isSelected ? null : days[i].date);
              },
            ),
          ),
        ],
      ],
    );
  }
}

class _Day extends StatelessWidget {
  final WeekStripDay day;
  final bool selected;
  final VoidCallback onTap;

  const _Day({
    required this.day,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final weekday = DateFormat('EEE').format(day.date).toUpperCase();

    return Semantics(
      button: true,
      selected: selected,
      label: DateFormat('EEEE d MMMM').format(day.date),
      excludeSemantics: true,
      child: Material(
        color: selected ? AppColors.blue : Colors.transparent,
        borderRadius: BorderRadius.circular(AppRadii.sm),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Column(
              children: [
                Text(
                  weekday,
                  style: AppText.body(
                    fontSize: 9.5,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    color: selected
                        ? Colors.white.withValues(alpha: 0.85)
                        : Colors.white.withValues(alpha: 0.45),
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '${day.date.day}',
                  style: AppText.body(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.75),
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Container(
                  width: 4,
                  height: 4,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: !day.hasSessions
                        ? Colors.transparent
                        : selected
                            ? Colors.white
                            : AppColors.blue300,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The week pager above the [WeekStrip]: circular previous/next buttons either
/// side of the week's range and a summary line.
///
/// A null callback disables its arrow, which is how the first and last weeks of
/// a term stop the user paging out of it.
class WeekNavigator extends StatelessWidget {
  final String title;
  final String subtitle;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  const WeekNavigator({
    super.key,
    required this.title,
    required this.subtitle,
    this.onPrevious,
    this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _ArrowButton(
          icon: Icons.chevron_left_rounded,
          semanticLabel: 'Previous week',
          onTap: onPrevious,
        ),
        Expanded(
          child: Column(
            children: [
              Text(
                title,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.body(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                subtitle,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.body(
                  fontSize: 11.5,
                  color: Colors.white.withValues(alpha: 0.5),
                ),
              ),
            ],
          ),
        ),
        _ArrowButton(
          icon: Icons.chevron_right_rounded,
          semanticLabel: 'Next week',
          onTap: onNext,
        ),
      ],
    );
  }
}

class _ArrowButton extends StatelessWidget {
  final IconData icon;
  final String semanticLabel;
  final VoidCallback? onTap;

  const _ArrowButton({
    required this.icon,
    required this.semanticLabel,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;

    return Semantics(
      button: true,
      enabled: enabled,
      label: semanticLabel,
      child: Material(
        color: AppColors.onInkSurface,
        shape: CircleBorder(
          side: BorderSide(
            color: enabled ? AppColors.onInkBorder : Colors.transparent,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 36,
            height: 36,
            child: Icon(
              icon,
              size: AppSpacing.xl,
              color:
                  enabled ? Colors.white : Colors.white.withValues(alpha: 0.25),
            ),
          ),
        ),
      ),
    );
  }
}
