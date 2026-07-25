import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The parent dashboard: today's classes, anything needing attention, the most
/// recent progress note, and the two actions families take most often.
///
/// Presentation only — [data] comes from `buildParentDashboardViewData`, so
/// this can be tested at any viewport without Firestore.
class ParentDashboardView extends StatelessWidget {
  final ParentDashboardViewData data;
  final Future<void> Function() onRefresh;
  final VoidCallback onOpenClasses;
  final VoidCallback onOpenMessages;
  final VoidCallback onOpenAnnouncements;
  final VoidCallback onOpenInvoices;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenFeedback;

  const ParentDashboardView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onOpenClasses,
    required this.onOpenMessages,
    required this.onOpenAnnouncements,
    required this.onOpenInvoices,
    required this.onOpenProfile,
    required this.onOpenFeedback,
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
              title: '${data.greeting}, ${data.parentName}',
              subtitle: data.subtitle,
              avatarInitial: avatarInitialFor(data.parentName, fallback: 'P'),
              avatarKey: const Key('parent-dashboard-profile'),
              onAvatarTap: onOpenProfile,
              metrics: [
                MetricTile(
                  key: const Key('parent-dashboard-classes-stat'),
                  value: '${data.classesThisWeek}',
                  label: 'classes this week',
                  onTap: onOpenClasses,
                ),
                MetricTile(
                  key: const Key('parent-dashboard-messages-stat'),
                  value: '${data.unreadMessages}',
                  label: 'unread messages',
                  showDot: data.unreadMessages > 0,
                  onTap: onOpenMessages,
                ),
                MetricTile(
                  key: const Key('parent-dashboard-due-stat'),
                  value: data.amountDueLabel,
                  label: data.amountDueCaption,
                  valueColor:
                      data.amountDue > 0 ? AppColors.blue300 : Colors.white,
                  onTap: onOpenInvoices,
                ),
              ],
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('parent-dashboard-scroll'),
                onRefresh: onRefresh,
                children: [
                  _TodaySection(
                    sessions: data.todaysSessions,
                    nextSession: data.nextSession,
                    onTap: onOpenClasses,
                  ),
                  if (data.hasAttentionItems) ...[
                    const SizedBox(height: AppSpacing.sectionGap),
                    const SectionLabel(title: 'NEEDS ATTENTION'),
                    const SizedBox(height: AppSpacing.labelGap),
                    AttentionList(
                      key: const Key('parent-dashboard-attention'),
                      items: _attentionItems(),
                    ),
                  ],
                  if (data.latestFeedback != null) ...[
                    const SizedBox(height: AppSpacing.sectionGap),
                    _FeedbackSection(
                      feedback: data.latestFeedback!,
                      onTap: onOpenFeedback,
                    ),
                  ],
                  const SizedBox(height: AppSpacing.sectionGap),
                  _QuickActions(
                    onBookOneOff: onOpenClasses,
                    onMessageTutor: onOpenMessages,
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
    final invoice = data.unpaidInvoice;
    final announcement = data.unreadAnnouncement;

    return [
      if (invoice != null)
        AttentionItem(
          title: 'Invoice ${invoice.reference} '
              '${invoice.isOverdue ? 'is overdue' : 'due ${DateFormat('d MMM').format(invoice.dueDate)}'}',
          subtitle: [
            _formatAmount(invoice.amountDue),
            if (invoice.studentsLabel.isNotEmpty) invoice.studentsLabel,
          ].join(' · '),
          tone: invoice.isOverdue ? AppColors.danger : AppColors.blue,
          action: PillButton(label: 'Pay', onPressed: onOpenInvoices),
        ),
      if (announcement != null)
        AttentionItem(
          title: announcement.title,
          subtitle: 'Announcement · ${announcement.ageLabel}',
          tone: AppColors.blue,
          onTap: onOpenAnnouncements,
        ),
    ];
  }
}

String _formatAmount(double amount) =>
    NumberFormat.currency(symbol: r'$', decimalDigits: 2).format(amount);

class _TodaySection extends StatelessWidget {
  final List<ParentDashboardSession> sessions;
  final ParentDashboardSession? nextSession;
  final VoidCallback onTap;

  const _TodaySection({
    required this.sessions,
    required this.nextSession,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final next = nextSession;
    final isToday = sessions.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          // With nothing on today, the section leads with the next class
          // instead of showing an empty "TODAY".
          title: isToday ? 'TODAY' : 'NEXT CLASS',
          trailing: isToday
              ? DateFormat('EEE d MMM').format(DateTime.now())
              : (next == null
                  ? null
                  : DateFormat('EEE d MMM').format(next.startsAt)),
        ),
        const SizedBox(height: AppSpacing.labelGap),
        if (isToday)
          for (var i = 0; i < sessions.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            _SessionRow(
              key: Key('parent-dashboard-session-$i'),
              session: sessions[i],
              onTap: onTap,
            ),
          ]
        else if (next != null)
          _SessionRow(
            key: const Key('parent-dashboard-session-0'),
            session: next,
            onTap: onTap,
          )
        else
          LedgerRowEmpty(
            key: const Key('parent-dashboard-no-classes'),
            message: 'No upcoming classes',
            onTap: onTap,
          ),
      ],
    );
  }
}

class _SessionRow extends StatelessWidget {
  final ParentDashboardSession session;
  final VoidCallback onTap;

  const _SessionRow({super.key, required this.session, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return LedgerRow(
      time: DateFormat('h:mm').format(session.startsAt),
      duration: session.durationLabel,
      title: session.title,
      subtitle: session.studentsLabel.isEmpty ? null : session.studentsLabel,
      onTap: onTap,
    );
  }
}

class _FeedbackSection extends StatelessWidget {
  final ParentDashboardFeedback feedback;
  final VoidCallback onTap;

  const _FeedbackSection({required this.feedback, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Column(
      // The card spans the sheet regardless of how short the note is; sized to
      // content it would shrink to a fraction of the width for a brief one.
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionLabel(title: 'LATEST FEEDBACK'),
        const SizedBox(height: AppSpacing.labelGap),
        Material(
          key: const Key('parent-dashboard-feedback'),
          color: AppColors.blue50,
          borderRadius: BorderRadius.circular(AppRadii.md),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 18,
                vertical: AppSpacing.md,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '“${feedback.quote}”',
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.serif(
                      fontSize: 15.5,
                      color: AppColors.ink,
                    ).copyWith(height: 1.4),
                  ),
                  if (feedback.attribution.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      feedback.attribution,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 12.5,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _QuickActions extends StatelessWidget {
  final VoidCallback onBookOneOff;
  final VoidCallback onMessageTutor;

  const _QuickActions({
    required this.onBookOneOff,
    required this.onMessageTutor,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel(title: 'QUICK ACTIONS'),
        const SizedBox(height: AppSpacing.labelGap),
        QuickActionGrid(
          tiles: [
            QuickActionTile(
              key: const Key('parent-dashboard-book-one-off'),
              icon: Icons.calendar_today_outlined,
              label: 'Book one-off class',
              onTap: onBookOneOff,
            ),
            QuickActionTile(
              key: const Key('parent-dashboard-message-tutor'),
              icon: Icons.chat_bubble_outline_rounded,
              label: 'Message a tutor',
              onTap: onMessageTutor,
            ),
          ],
        ),
      ],
    );
  }
}
