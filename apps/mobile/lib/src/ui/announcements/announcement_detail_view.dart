import 'package:flutter/material.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:intl/intl.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcements/announcement_data.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class AnnouncementDetailView extends StatelessWidget {
  final Announcement announcement;
  final bool isAdmin;
  final VoidCallback onBack;
  final ValueChanged<String> onOpenLink;
  final VoidCallback? onEdit;
  final VoidCallback? onArchiveToggle;
  final VoidCallback? onDelete;

  const AnnouncementDetailView({
    super.key,
    required this.announcement,
    required this.isAdmin,
    required this.onBack,
    required this.onOpenLink,
    this.onEdit,
    this.onArchiveToggle,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final date =
        DateFormat('d MMMM yyyy · h:mm a').format(announcement.createdAt);

    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(onBack: onBack),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('announcement-detail-scroll'),
                children: [
                  Row(
                    children: [
                      _AudienceBadge(
                        label: announcementAudienceLabel(announcement.audience),
                      ),
                      if (announcement.archived) ...[
                        const SizedBox(width: AppSpacing.sm),
                        const _ArchivedBadge(),
                      ],
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    announcement.title,
                    style: AppText.display(
                      fontSize: 27,
                      color: AppColors.ink,
                    ).copyWith(height: 1.14),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    date,
                    style: AppText.body(
                      fontSize: 12,
                      color: AppColors.muted,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  Linkify(
                    key: const Key('announcement-detail-body'),
                    onOpen: (link) => onOpenLink(link.url),
                    text: announcement.body,
                    style: AppText.body(
                      fontSize: 15,
                      color: AppColors.text,
                    ).copyWith(height: 1.65),
                    linkStyle: AppText.body(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.blue,
                    ).copyWith(
                      height: 1.65,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                  if (isAdmin) ...[
                    const SizedBox(height: AppSpacing.xxl),
                    const Divider(color: AppColors.line),
                    const SizedBox(height: AppSpacing.md),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: [
                        OutlinedButton.icon(
                          key: const Key('announcement-detail-edit'),
                          onPressed: onEdit,
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Edit'),
                        ),
                        OutlinedButton.icon(
                          key: const Key('announcement-detail-archive'),
                          onPressed: onArchiveToggle,
                          icon: Icon(
                            announcement.archived
                                ? Icons.unarchive_outlined
                                : Icons.archive_outlined,
                          ),
                          label: Text(
                            announcement.archived ? 'Restore' : 'Archive',
                          ),
                        ),
                        TextButton.icon(
                          key: const Key('announcement-detail-delete'),
                          onPressed: onDelete,
                          style: TextButton.styleFrom(
                            foregroundColor: AppColors.danger,
                          ),
                          icon: const Icon(Icons.delete_outline_rounded),
                          label: const Text('Delete'),
                        ),
                      ],
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
  final VoidCallback onBack;

  const _Header({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xl,
      ),
      child: Row(
        children: [
          IconButton(
            key: const Key('announcement-detail-back'),
            tooltip: 'Back',
            onPressed: onBack,
            color: Colors.white,
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text(
              'Announcement',
              style: AppText.display(fontSize: 25, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

class _AudienceBadge extends StatelessWidget {
  final String label;

  const _AudienceBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: AppColors.blue50,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        label,
        style: AppText.body(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.blue600,
        ).copyWith(letterSpacing: 0.4),
      ),
    );
  }
}

class _ArchivedBadge extends StatelessWidget {
  const _ArchivedBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: AppColors.skeleton,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        'ARCHIVED',
        style: AppText.body(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.muted,
        ).copyWith(letterSpacing: 0.4),
      ),
    );
  }
}
