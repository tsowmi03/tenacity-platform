import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_browse_data.dart';

/// The classes a family may book into, grouped by day, behind "Book a one-off
/// class" on the parent timetable.
///
/// Presentation only. Every tap is a callback, so the eligibility, capacity,
/// one-off and waitlist rules stay where they already live rather than being
/// reimplemented here.
class ParentBrowseView extends StatelessWidget {
  final ParentBrowseViewData data;
  final Future<void> Function() onRefresh;
  final ValueChanged<DateTime?> onDaySelected;
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;
  final VoidCallback onBack;

  /// Opens the existing options dialog for a class.
  final void Function(ParentBrowseClass browseClass) onClassTapped;

  /// Retries the load behind [ParentBrowseViewData.errorMessage].
  final VoidCallback onRetry;

  const ParentBrowseView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onDaySelected,
    required this.onClassTapped,
    required this.onBack,
    required this.onRetry,
    this.onPreviousWeek,
    this.onNextWeek,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(
              data: data,
              onDaySelected: onDaySelected,
              onPreviousWeek: onPreviousWeek,
              onNextWeek: onNextWeek,
              onBack: onBack,
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('parent-browse-scroll'),
                onRefresh: onRefresh,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: [
                  if (data.preTermNotice != null) ...[
                    _PreTermNotice(message: data.preTermNotice!),
                    const SizedBox(height: AppSpacing.xl),
                  ],
                  if (data.errorMessage != null)
                    ErrorStateView(
                      key: const Key('parent-browse-error'),
                      title: "We couldn't load the class list",
                      message: data.errorMessage,
                      onRetry: onRetry,
                    )
                  else if (data.isEmpty)
                    _EmptyWeek(
                      hasDayFilter: data.selectedDay != null,
                      onClearDay: () => onDaySelected(null),
                    )
                  else
                    for (final day in data.days) ...[
                      _DayGroup(day: day, onClassTapped: onClassTapped),
                      const SizedBox(height: AppSpacing.xl),
                    ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final ParentBrowseViewData data;
  final ValueChanged<DateTime?> onDaySelected;
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;
  final VoidCallback onBack;

  const _Header({
    required this.data,
    required this.onDaySelected,
    required this.onPreviousWeek,
    required this.onNextWeek,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                key: const Key('parent-browse-back'),
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_rounded),
                color: Colors.white,
                tooltip: 'Back',
              ),
              Expanded(
                child: Text(
                  'Available classes',
                  style: AppText.display(fontSize: 24, color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Padding(
            // The title row is inset by the icon button's own padding; the
            // pager below it is not, so it is nudged back into line.
            padding: const EdgeInsets.only(left: AppSpacing.labelGap),
            child: Column(
              children: [
                WeekNavigator(
                  title: data.weekTitle,
                  subtitle: data.weekSubtitle,
                  onPrevious: data.canGoToPreviousWeek ? onPreviousWeek : null,
                  onNext: data.canGoToNextWeek ? onNextWeek : null,
                ),
                if (data.weekDates.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  WeekStrip(
                    days: [
                      for (final date in data.weekDates)
                        WeekStripDay(
                          date: date,
                          hasSessions:
                              data.daysWithClasses.contains(date.weekday),
                        ),
                    ],
                    selected: data.selectedDay,
                    onSelected: onDaySelected,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Bookings open before the term does, which surprises families every year.
class _PreTermNotice extends StatelessWidget {
  final String message;

  const _PreTermNotice({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('parent-browse-pre-term'),
      padding: const EdgeInsets.all(AppSpacing.sectionGap),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.event_outlined,
            size: 18,
            color: AppColors.blue600,
          ),
          const SizedBox(width: AppSpacing.labelGap),
          Expanded(
            child: Text(
              message,
              style: AppText.body(fontSize: 12.5, color: AppColors.blue600),
            ),
          ),
        ],
      ),
    );
  }
}

class _DayGroup extends StatelessWidget {
  final ParentBrowseDay day;
  final void Function(ParentBrowseClass browseClass) onClassTapped;

  const _DayGroup({required this.day, required this.onClassTapped});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _DayLabel(label: day.label, isToday: day.isToday),
        const SizedBox(height: AppSpacing.labelGap),
        for (var i = 0; i < day.classes.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.labelGap),
          _ClassRow(
            browseClass: day.classes[i],
            onTap: () => onClassTapped(day.classes[i]),
          ),
        ],
      ],
    );
  }
}

class _DayLabel extends StatelessWidget {
  final String label;
  final bool isToday;

  const _DayLabel({required this.label, required this.isToday});

  @override
  Widget build(BuildContext context) {
    final colour = isToday ? AppColors.blue600 : AppColors.muted;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(
          child: Text(
            label,
            style: AppText.body(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: colour,
            ).copyWith(letterSpacing: AppSizes.sectionLabelTracking),
          ),
        ),
        if (isToday)
          Text(
            'Today',
            style: AppText.body(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: colour,
            ),
          ),
      ],
    );
  }
}

class _ClassRow extends StatelessWidget {
  final ParentBrowseClass browseClass;
  final VoidCallback onTap;

  const _ClassRow({required this.browseClass, required this.onTap});

  @override
  Widget build(BuildContext context) {
    // The edge colour carries the same state as the pill, so the list can be
    // scanned without reading every label.
    final (accent, tone) = switch (browseClass.availability) {
      ParentBrowseAvailability.cancelled => (
          AppColors.disabled,
          StatusTone.danger
        ),
      ParentBrowseAvailability.booked => (AppColors.blue, StatusTone.info),
      ParentBrowseAvailability.open => (AppColors.success, StatusTone.success),
      ParentBrowseAvailability.waitlist => (
          AppColors.warning,
          StatusTone.action
        ),
    };

    return TimetableRow(
      key: Key('parent-browse-class-${browseClass.classId}'),
      time: browseClass.time,
      duration: browseClass.durationLabel,
      title: browseClass.title,
      subtitle: browseClass.subtitle.isEmpty ? null : browseClass.subtitle,
      accent: accent,
      muted: browseClass.availability == ParentBrowseAvailability.cancelled,
      trailing: StatusPill(label: browseClass.statusLabel, tone: tone),
      onTap: onTap,
    );
  }
}

class _EmptyWeek extends StatelessWidget {
  final bool hasDayFilter;
  final VoidCallback onClearDay;

  const _EmptyWeek({required this.hasDayFilter, required this.onClearDay});

  @override
  Widget build(BuildContext context) {
    if (hasDayFilter) {
      return EmptyStateView(
        key: const Key('parent-browse-empty-day'),
        icon: Icons.event_busy_outlined,
        title: 'Nothing on this day',
        message: 'Choose another day, or show the whole week.',
        actionLabel: 'Show the whole week',
        onAction: onClearDay,
      );
    }

    return const EmptyStateView(
      key: Key('parent-browse-empty-week'),
      icon: Icons.search_off_outlined,
      title: 'No classes to book this week',
      message: 'Classes matching your children’s subjects appear here. '
          'Try another week.',
    );
  }
}
