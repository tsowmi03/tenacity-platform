import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_timetable_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The parent's weekly timetable: their children's booked classes, grouped by
/// day, with the week pager and per-child filter in the navy header.
///
/// Presentation only. Every action is a callback, so the booking, swap and
/// waitlist logic stays where it already lives and is not duplicated here.
class ParentTimetableView extends StatelessWidget {
  final ParentTimetableViewData data;
  final Future<void> Function() onRefresh;
  final ValueChanged<int> onFilterSelected;
  final ValueChanged<DateTime?> onDaySelected;
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;

  /// Opens the existing options dialog for a booked session.
  final void Function(ParentTimetableSession session) onSessionTapped;

  /// Opens the browse-and-book flow.
  final VoidCallback onBookOneOff;

  const ParentTimetableView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onFilterSelected,
    required this.onDaySelected,
    required this.onSessionTapped,
    required this.onBookOneOff,
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
              onFilterSelected: onFilterSelected,
              onDaySelected: onDaySelected,
              onPreviousWeek: onPreviousWeek,
              onNextWeek: onNextWeek,
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('parent-timetable-scroll'),
                onRefresh: onRefresh,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: [
                  if (data.isEmpty)
                    _EmptyWeek(
                      hasDayFilter: data.selectedDay != null,
                      onClearDay: () => onDaySelected(null),
                    )
                  else
                    for (final day in data.days) ...[
                      _DayGroup(day: day, onSessionTapped: onSessionTapped),
                      const SizedBox(height: AppSpacing.xl),
                    ],
                  DashedActionButton(
                    key: const Key('parent-timetable-book-one-off'),
                    label: 'Book a one-off class',
                    onPressed: onBookOneOff,
                  ),
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
  final ParentTimetableViewData data;
  final ValueChanged<int> onFilterSelected;
  final ValueChanged<DateTime?> onDaySelected;
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;

  const _Header({
    required this.data,
    required this.onFilterSelected,
    required this.onDaySelected,
    required this.onPreviousWeek,
    required this.onNextWeek,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Timetable',
                  style: AppText.display(fontSize: 27, color: Colors.white),
                ),
              ),
              // Only worth showing when there is more than one child to choose
              // between — "All / Ella" is noise for a one-child family.
              if (data.filterLabels.length > 2)
                Flexible(
                  child: SegmentedFilter(
                    key: const Key('parent-timetable-filter'),
                    segments: data.filterLabels,
                    selectedIndex: data.selectedFilterIndex,
                    onSelected: onFilterSelected,
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
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
                    hasSessions: data.daysWithSessions.contains(date.weekday),
                  ),
              ],
              selected: data.selectedDay,
              onSelected: onDaySelected,
            ),
          ],
        ],
      ),
    );
  }
}

class _DayGroup extends StatelessWidget {
  final ParentTimetableDay day;
  final void Function(ParentTimetableSession session) onSessionTapped;

  const _DayGroup({required this.day, required this.onSessionTapped});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Today's heading is picked out in blue so it is findable when the
        // week is scrolled.
        _DayLabel(label: day.label, isToday: day.isToday),
        const SizedBox(height: AppSpacing.labelGap),
        for (var i = 0; i < day.sessions.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.labelGap),
          _SessionRow(
            session: day.sessions[i],
            onTap: () => onSessionTapped(day.sessions[i]),
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

class _SessionRow extends StatelessWidget {
  final ParentTimetableSession session;
  final VoidCallback onTap;

  const _SessionRow({required this.session, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final (accent, tone) = switch (session.kind) {
      ParentSessionKind.confirmed => (AppColors.blue, StatusTone.success),
      ParentSessionKind.oneOff => (AppColors.blue300, StatusTone.info),
      ParentSessionKind.cancelled => (AppColors.disabled, StatusTone.danger),
    };

    return TimetableRow(
      key: Key('parent-timetable-session-${session.classId}'),
      time: session.time,
      duration: session.durationLabel,
      title: session.title,
      subtitle: session.subtitle.isEmpty ? null : session.subtitle,
      accent: accent,
      muted: session.kind == ParentSessionKind.cancelled,
      trailing: StatusPill(label: session.statusLabel, tone: tone),
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
    // A day filter hiding everything is a different situation from a genuinely
    // empty week, and has a different way out.
    if (hasDayFilter) {
      return EmptyStateView(
        key: const Key('parent-timetable-empty-day'),
        icon: Icons.event_busy_outlined,
        title: 'Nothing on this day',
        message: 'Choose another day, or show the whole week.',
        actionLabel: 'Show the whole week',
        onAction: onClearDay,
      );
    }

    return const EmptyStateView(
      key: Key('parent-timetable-empty-week'),
      icon: Icons.event_available_outlined,
      title: 'No classes this week',
      message: 'Booked classes appear here. You can book a one-off below.',
    );
  }
}
