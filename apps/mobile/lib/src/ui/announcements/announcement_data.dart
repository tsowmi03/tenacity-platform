import 'package:intl/intl.dart';
import 'package:tenacity/src/models/announcement_model.dart';

enum AnnouncementAudienceFilter {
  all('All'),
  parents('Parents'),
  tutors('Tutors');

  final String label;

  const AnnouncementAudienceFilter(this.label);
}

class AnnouncementListItem {
  final Announcement announcement;
  final String audienceLabel;
  final String dateLabel;
  final bool isUnread;

  const AnnouncementListItem({
    required this.announcement,
    required this.audienceLabel,
    required this.dateLabel,
    required this.isUnread,
  });
}

class AnnouncementSection {
  final String label;
  final List<AnnouncementListItem> items;

  const AnnouncementSection({required this.label, required this.items});
}

class AnnouncementListViewData {
  final bool isAdmin;
  final String subtitle;
  final int unreadCount;
  final AnnouncementAudienceFilter audienceFilter;
  final List<AnnouncementSection> sections;

  const AnnouncementListViewData({
    required this.isAdmin,
    required this.subtitle,
    required this.unreadCount,
    required this.audienceFilter,
    required this.sections,
  });

  bool get isEmpty => sections.every((section) => section.items.isEmpty);
}

AnnouncementListViewData buildAnnouncementListViewData({
  required List<Announcement> announcements,
  required String role,
  required Set<String> readAnnouncementIds,
  AnnouncementAudienceFilter audienceFilter = AnnouncementAudienceFilter.all,
  DateTime? now,
}) {
  final normalisedRole = role.toLowerCase();
  final isAdmin = normalisedRole == 'admin';
  final currentTime = now ?? DateTime.now();

  final visible = announcements.where((announcement) {
    if (isAdmin) {
      return switch (audienceFilter) {
        AnnouncementAudienceFilter.all => true,
        AnnouncementAudienceFilter.parents => announcement.audience == 'parent',
        AnnouncementAudienceFilter.tutors => announcement.audience == 'tutor',
      };
    }

    return !announcement.archived &&
        (announcement.audience == 'all' ||
            announcement.audience == normalisedRole);
  }).toList()
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  AnnouncementListItem itemFor(Announcement announcement) {
    return AnnouncementListItem(
      announcement: announcement,
      audienceLabel: announcementAudienceLabel(announcement.audience),
      dateLabel: announcementDateLabel(announcement.createdAt, currentTime),
      isUnread: !isAdmin && !readAnnouncementIds.contains(announcement.id),
    );
  }

  if (isAdmin) {
    final published = visible
        .where((announcement) => !announcement.archived)
        .map(itemFor)
        .toList();
    final archived = visible
        .where((announcement) => announcement.archived)
        .map(itemFor)
        .toList();

    return AnnouncementListViewData(
      isAdmin: true,
      subtitle: 'Posted to families & staff',
      unreadCount: 0,
      audienceFilter: audienceFilter,
      sections: [
        if (published.isNotEmpty)
          AnnouncementSection(label: 'PUBLISHED', items: published),
        if (archived.isNotEmpty)
          AnnouncementSection(label: 'ARCHIVED', items: archived),
      ],
    );
  }

  final items = visible.map(itemFor).toList();
  final unread = items.where((item) => item.isUnread).toList();
  final earlier = items.where((item) => !item.isUnread).toList();

  return AnnouncementListViewData(
    isAdmin: false,
    subtitle: normalisedRole == 'tutor'
        ? 'For all staff & tutors · read to clear'
        : 'Updates for your family · read to clear',
    unreadCount: unread.length,
    audienceFilter: AnnouncementAudienceFilter.all,
    sections: [
      if (unread.isNotEmpty)
        AnnouncementSection(label: 'UNREAD', items: unread),
      if (earlier.isNotEmpty)
        AnnouncementSection(label: 'EARLIER', items: earlier),
    ],
  );
}

String announcementAudienceLabel(String audience) => switch (audience) {
      'parent' => 'PARENTS',
      'tutor' => 'TUTORS',
      'admin' => 'ADMINS',
      _ => 'ALL',
    };

String announcementDateLabel(DateTime value, DateTime now) {
  final date = DateTime(value.year, value.month, value.day);
  final today = DateTime(now.year, now.month, now.day);
  final difference = today.difference(date).inDays;

  if (difference == 0) return DateFormat('h:mm a').format(value);
  if (difference == 1) return 'Yesterday';
  if (difference > 1 && difference < 7) return DateFormat('EEE').format(value);
  if (value.year == now.year) return DateFormat('d MMM').format(value);
  return DateFormat('d MMM yy').format(value);
}

bool hasUnreadAnnouncementsForRole({
  required List<Announcement> announcements,
  required String role,
  required Set<String> readAnnouncementIds,
}) {
  final normalisedRole = role.toLowerCase();
  return announcements.any(
    (announcement) =>
        !announcement.archived &&
        (announcement.audience == 'all' ||
            announcement.audience == normalisedRole) &&
        !readAnnouncementIds.contains(announcement.id),
  );
}
