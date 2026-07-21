import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_data.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

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
            _DashboardHeader(
              data: data,
              onOpenClasses: onOpenClasses,
              onOpenMessages: onOpenMessages,
              onOpenProfile: onOpenProfile,
            ),
            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.paper,
                  borderRadius: BorderRadius.vertical(
                    top: Radius.circular(28),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Color(0x40000000),
                      blurRadius: 30,
                      offset: Offset(0, -12),
                    ),
                  ],
                ),
                clipBehavior: Clip.antiAlias,
                child: Material(
                  color: AppColors.paper,
                  child: RefreshIndicator(
                    color: AppColors.blue,
                    onRefresh: onRefresh,
                    child: CustomScrollView(
                      key: const Key('tutor-dashboard-scroll'),
                      physics: const AlwaysScrollableScrollPhysics(),
                      slivers: [
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(22, 20, 22, 24),
                          sliver: SliverList.list(
                            children: [
                              _NextClassSection(
                                session: data.nextClass,
                                onTap: onOpenClasses,
                              ),
                              if (data.attentionItems.isNotEmpty) ...[
                                const SizedBox(height: 14),
                                _AttentionSection(
                                  items: data.attentionItems,
                                  onTap: onOpenClasses,
                                ),
                              ],
                              const SizedBox(height: 14),
                              _AnnouncementSection(
                                announcement: data.latestAnnouncement,
                                onTap: onOpenAnnouncements,
                              ),
                              const SizedBox(height: 14),
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
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DashboardHeader extends StatelessWidget {
  final TutorDashboardViewData data;
  final VoidCallback onOpenClasses;
  final VoidCallback onOpenMessages;
  final VoidCallback onOpenProfile;

  const _DashboardHeader({
    required this.data,
    required this.onOpenClasses,
    required this.onOpenMessages,
    required this.onOpenProfile,
  });

  @override
  Widget build(BuildContext context) {
    final initial = data.tutorName.trim().isEmpty
        ? 'T'
        : data.tutorName.trim().substring(0, 1).toUpperCase();

    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 8, 22, 14),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Image.asset(
                      'lib/assets/img/Tenacity-Vertical-Logo-White.png',
                      height: 24,
                      alignment: Alignment.centerLeft,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => Text(
                        'TENACITY',
                        style: AppText.display(
                          fontSize: 15,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${data.greeting}, ${data.tutorName}',
                      key: const Key('tutor-dashboard-greeting'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.display(
                        fontSize: 25,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ).copyWith(height: 1.12),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${data.classesToday} ${data.classesToday == 1 ? 'class' : 'classes'} today.',
                      style: AppText.serif(
                        fontSize: 15,
                        color: Colors.white.withValues(alpha: 0.62),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Semantics(
                button: true,
                label: 'Open profile',
                child: InkWell(
                  key: const Key('tutor-dashboard-profile'),
                  customBorder: const CircleBorder(),
                  onTap: onOpenProfile,
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.blue,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.22),
                        width: 2,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      initial,
                      style: AppText.display(
                        fontSize: 17,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  key: const Key('tutor-dashboard-classes-stat'),
                  value: '${data.classesToday}',
                  label: 'classes today',
                  onTap: onOpenClasses,
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: _StatTile(
                  key: const Key('tutor-dashboard-rolls-stat'),
                  value: '${data.rollsToMark}',
                  label: 'rolls to mark',
                  showDot: data.rollsToMark > 0,
                  onTap: onOpenClasses,
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: _StatTile(
                  key: const Key('tutor-dashboard-messages-stat'),
                  value: '${data.unreadMessages}',
                  label: 'unread messages',
                  valueColor: AppColors.blue300,
                  showDot: data.unreadMessages > 0,
                  onTap: onOpenMessages,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String value;
  final String label;
  final Color valueColor;
  final bool showDot;
  final VoidCallback onTap;

  const _StatTile({
    super.key,
    required this.value,
    required this.label,
    required this.onTap,
    this.valueColor = Colors.white,
    this.showDot = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.07),
      shape: RoundedRectangleBorder(
        side: BorderSide(color: Colors.white.withValues(alpha: 0.11)),
        borderRadius: BorderRadius.circular(14),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    value,
                    style: AppText.display(
                      fontSize: 20,
                      color: valueColor,
                    ).copyWith(height: 1),
                  ),
                  if (showDot) ...[
                    const SizedBox(width: 6),
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: Color(0xFFE05A5A),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 2,
                style: AppText.body(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.6),
                ).copyWith(height: 1.25),
              ),
            ],
          ),
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
        _SectionHeader(
          title: 'NEXT CLASS',
          trailing: next == null
              ? null
              : DateFormat('EEE d MMM').format(next.startsAt),
        ),
        const SizedBox(height: 10),
        Material(
          key: const Key('tutor-dashboard-next-class'),
          color: AppColors.blue50,
          borderRadius: BorderRadius.circular(AppRadii.md),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
              child: next == null
                  ? Row(
                      children: [
                        const Icon(
                          Icons.event_available_outlined,
                          color: AppColors.blue,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'No upcoming classes',
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
                  : Row(
                      children: [
                        SizedBox(
                          width: 50,
                          child: Column(
                            children: [
                              Text(
                                DateFormat('h:mm').format(next.startsAt),
                                style: AppText.display(
                                  fontSize: 17,
                                  color: AppColors.blue600,
                                ).copyWith(height: 1.1),
                              ),
                              Text(
                                next.durationLabel,
                                style: AppText.body(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Container(
                          width: 3,
                          height: 38,
                          decoration: BoxDecoration(
                            color: AppColors.blue,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                next.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.body(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.ink,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${next.studentCount} ${next.studentCount == 1 ? 'student' : 'students'}',
                                style: AppText.body(
                                  fontSize: 12.5,
                                  color: AppColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.ink,
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                          child: Text(
                            'Open roll',
                            style: AppText.body(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
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

class _AttentionSection extends StatelessWidget {
  final List<TutorDashboardAttentionItem> items;
  final VoidCallback onTap;

  const _AttentionSection({required this.items, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionHeader(title: 'NEEDS ATTENTION'),
        const SizedBox(height: 10),
        Container(
          key: const Key('tutor-dashboard-attention'),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              for (var index = 0; index < items.length; index++)
                _AttentionRow(
                  item: items[index],
                  showDivider: index < items.length - 1,
                  onTap: onTap,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AttentionRow extends StatelessWidget {
  final TutorDashboardAttentionItem item;
  final bool showDivider;
  final VoidCallback onTap;

  const _AttentionRow({
    required this.item,
    required this.showDivider,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: showDivider
                ? const Border(bottom: BorderSide(color: AppColors.lineSoft))
                : null,
          ),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFFD64545),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.body(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      item.subtitle,
                      style: AppText.body(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: AppColors.muted,
              ),
            ],
          ),
        ),
      ),
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
        _SectionHeader(
          title: 'LATEST ANNOUNCEMENT',
          actionLabel: 'All',
          onAction: onTap,
        ),
        const SizedBox(height: 10),
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
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: latest == null
                  ? Row(
                      children: [
                        const Icon(
                          Icons.campaign_outlined,
                          color: AppColors.blue,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
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
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.blue100,
                                borderRadius:
                                    BorderRadius.circular(AppRadii.pill),
                              ),
                              child: Text(
                                latest.audienceLabel,
                                style: AppText.body(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.blue600,
                                ).copyWith(letterSpacing: 0.4),
                              ),
                            ),
                            const SizedBox(width: 8),
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
                        const SizedBox(height: 4),
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
        const _SectionHeader(title: 'QUICK ACTIONS'),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _QuickActionCard(
                key: const Key('tutor-dashboard-write-feedback'),
                icon: Icons.edit_outlined,
                label: 'Write feedback',
                onTap: onWriteFeedback,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _QuickActionCard(
                key: const Key('tutor-dashboard-mark-attendance'),
                icon: Icons.task_alt_rounded,
                label: 'Mark attendance',
                onTap: onMarkAttendance,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickActionCard({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.paper,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.line, width: 1.5),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: AppColors.blue),
              const SizedBox(height: 8),
              Text(
                label,
                style: AppText.body(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? trailing;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _SectionHeader({
    required this.title,
    this.trailing,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(
          child: Text(
            title,
            style: AppText.body(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.muted,
            ).copyWith(letterSpacing: 1.54),
          ),
        ),
        if (trailing != null)
          Text(
            trailing!,
            style: AppText.body(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
            ),
          ),
        if (actionLabel != null)
          InkWell(
            onTap: onAction,
            borderRadius: BorderRadius.circular(8),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 2),
              child: Text(
                actionLabel!,
                style: AppText.body(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.blue,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
