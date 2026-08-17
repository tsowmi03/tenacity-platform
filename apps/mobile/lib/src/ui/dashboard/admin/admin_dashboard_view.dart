import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_formatting.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The admin dashboard: what needs acting on, what is running right now, and
/// the three things an admin starts most often.
///
/// Presentation only — [data] comes from `buildAdminDashboardViewData`, so this
/// renders at any viewport without Firestore.
///
/// Work and information are kept in separate sections. They used to share the
/// NEEDS ACTION heading, which produced a row reading `no action needed`
/// underneath it and a `0 need action` metric above it; the reader was left to
/// work out which of the three to believe.
///
/// One thing the reference design shows is deliberately absent, because nothing
/// in the system backs it (see §7 and §11 of the redesign roadmap): the
/// `Cover needed — … Assign` attention row. Room is likewise omitted from the
/// session rows, since Tenacity operates one room.
class AdminDashboardView extends StatelessWidget {
  final AdminDashboardViewData data;
  final Future<void> Function() onRefresh;
  final VoidCallback onOpenClasses;
  final VoidCallback onOpenInvoices;
  final VoidCallback onOpenUsers;
  final VoidCallback onOpenProfile;
  final VoidCallback onAddClass;
  final VoidCallback onCreateInvoice;
  final VoidCallback onNewEnrol;

  /// Opens one session's roll directly.
  final void Function(String classId, String attendanceDocId) onOpenRoll;

  /// Opens the timetable on a particular day, for rows that point at a session
  /// rather than carrying one.
  final void Function(DateTime day) onOpenDay;

