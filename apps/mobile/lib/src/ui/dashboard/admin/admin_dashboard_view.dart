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
/// Two things the reference design shows are deliberately absent, both because
/// nothing in the system backs them (see §7 and §11 of the redesign roadmap):
/// the `Cover needed — … Assign` attention row, and the `Approve` action on a
/// one-off booking. Room is likewise omitted from the session rows, since
/// Tenacity operates one room.
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
  final void Function(String classId) onOpenClass;

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
    required this.onOpenClass,
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
                  _SessionsSection(
                    label: data.happeningNowLabel,
                    sessions: data.sessionsInFocus,
                    onOpenClasses: onOpenClasses,
                    onOpenClass: onOpenClass,
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

  List<AttentionItem> _attentionItems() {
    final overdue = data.overdueInvoices;

    return [
      for (final roll in data.outstandingRolls)
        AttentionItem(
          title: roll.title,
          subtitle: roll.subtitle,
          action: PillButton(
            label: 'Open',
            onPressed: () => onOpenClass(roll.classId),
          ),
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
      // Informational only. One-off bookings take effect immediately, so there
      // is nothing here to approve — the reference's `Approve` button would be
      // a control with no transition behind it.
      if (data.oneOffBookingsThisWeek > 0)
        AttentionItem(
          title: data.oneOffBookingsThisWeek == 1
              ? '1 one-off booking this week'
              : '${data.oneOffBookingsThisWeek} one-off bookings this week',
          subtitle: 'Already booked · no action needed',
          tone: AppColors.blue,
          onTap: onOpenClasses,
        ),
    ];
  }
}

String _dayLabel(int days) => days == 1 ? '1 day' : '$days days';

class _SessionsSection extends StatelessWidget {
  final String label;
  final List<AdminDashboardSession> sessions;
  final VoidCallback onOpenClasses;
  final void Function(String classId) onOpenClass;

  const _SessionsSection({
    required this.label,
    required this.sessions,
    required this.onOpenClasses,
    required this.onOpenClass,
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
              onTap: () => onOpenClass(sessions[i].classId),
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
    final tutor = session.tutorLabel;

    return LedgerRow(
      time: DateFormat('h:mm').format(session.startsAt),
      title: tutor.isEmpty ? session.title : '${session.title} · $tutor',
      subtitle: session.rosterCount == 1
          ? '1 student'
          : '${session.rosterCount} students',
      trailing: StatusPill(
        label: session.rollLabel,
        tone: session.rollComplete ? StatusTone.success : StatusTone.danger,
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
