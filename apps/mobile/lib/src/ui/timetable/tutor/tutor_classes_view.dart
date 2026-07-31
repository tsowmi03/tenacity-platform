import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/tutor/tutor_classes_data.dart';

/// The tutor's teaching week: the classes they are assigned to, grouped by
/// day, each showing whether its roll still needs marking.
///
/// Presentation only. Opening a session is a callback, so the roll itself
/// lives in its own route rather than being reimplemented here.
///
/// **Documented omission:** the reference design carries an `Availability`
/// action in the header and a `Request a schedule change` button beneath the
/// list. Neither is shipped. There is no availability record, no request
/// document, no approver and no notification path behind either — the §7
/// `Tutor availability/schedule change` gate is still open — and a control
/// that silently does nothing is worse than one that is absent.
class TutorClassesView extends StatelessWidget {
  final TutorClassesViewData data;
  final Future<void> Function() onRefresh;
  final ValueChanged<DateTime?> onDaySelected;
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;

  /// Opens the roll for a session. Only called for a session whose
  /// [TutorSession.canOpenRoll] is true.
  final ValueChanged<TutorSession> onSessionTapped;

  final VoidCallback onOpenProfile;
  final VoidCallback onRetry;

  const TutorClassesView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onDaySelected,
    required this.onSessionTapped,
    required this.onOpenProfile,
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
              onOpenProfile: onOpenProfile,
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('tutor-classes-scroll'),
                onRefresh: onRefresh,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: [
                  if (data.errorMessage != null)
                    ErrorStateView(
                      key: const Key('tutor-classes-error'),
                      title: "We couldn't load your classes",
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
                      _DayGroup(day: day, onSessionTapped: onSessionTapped),
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
  final TutorClassesViewData data;
  final ValueChanged<DateTime?> onDaySelected;
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;
  final VoidCallback onOpenProfile;

  const _Header({
    required this.data,
    required this.onDaySelected,
    required this.onPreviousWeek,
    required this.onNextWeek,
    required this.onOpenProfile,
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
                  'Classes',
                  style: AppText.display(fontSize: 27, color: Colors.white),
                ),
              ),
              if (data.rollsToMark > 0)
                Padding(
                  padding: const EdgeInsets.only(right: AppSpacing.md),
                  child: _RollsBadge(count: data.rollsToMark),
                ),
              Semantics(
                button: true,
                label: 'Profile',
                child: GestureDetector(
                  key: const Key('tutor-classes-profile'),
                  onTap: onOpenProfile,
                  child: Container(
                    width: 42,
                    height: 42,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: AppColors.onInkSurface,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.person_outline_rounded,
                      color: Colors.white,
                      size: AppSpacing.xl,
                    ),
                  ),
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

/// How many rolls are outstanding this week. Sits in the header because it is
/// the reason a tutor opens this screen.
class _RollsBadge extends StatelessWidget {
  final int count;

  const _RollsBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$count ${count == 1 ? 'roll' : 'rolls'} to mark',
      child: Container(
        key: const Key('tutor-classes-rolls-badge'),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: 7,
        ),
        decoration: BoxDecoration(
          color: AppColors.onInkSurface,
          border: Border.all(color: AppColors.onInkBorder),
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: AppSizes.attentionDot,
              height: AppSizes.attentionDot,
              decoration: const BoxDecoration(
                color: AppColors.unread,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 7),
            Text(
              '$count to mark',
              style: AppText.body(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayGroup extends StatelessWidget {
  final TutorClassesDay day;
  final ValueChanged<TutorSession> onSessionTapped;

  const _DayGroup({required this.day, required this.onSessionTapped});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionLabel(
          title: day.label,
          trailing: day.trailingLabel,
        ),
        const SizedBox(height: AppSpacing.labelGap),
        for (var i = 0; i < day.sessions.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.labelGap),
          _SessionRow(
            session: day.sessions[i],
            onTap: day.sessions[i].canOpenRoll
                ? () => onSessionTapped(day.sessions[i])
                : null,
          ),
        ],
      ],
    );
  }
}

class _SessionRow extends StatelessWidget {
  final TutorSession session;
  final VoidCallback? onTap;

  const _SessionRow({required this.session, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final (accent, tone) = switch (session.status) {
      TutorSessionStatus.cancelled => (AppColors.line, StatusTone.danger),
      TutorSessionStatus.done => (AppColors.line, StatusTone.success),
      TutorSessionStatus.markRoll => (AppColors.blue, StatusTone.action),
      TutorSessionStatus.upcoming => (AppColors.blue300, StatusTone.neutral),
      TutorSessionStatus.confirmed => (AppColors.blue300, StatusTone.success),
    };

    return TimetableRow(
      key: Key('tutor-session-${session.classId}'),
      time: session.time,
      duration: session.durationLabel,
      title: session.title,
      subtitle: session.subtitle,
      accent: accent,
      // A finished session recedes; the ones still wanting something do not.
      muted: session.status == TutorSessionStatus.done ||
          session.status == TutorSessionStatus.cancelled,
      onTap: onTap,
      trailing: StatusPill(label: session.statusLabel, tone: tone),
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
        icon: Icons.event_available_outlined,
        title: 'Nothing on this day',
        message: 'You are not teaching on the day you have selected.',
        actionLabel: 'Show the whole week',
        onAction: onClearDay,
      );
    }

    return const EmptyStateView(
      icon: Icons.event_available_outlined,
      title: 'No classes this week',
      message: 'Classes you are assigned to will appear here.',
    );
  }
}