  const AdminDashboardView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onOpenClasses,
    required this.onOpenInvoices,
    required this.onOpenUsers,
    required this.onOpenProfile,
    required this.onAddClass,
    required this.onCreateInvoice,
    required this.onNewEnrol,
    required this.onOpenRoll,
    required this.onOpenDay,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            AppHeader(
              title: '${data.greeting}, ${data.adminName}',
              subtitle: data.subtitle,
              avatarInitial: avatarInitialFor(data.adminName, fallback: 'A'),
              avatarKey: const Key('admin-dashboard-profile'),
              onAvatarTap: onOpenProfile,
              metrics: [
                MetricTile(
                  key: const Key('admin-dashboard-classes-stat'),
                  value: '${data.classesToday}',
                  label: 'classes today',
                  onTap: onOpenClasses,
                ),
                MetricTile(
                  key: const Key('admin-dashboard-action-stat'),
                  value: '${data.needsActionCount}',
                  label: 'need action',
                  showDot: data.needsActionCount > 0,
                ),
                MetricTile(
                  key: const Key('admin-dashboard-outstanding-stat'),
                  value: data.outstandingLabel,
                  label: 'outstanding',
                  valueColor: data.outstandingAmount > 0
                      ? AppColors.blue300
                      : Colors.white,
                  onTap: onOpenInvoices,
                ),
              ],
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('admin-dashboard-scroll'),
                onRefresh: onRefresh,
                children: [
                  if (data.hasAttentionItems) ...[
                    const SectionLabel(title: 'NEEDS ACTION'),
                    const SizedBox(height: AppSpacing.labelGap),
                    AttentionList(
                      key: const Key('admin-dashboard-attention'),
                      items: _attentionItems(),
                    ),
                    const SizedBox(height: AppSpacing.sectionGap),
                  ],
                  if (data.hasInfoItems) ...[
                    const SectionLabel(title: 'FOR INFORMATION'),
                    const SizedBox(height: AppSpacing.labelGap),
                    AttentionList(
                      key: const Key('admin-dashboard-info'),
                      items: _infoItems(context),
                    ),
                    const SizedBox(height: AppSpacing.sectionGap),
                  ],
                  _SessionsSection(
                    label: data.happeningNowLabel,
                    sessions: data.sessionsInFocus,
                    onOpenClasses: onOpenClasses,
                    onOpenRoll: onOpenRoll,
                  ),
                  const SizedBox(height: AppSpacing.sectionGap),
                  _QuickActions(
                    onAddClass: onAddClass,
                    onCreateInvoice: onCreateInvoice,
                    onNewEnrol: onNewEnrol,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// The things an admin has to do something about. Every row here counts
  /// towards the `need action` metric, so the number and the list agree.
  List<AttentionItem> _attentionItems() {
    final overdue = data.overdueInvoices;

    return [
      for (final roll in data.outstandingRolls)
        AttentionItem(
          title: roll.title,
          subtitle: roll.subtitle,
          // Lands on the day the session ran, not the timetable in general —
          // the admin arrives beside the class they were sent to chase, with
          // the rest of that day for context.
          action: PillButton(
            label: 'Open',
            onPressed: () => onOpenDay(roll.startsAt),
          ),
        ),
      // A dashboard lists only the first few rolls, so when more are
      // outstanding it has to say so — otherwise the `need action` metric and
      // this list disagree with nothing to explain the gap, and the rest are
      // unreachable from here.
      if (data.hasMoreOutstandingRolls)
        AttentionItem(
          title: data.hiddenOutstandingRolls == 1
              ? '1 more roll outstanding'
              : '${data.hiddenOutstandingRolls} more rolls outstanding',
          subtitle: 'Open the timetable to mark them',
          onTap: onOpenClasses,
        ),
      if (overdue != null)
        AttentionItem(
          title: overdue.count == 1
              ? '1 invoice overdue'
              : '${overdue.count} invoices overdue',
          subtitle: 'Oldest ${_dayLabel(overdue.oldestDays)} · '
              '${formatCurrency(overdue.totalAmount)} total',
          onTap: onOpenInvoices,
        ),
      // A check that could not be run is itself something to act on. Silence
      // here would be read as "nothing outstanding", which is the one thing
      // this console cannot honestly claim when the read failed.
      if (data.rollsUnavailable)
        AttentionItem(
          title: "Couldn't check rolls",
          subtitle: 'Tap to try again',
          onTap: () => onRefresh(),
        ),
      if (data.billingUnavailable)
        AttentionItem(
          title: "Couldn't check billing",
          subtitle: 'Tap to try again',
          onTap: () => onRefresh(),
        ),
    ];
  }

  /// Things worth knowing that nobody has to do anything about.
  List<AttentionItem> _infoItems(BuildContext context) {
    final bookings = data.oneOffBookings;
    if (bookings.isEmpty) return const [];

    return [
      AttentionItem(
        title: bookings.length == 1
            ? '1 one-off booking this week'
            : '${bookings.length} one-off bookings this week',
        subtitle: 'Tap to see who booked',
        tone: AppColors.blue,
        onTap: () => showAdminOneOffBookingsSheet(
          context: context,
          bookings: bookings,
        ),
      ),
    ];
  }
}

String _dayLabel(int days) => days == 1 ? '1 day' : '$days days';

/// Who booked into a class they are not enrolled in, and when.
///
/// Repeat bookings by the same student are listed once each rather than
/// collapsed: three visits in a week is a different fact from one, and an
/// admin reading this is usually checking exactly that.
Future<void> showAdminOneOffBookingsSheet({
  required BuildContext context,
  required List<AdminDashboardOneOffBooking> bookings,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => AppBottomSheet(
      title: 'One-off bookings',
      subtitle: bookings.length == 1
          ? '1 booking this week'
          : '${bookings.length} bookings this week',
      child: ListView.separated(
        key: const Key('admin-one-off-bookings-list'),
        shrinkWrap: true,
        itemCount: bookings.length,
        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
        itemBuilder: (_, index) {
          final booking = bookings[index];
          return LedgerRow(
            key: Key('admin-one-off-booking-$index'),
            time: booking.timeLabel,
            duration: booking.dayLabel,
            title: booking.studentName,
            subtitle: booking.className,
            trailing: const StatusPill(
              label: 'ONE-OFF',
              tone: StatusTone.info,
              size: StatusPillSize.compact,
            ),
          );
        },
      ),
    ),
  );
}

class _SessionsSection extends StatelessWidget {
  final String label;
  final List<AdminDashboardSession> sessions;
  final VoidCallback onOpenClasses;
  final void Function(String classId, String attendanceDocId) onOpenRoll;

  const _SessionsSection({
    required this.label,
    required this.sessions,
    required this.onOpenClasses,
    required this.onOpenRoll,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          title: label,
          actionLabel: 'Full timetable',
          onAction: onOpenClasses,
        ),
        const SizedBox(height: AppSpacing.labelGap),
        if (sessions.isEmpty)
          LedgerRowEmpty(
            key: const Key('admin-dashboard-no-classes'),
            message: 'No classes scheduled today',
            onTap: onOpenClasses,
          )
        else
          for (var i = 0; i < sessions.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            _SessionRow(
              key: Key('admin-dashboard-session-$i'),
              session: sessions[i],
              // A class with no generated session has no roll to open, so the
              // timetable is the only honest destination for it.
              onTap: sessions[i].attendanceDocId == null
                  ? onOpenClasses
                  : () => onOpenRoll(
                        sessions[i].classId,
                        sessions[i].attendanceDocId!,
                      ),
            ),
          ],
      ],
    );
  }
}

class _SessionRow extends StatelessWidget {
  final AdminDashboardSession session;
  final VoidCallback onTap;

