import 'package:flutter/material.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcements/announcement_data.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class AnnouncementListView extends StatelessWidget {
  final AnnouncementListViewData data;
  final bool isLoading;
  final String? errorMessage;
  final Future<void> Function() onRefresh;
  final VoidCallback? onRetry;
  final ValueChanged<int> onFilterSelected;
  final ValueChanged<Announcement> onOpen;
  final VoidCallback? onAdd;
  final Future<bool> Function(Announcement announcement)? onConfirmDelete;

  const AnnouncementListView({
    super.key,
    required this.data,
    required this.isLoading,
    required this.onRefresh,
    required this.onFilterSelected,
    required this.onOpen,
    this.errorMessage,
    this.onRetry,
    this.onAdd,
    this.onConfirmDelete,
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
              onAdd: onAdd,
              onFilterSelected: onFilterSelected,
            ),
            Expanded(
              child: ContentSheet.fixed(
                padding: EdgeInsets.zero,
                child: _body(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (isLoading && data.isEmpty) {
      return const _LoadingAnnouncements();
    }

    if (errorMessage != null && data.isEmpty) {
      return Center(
        child: ErrorStateView(
          title: 'Announcements could not be loaded',
          message: errorMessage,
          onRetry: onRetry,
        ),
      );
    }

    if (data.isEmpty) {
      return const Center(
        child: EmptyStateView(
          icon: Icons.campaign_outlined,
          title: 'No announcements',
          message: 'New announcements will appear here.',
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.blue,
      onRefresh: onRefresh,
      child: ListView(
        key: const Key('announcement-list'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.xxl,
          AppSpacing.screenH,
          AppSpacing.xxl,
        ),
        children: [
          if (errorMessage != null) ...[
            _InlineError(message: errorMessage!, onRetry: onRetry),
            const SizedBox(height: AppSpacing.lg),
          ],
          for (var sectionIndex = 0;
              sectionIndex < data.sections.length;
              sectionIndex++) ...[
            _SectionHeading(
              title: data.sections[sectionIndex].label,
              showDeleteHint: data.isAdmin &&
                  data.sections[sectionIndex].label == 'PUBLISHED',
            ),
            const SizedBox(height: AppSpacing.labelGap),
            for (var itemIndex = 0;
                itemIndex < data.sections[sectionIndex].items.length;
                itemIndex++) ...[
              if (itemIndex > 0) const SizedBox(height: AppSpacing.labelGap),
              _dismissibleRow(data.sections[sectionIndex].items[itemIndex]),
            ],
            if (sectionIndex < data.sections.length - 1)
              const SizedBox(height: AppSpacing.xl),
          ],
        ],
      ),
    );
  }

  Widget _dismissibleRow(AnnouncementListItem item) {
    final row = AnnouncementRow(
      key: Key('announcement-${item.announcement.id}'),
      item: item,
      isAdmin: data.isAdmin,
      onTap: () => onOpen(item.announcement),
    );

    if (!data.isAdmin || onConfirmDelete == null) return row;

    return Dismissible(
      key: Key('dismiss-announcement-${item.announcement.id}'),
      direction: DismissDirection.endToStart,
      background: const _DeleteBackground(),
      confirmDismiss: (_) => onConfirmDelete!(item.announcement),
      child: row,
    );
  }
}

class _Header extends StatelessWidget {
  final AnnouncementListViewData data;
  final VoidCallback? onAdd;
  final ValueChanged<int> onFilterSelected;

  const _Header({
    required this.data,
    required this.onAdd,
    required this.onFilterSelected,
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Announcements',
                      style: AppText.display(fontSize: 27, color: Colors.white),
                    ),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      data.subtitle,
                      style: AppText.body(
                        fontSize: 12.5,
                        color: Colors.white.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
              if (onAdd != null)
                Semantics(
                  button: true,
                  label: 'Create announcement',
                  child: Material(
                    color: AppColors.blue,
                    shape: const CircleBorder(),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: onAdd,
                      child: const SizedBox(
                        width: 42,
                        height: 42,
                        child: Icon(
                          Icons.add_rounded,
                          color: Colors.white,
                          size: 22,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          if (data.isAdmin) ...[
            const SizedBox(height: AppSpacing.lg),
            SegmentedFilter(
              key: const Key('announcement-audience-filter'),
              segments: [
                for (final filter in AnnouncementAudienceFilter.values)
                  filter.label,
              ],
              selectedIndex: data.audienceFilter.index,
              onSelected: onFilterSelected,
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  final String title;
  final bool showDeleteHint;

  const _SectionHeading({required this.title, required this.showDeleteHint});

  @override
  Widget build(BuildContext context) {
    return SectionLabel(
      title: title,
      trailing: showDeleteHint ? 'swipe a row to delete' : null,
    );
  }
}

class AnnouncementRow extends StatelessWidget {
  final AnnouncementListItem item;
  final bool isAdmin;
  final VoidCallback onTap;

  const AnnouncementRow({
    super.key,
    required this.item,
    required this.isAdmin,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final announcement = item.announcement;
    final muted = !isAdmin && !item.isUnread || announcement.archived;

    return Opacity(
      opacity: muted ? 0.72 : 1,
      child: Material(
        color: AppColors.paper,
        shape: RoundedRectangleBorder(
          side: BorderSide(
            color: AppColors.ink.withValues(alpha: 0.10),
          ),
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (item.isUnread)
                  const SizedBox(
                      width: 4, child: ColoredBox(color: AppColors.blue)),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _AudienceBadge(
                              label: item.audienceLabel,
                              strong: isAdmin && announcement.audience == 'all',
                            ),
                            const Spacer(),
                            if (item.isUnread) ...[
                              const _UnreadDot(),
                              const SizedBox(width: AppSpacing.sm),
                            ],
                            Text(
                              item.dateLabel,
                              style: AppText.body(
                                fontSize: 11.5,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          announcement.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.body(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink,
                          ).copyWith(height: 1.25),
                        ),
                        if (!announcement.archived) ...[
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            announcement.body,
                            maxLines: item.isUnread || isAdmin ? 2 : 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.body(
                              fontSize: 12.5,
                              color: AppColors.muted,
                            ).copyWith(height: 1.45),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AudienceBadge extends StatelessWidget {
  final String label;
  final bool strong;

  const _AudienceBadge({required this.label, required this.strong});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 3),
      decoration: BoxDecoration(
        color: strong ? AppColors.blue : AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        label,
        style: AppText.body(
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          color: strong ? Colors.white : AppColors.blue600,
        ).copyWith(letterSpacing: 0.4),
      ),
    );
  }
}

class _UnreadDot extends StatelessWidget {
  const _UnreadDot();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      width: AppSizes.attentionDot,
      height: AppSizes.attentionDot,
      child: DecoratedBox(
        decoration:
            BoxDecoration(color: AppColors.blue, shape: BoxShape.circle),
      ),
    );
  }
}

class _DeleteBackground extends StatelessWidget {
  const _DeleteBackground();

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
      color: AppColors.danger,
      child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
    );
  }
}

class _LoadingAnnouncements extends StatelessWidget {
  const _LoadingAnnouncements();

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xxl,
        AppSpacing.screenH,
        AppSpacing.xxl,
      ),
      children: const [
        SkeletonBlock(height: 12, width: 80, radius: AppRadii.sm),
        SizedBox(height: AppSpacing.md),
        SkeletonBlock(height: 126),
        SizedBox(height: AppSpacing.labelGap),
        SkeletonBlock(height: 126),
      ],
    );
  }
}

class _InlineError extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;

  const _InlineError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.blue50,
      borderRadius: BorderRadius.circular(AppRadii.sm),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          children: [
            const Icon(
              Icons.error_outline_rounded,
              color: AppColors.danger,
              size: 20,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                message,
                style: AppText.body(fontSize: 12.5, color: AppColors.text),
              ),
            ),
            if (onRetry != null)
              TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
