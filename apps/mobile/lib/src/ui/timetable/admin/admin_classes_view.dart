import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_classes_data.dart';

/// The admin master timetable: one day at a time, grouped either by time slot
/// or by tutor, with every class-management action behind a tapped row.
///
/// The header carries the same week pager and day strip parents and tutors
/// get, so the week number is visible and the week is navigable from here.
/// The list stays one day deep: an admin day runs to a dozen classes, and the
/// time-slot grouping has no meaning across days.
///
/// A row expands in place to show who is in the session. That roster was two
/// taps and two loads away behind the enrolments sheet, which is a long way to
/// go to answer "who is in this class".
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
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<AdminClassesGrouping> onGroupingChanged;
  final ValueChanged<AdminSession> onSessionTapped;
  final VoidCallback onAddClass;
  final VoidCallback onRetry;

  const AdminClassesView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onDaySelected,
    required this.onGroupingChanged,
    required this.onSessionTapped,
    required this.onAddClass,
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
              onPreviousWeek: onPreviousWeek,
              onNextWeek: onNextWeek,
              onDaySelected: onDaySelected,
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
                        // There is no day to name before a term is loaded.
                        message: data.dayLabel.isEmpty
                            ? 'Classes appear here once a term starts.'
                            : 'Nothing is scheduled for '
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
  final VoidCallback? onPreviousWeek;
  final VoidCallback? onNextWeek;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<AdminClassesGrouping> onGroupingChanged;

  const _Header({
    required this.data,
    required this.onPreviousWeek,
    required this.onNextWeek,
    required this.onDaySelected,
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
              selected: data.selectedDate,
              // The strip clears its selection when the chosen day is tapped
              // again, which parents and tutors use to show the whole week.
              // The admin list is always one day, so there is nothing to clear
              // and re-tapping the day does nothing.
              onSelected: (date) {
                if (date == null) return;
                onDaySelected(date);
              },
            ),
            const SizedBox(height: AppSpacing.md),
            // The strip already names the day, so only what it holds is
            // repeated here.
            Center(
              child: Text(
                data.daySummary,
                key: const Key('admin-classes-day-summary'),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.body(
                  fontSize: 11.5,
                  color: Colors.white54,
                ),
              ),
            ),
          ],
        ],
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

/// One class on the day, expandable to show who is in it.
///
/// The expand control is a sibling of the row's own tap target rather than
/// something inside it, so looking at the roster and opening class options stay
/// separate actions. Expansion is local state and is deliberately not lifted:
/// it resets when the day or week changes, which is what an admin scanning a
/// different day wants.
class _SessionRow extends StatefulWidget {
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
  State<_SessionRow> createState() => _SessionRowState();
}

class _SessionRowState extends State<_SessionRow> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final cancelled = session.status == AdminSessionStatus.cancelled;

    return Material(
      color:
          widget.highlighted && !cancelled ? AppColors.blue50 : AppColors.paper,
      child: Container(
        decoration: BoxDecoration(
          border: widget.showDivider
              ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: widget.onTap,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        11,
                        0,
                        11,
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 3,
                            height: 34,
                            decoration: BoxDecoration(
                              color: cancelled
                                  ? AppColors.danger
                                  : widget.highlighted
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
                                  // A class with nobody assigned shows seats
                                  // alone rather than an empty separator — see
                                  // the class doc.
                                  session.tutorLabel.isEmpty
                                      ? session.seatsLabel
                                      : '${session.tutorLabel} · '
                                          '${session.seatsLabel}',
                                  // Two assigned tutors plus the seat count
                                  // does not fit on one 402pt line, and
                                  // truncating dropped the seats. This wraps
                                  // only when it has to, so single-tutor rows
                                  // stay one line and nothing is ever cut.
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
                ),
                _ExpandButton(
                  key: Key('admin-classes-expand-${session.classId}'),
                  expanded: _expanded,
                  onTap: () => setState(() => _expanded = !_expanded),
                ),
              ],
            ),
            if (_expanded)
              _Roster(
                key: Key('admin-classes-roster-${session.classId}'),
                session: session,
              ),
          ],
        ),
      ),
    );
  }
}

/// The chevron that opens a row's roster.
class _ExpandButton extends StatelessWidget {
  final bool expanded;
  final VoidCallback onTap;

  const _ExpandButton({
    super.key,
    required this.expanded,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      // Named for what it reveals rather than for the shape of the control, and
      // stating the state it is about to move to.
      label: expanded ? 'Hide students' : 'Show students',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            expanded
                ? Icons.keyboard_arrow_up_rounded
                : Icons.keyboard_arrow_down_rounded,
            size: AppSpacing.xl,
            color: AppColors.muted,
          ),
        ),
      ),
    );
  }
}

/// Who is in the session, under the row that opened it.
class _Roster extends StatelessWidget {
  final AdminSession session;

  const _Roster({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg + 3 + AppSpacing.md,
        0,
        AppSpacing.lg,
        AppSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 1,
            color: AppColors.lineSoft,
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
          ),
          if (session.studentNames.isEmpty)
            Text(
              // Covers both an empty roster and one whose names have not
              // loaded. Either way there is nothing to list, and the seats on
              // the row above remain the count to trust.
              session.rosterCount == 0
                  ? 'Nobody is in this session yet.'
                  : 'Student names are still loading.',
              style: AppText.body(fontSize: 11.5, color: AppColors.muted),
            )
          else
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                for (final name in session.studentNames) _NameChip(name: name),
              ],
            ),
        ],
      ),
    );
  }
}

class _NameChip extends StatelessWidget {
  final String name;

  const _NameChip({required this.name});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        // blue50 would vanish into the highlighted row it can sit on.
        color: AppColors.blue100,
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Text(
        name,
        style: AppText.body(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: AppColors.ink,
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