  const _SessionRow({super.key, required this.session, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final students = session.rosterCount == 1
        ? '1 student'
        : '${session.rosterCount} students';

    // The tutor belongs on the subtitle, not appended to the title. The
    // reference puts it on the title line because room occupies the subtitle
    // there; with room excluded (§11) the subtitle is nearly empty, and on a
    // 402pt row a class name like "Year 12 Maths Extension 1" plus a roll pill
    // already fills the title — appending the tutor only pushed it past the
    // ellipsis, so the assigned tutor was never visible on any row.
    final tutor = session.tutorLabel;

    return LedgerRow(
      time: DateFormat('h:mm').format(session.startsAt),
      title: session.title,
      subtitle: tutor.isEmpty ? students : '$tutor · $students',
      trailing: StatusPill(
        label: session.rollLabel,
        // Red is reserved for a roll that is genuinely late. An unmarked roll
        // on a class that has not started yet is simply the normal state of a
        // class that has not started yet, and painting it as a failure meant
        // an afternoon console showed a column of alarms with nothing wrong.
        tone: session.rollComplete
            ? StatusTone.success
            : session.rollOutstanding
                ? StatusTone.danger
                : StatusTone.neutral,
        size: StatusPillSize.compact,
      ),
      onTap: onTap,
    );
  }
}

class _QuickActions extends StatelessWidget {
  final VoidCallback onAddClass;
  final VoidCallback onCreateInvoice;
  final VoidCallback onNewEnrol;

  const _QuickActions({
    required this.onAddClass,
    required this.onCreateInvoice,
    required this.onNewEnrol,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel(title: 'QUICK ACTIONS'),
        const SizedBox(height: AppSpacing.labelGap),
        QuickActionGrid(
          // Three across, as the admin reference draws them.
          columns: 3,
          tiles: [
            QuickActionTile(
              key: const Key('admin-dashboard-add-class'),
              icon: Icons.calendar_month_outlined,
              label: 'Add class',
              onTap: onAddClass,
            ),
            QuickActionTile(
              key: const Key('admin-dashboard-create-invoice'),
              icon: Icons.receipt_long_outlined,
              label: 'Create invoice',
              onTap: onCreateInvoice,
            ),
            QuickActionTile(
              key: const Key('admin-dashboard-new-enrol'),
              icon: Icons.person_add_alt_1_outlined,
              label: 'New enrol',
              onTap: onNewEnrol,
            ),
          ],
        ),
      ],
    );
  }
}
