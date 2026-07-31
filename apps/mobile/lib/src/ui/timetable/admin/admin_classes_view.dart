import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_classes_data.dart';

/// The admin master timetable: one day at a time, grouped either by time slot
/// or by tutor, with every class-management action behind a tapped row.
///
/// Presentation only. Tapping a session raises a callback so the existing admin
/// options dialog — students, tutors, waitlist, cancellation — is reused rather
/// than reimplemented.
///
/// **Documented omissions**, both because nothing in the system backs them
/// (§7, §11): the reference's `Rooms` half of the header toggle, and the red
/// `Year 5 English · no tutor … Assign` row with its absence reason. Tenacity
/// operates one room, and there is no absence record, cover request, approver
/// or notification path. A class with nobody assigned simply carries no tutor
/// name; reassigning a tutor remains available through the tapped row.
class AdminClassesView extends StatelessWidget {
  final AdminClassesViewData data;
  final Future<void> Function() onRefresh;
  final VoidCallback? onPreviousDay;
  final VoidCallback? onNextDay;
  final ValueChanged<AdminClassesGrouping> onGroupingChanged;
  final ValueChanged<AdminSession> onSessionTapped;
  final VoidCallback onAddClass;
  final VoidCallback onRetry;

  const AdminClassesView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onGroupingChanged,
    required this.onSessionTapped,
    required this.onAddClass,
    required this.onRetry,
    this.onPreviousDay,
    this.onNextDay,
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
              onPreviousDay: onPreviousDay,
              onNextDay: onNextDay,
              onGroupingChanged: onGroupingChanged,
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('admin-classes-scroll'),
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
                      key: const Key('admin-classes-error'),
                      title: "We couldn't load the timetable",
                      message: data.errorMessage,
                      onRetry: onRetry,
                    )
                  else ...[
                    if (data.isEmpty)
                      EmptyStateView(
                        key: const Key('admin-classes-empty'),
                        icon: Icons.event_available_outlined,
                        title: 'No classes this day',
                        message: 'Nothing is scheduled for '
                            '${data.dayLabel.toLowerCase()}.',
                      )
                    else
                      for (final group in data.groups) ...[
                        _Group(
                          group: group,
                          onSessionTapped: onSessionTapped,
                        ),
                        const SizedBox(height: AppSpacing.xl),
                      ],
                    DashedActionButton(
                      key: const Key('admin-classes-add'),
                      label: 'Add a class',
                      onPressed: onAddClass,
                    ),
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
  final AdminClassesViewData data;
  final VoidCallback? onPreviousDay;
  final VoidCallback? onNextDay;
  final ValueChanged<AdminClassesGrouping> onGroupingChanged;

  const _Header({
    required this.data,
    required this.onPreviousDay,
    required this.onNextDay,
    required this.onGroupingChanged,
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Classes',
                  style: AppText.display(
                    fontSize: 27,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              // The reference offers Rooms | Tutors. Rooms are excluded (§11),
              // so the choice is between the time ledger and the tutor view.
              SegmentedFilter(
                key: const Key('admin-classes-grouping'),
                segments: const ['Time', 'Tutors'],
                selectedIndex:
                    data.grouping == AdminClassesGrouping.time ? 0 : 1,
                onSelected: (index) => onGroupingChanged(
                  index == 0
                      ? AdminClassesGrouping.time
                      : AdminClassesGrouping.tutor,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              _PagerButton(
                key: const Key('admin-classes-previous-day'),
                icon: Icons.chevron_left_rounded,
                semanticLabel: 'Previous day',
                onTap: data.canGoToPreviousDay ? onPreviousDay : null,
              ),
              Expanded(
                child: Column(
                  children: [
                    Text(
                      data.dayLabel,
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
                      data.daySummary,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 11.5,
                        color: Colors.white54,
                      ),
                    ),
                  ],
                ),
              ),
              _PagerButton(
                key: const Key('admin-classes-next-day'),
                icon: Icons.chevron_right_rounded,
                semanticLabel: 'Next day',
                onTap: data.canGoToNextDay ? onNextDay : null,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PagerButton extends StatelessWidget {
  final IconData icon;
  final String semanticLabel;
  final VoidCallback? onTap;

  const _PagerButton({
    super.key,
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
        color: Colors.white.withValues(alpha: 0.09),
        shape: CircleBorder(
          side: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            width: 36,
            height: 36,
            child: Icon(
              icon,
              size: 20,
              color: enabled ? Colors.white : Colors.white24,
            ),
          ),
        ),
      ),
    );
  }
}

class _Group extends StatelessWidget {
  final AdminClassesGroup group;
  final ValueChanged<AdminSession> onSessionTapped;

  const _Group({required this.group, required this.onSessionTapped});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          title: group.label.toUpperCase(),
          // The design marks the slot containing the current moment.
          trailing: group.isNow ? 'Now' : null,
          highlighted: group.isNow,
        ),
        const SizedBox(height: AppSpacing.labelGap),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (var i = 0; i < group.sessions.length; i++)
                _SessionRow(
                  key:
                      Key('admin-classes-session-${group.sessions[i].classId}'),
                  session: group.sessions[i],
                  // Per session, not per group: the tutor grouping has no time
                  // slots, so a class running now has to carry that itself.
                  // Without it a NO ROLL class on right now and one that
                  // finished this morning look identical there.
                  highlighted: group.sessions[i].isLiveNow,
                  showDivider: i < group.sessions.length - 1,
                  onTap: () => onSessionTapped(group.sessions[i]),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SessionRow extends StatelessWidget {
  final AdminSession session;
  final bool highlighted;
  final bool showDivider;
  final VoidCallback onTap;

  const _SessionRow({
    super.key,
    required this.session,
    required this.highlighted,
    required this.showDivider,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cancelled = session.status == AdminSessionStatus.cancelled;

    return Material(
      color: highlighted && !cancelled ? AppColors.blue50 : AppColors.paper,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: 11,
          ),
          decoration: BoxDecoration(
            border: showDivider
                ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
                : null,
          ),
          child: Row(
            children: [
              Container(
                width: 3,
                height: 34,
                decoration: BoxDecoration(
                  color: cancelled
                      ? AppColors.danger
                      : highlighted
                          ? AppColors.blue
                          : AppColors.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      // A class with nobody assigned shows seats alone rather
                      // than an empty separator — see the class doc.
                      session.tutorLabel.isEmpty
                          ? session.seatsLabel
                          : '${session.tutorLabel} · ${session.seatsLabel}',
                      // Two assigned tutors plus the seat count does not fit on
                      // one 402pt line, and truncating dropped the seats. This
                      // wraps only when it has to, so single-tutor rows stay
                      // one line and nothing is ever cut.
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 11.5,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              StatusPill(
                label: session.statusLabel,
                tone: _toneFor(session.status),
                size: StatusPillSize.compact,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

StatusTone _toneFor(AdminSessionStatus status) => switch (status) {
      AdminSessionStatus.cancelled => StatusTone.danger,
      AdminSessionStatus.running => StatusTone.success,
      AdminSessionStatus.noRoll => StatusTone.danger,
      AdminSessionStatus.done => StatusTone.neutral,
      AdminSessionStatus.full => StatusTone.success,
      AdminSessionStatus.seats => StatusTone.info,
    };
