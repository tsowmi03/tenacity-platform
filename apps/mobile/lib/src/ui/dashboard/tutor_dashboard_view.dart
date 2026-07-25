import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The tutor's dashboard: today at a glance, then what needs doing.
///
/// Presentation only — [data] is derived by `buildTutorDashboardViewData` so
/// the layout can be tested without Firestore.
class TutorDashboardView extends StatelessWidget {
  final TutorDashboardViewData data;
  final Future<void> Function() onRefresh;
  final VoidCallback onOpenClasses;
  final VoidCallback onOpenMessages;
  final VoidCallback onOpenAnnouncements;
  final VoidCallback onOpenProfile;

  const TutorDashboardView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onOpenClasses,
    required this.onOpenMessages,
    required this.onOpenAnnouncements,
    required this.onOpenProfile,
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
              title: '${data.greeting}, ${data.tutorName}',
              subtitle:
                  '${data.classesToday} ${data.classesToday == 1 ? 'class' : 'classes'} today.',
              avatarInitial: avatarInitialFor(data.tutorName, fallback: 'T'),
              avatarKey: const Key('tutor-dashboard-profile'),
              onAvatarTap: onOpenProfile,
              metrics: [
                MetricTile(
                  key: const Key('tutor-dashboard-classes-stat'),
                  value: '${data.classesToday}',
                  label: 'classes today',
                  onTap: onOpenClasses,
                ),
                MetricTile(
                  key: const Key('tutor-dashboard-rolls-stat'),
                  value: '${data.rollsToMark}',
                  label: 'rolls to mark',
                  showDot: data.rollsToMark > 0,
                  onTap: onOpenClasses,
                ),
                MetricTile(
                  key: const Key('tutor-dashboard-messages-stat'),
                  value: '${data.unreadMessages}',
                  label: 'unread messages',
                  valueColor: AppColors.blue300,
                  showDot: data.unreadMessages > 0,
                  onTap: onOpenMessages,
                ),
              ],
            ),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('tutor-dashboard-scroll'),
                onRefresh: onRefresh,
                children: [
                  _NextClassSection(
                    session: data.nextClass,
                    onTap: onOpenClasses,
                  ),
                  if (data.attentionItems.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sectionGap),
                    const SectionLabel(title: 'NEEDS ATTENTION'),
                    const SizedBox(height: AppSpacing.labelGap),
                    AttentionList(
                      key: const Key('tutor-dashboard-attention'),
                      items: [
                        for (final item in data.attentionItems)
                          AttentionItem(
                            title: item.title,
                            subtitle: item.subtitle,
                            onTap: onOpenClasses,
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: AppSpacing.sectionGap),
                  _AnnouncementSection(
                    announcement: data.latestAnnouncement,
                    onTap: onOpenAnnouncements,
                  ),
                  const SizedBox(height: AppSpacing.sectionGap),
                  _QuickActions(
                    onWriteFeedback: onOpenClasses,
                    onMarkAttendance: onOpenClasses,
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

class _NextClassSection extends StatelessWidget {
  final TutorDashboardSession? session;
  final VoidCallback onTap;

  const _NextClassSection({required this.session, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final next = session;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          title: 'NEXT CLASS',
          trailing: next == null
              ? null
              : DateFormat('EEE d MMM').format(next.startsAt),
        ),
        const SizedBox(height: AppSpacing.labelGap),
        if (next == null)
          LedgerRowEmpty(
            key: const Key('tutor-dashboard-next-class'),
            message: 'No upcoming classes',
            onTap: onTap,
          )
        else
          LedgerRow(
            key: const Key('tutor-dashboard-next-class'),
            time: DateFormat('h:mm').format(next.startsAt),
            duration: next.durationLabel,
            title: next.title,
            subtitle:
                '${next.studentCount} ${next.studentCount == 1 ? 'student' : 'students'}',
            trailing: const PillButton(label: 'Open roll'),
            onTap: onTap,
          ),
      ],
    );
  }
}

class _AnnouncementSection extends StatelessWidget {
  final TutorDashboardAnnouncement? announcement;
  final VoidCallback onTap;

  const _AnnouncementSection({
    required this.announcement,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final latest = announcement;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          title: 'LATEST ANNOUNCEMENT',
          actionLabel: 'All',
          onAction: onTap,
        ),
        const SizedBox(height: AppSpacing.labelGap),
        Material(
          key: const Key('tutor-dashboard-announcement'),
          color: AppColors.paper,
          shape: RoundedRectangleBorder(
            side: const BorderSide(color: AppColors.line),
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.sectionGap,
              ),
              child: latest == null
                  ? Row(
                      children: [
                        const Icon(
                          Icons.campaign_outlined,
                          color: AppColors.blue,
                          size: 22,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Text(
                            'No current announcements',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.body(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppColors.ink,
                            ),
                          ),
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            StatusPill(
                              label: latest.audienceLabel,
                              tone: StatusTone.info,
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Text(
                              latest.ageLabel,
                              style: AppText.body(
                                fontSize: 11.5,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        Text(
                          latest.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.body(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          latest.body,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.body(
                            fontSize: 12.5,
                            color: AppColors.muted,
                          ).copyWith(height: 1.4),
                        ),
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
  final VoidCallback onWriteFeedback;
  final VoidCallback onMarkAttendance;

  const _QuickActions({
    required this.onWriteFeedback,
    required this.onMarkAttendance,
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
              key: const Key('tutor-dashboard-write-feedback'),
              icon: Icons.edit_outlined,
              label: 'Write feedback',
              onTap: onWriteFeedback,
            ),
            QuickActionTile(
              key: const Key('tutor-dashboard-mark-attendance'),
              icon: Icons.task_alt_rounded,
              label: 'Mark attendance',
              onTap: onMarkAttendance,
            ),
          ],
        ),
      ],
    );
  }
}
