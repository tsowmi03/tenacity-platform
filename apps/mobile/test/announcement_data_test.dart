import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/ui/announcements/announcement_data.dart';

void main() {
  final now = DateTime(2026, 7, 27, 14, 30);

  Announcement announcement({
    required String id,
    String audience = 'all',
    bool archived = false,
    DateTime? createdAt,
  }) {
    return Announcement(
      id: id,
      title: 'Announcement $id',
      body: 'Body for $id',
      createdAt: createdAt ?? now,
      archived: archived,
      audience: audience,
    );
  }

  group('reader feed', () {
    test('keeps only active announcements for the reader audience', () {
      final data = buildAnnouncementListViewData(
        announcements: [
          announcement(id: 'all'),
          announcement(id: 'parent', audience: 'parent'),
          announcement(id: 'tutor', audience: 'tutor'),
          announcement(id: 'archived', archived: true),
        ],
        role: 'parent',
        readAnnouncementIds: const {},
        now: now,
      );

      expect(
        data.sections.single.items.map((item) => item.announcement.id),
        ['all', 'parent'],
      );
    });

    test('groups unread before earlier without changing date order', () {
      final data = buildAnnouncementListViewData(
        announcements: [
          announcement(
            id: 'read-new',
            createdAt: DateTime(2026, 7, 27, 13),
          ),
          announcement(
            id: 'unread-new',
            createdAt: DateTime(2026, 7, 27, 12),
          ),
          announcement(
            id: 'unread-old',
            createdAt: DateTime(2026, 7, 20),
          ),
        ],
        role: 'tutor',
        readAnnouncementIds: const {'read-new'},
        now: now,
      );

      expect(data.unreadCount, 2);
      expect(data.sections.map((section) => section.label), [
        'UNREAD',
        'EARLIER',
      ]);
      expect(
        data.sections.first.items.map((item) => item.announcement.id),
        ['unread-new', 'unread-old'],
      );
      expect(
        data.sections.last.items.map((item) => item.announcement.id),
        ['read-new'],
      );
    });

    test('uses role-specific header copy', () {
      final parent = buildAnnouncementListViewData(
        announcements: const [],
        role: 'parent',
        readAnnouncementIds: const {},
        now: now,
      );
      final tutor = buildAnnouncementListViewData(
        announcements: const [],
        role: 'tutor',
        readAnnouncementIds: const {},
        now: now,
      );

      expect(parent.subtitle, 'Updates for your family · read to clear');
      expect(tutor.subtitle, 'For all staff & tutors · read to clear');
    });
  });

  group('admin feed', () {
    test('groups published and archived announcements', () {
      final data = buildAnnouncementListViewData(
        announcements: [
          announcement(id: 'published'),
          announcement(id: 'archived', archived: true),
        ],
        role: 'admin',
        readAnnouncementIds: const {},
        now: now,
      );

      expect(data.isAdmin, isTrue);
      expect(data.sections.map((section) => section.label), [
        'PUBLISHED',
        'ARCHIVED',
      ]);
      expect(data.sections.first.items.single.announcement.id, 'published');
      expect(data.sections.last.items.single.announcement.id, 'archived');
    });

    test('filters exact parent and tutor audiences', () {
      final announcements = [
        announcement(id: 'all'),
        announcement(id: 'parent', audience: 'parent'),
        announcement(id: 'tutor', audience: 'tutor'),
        announcement(id: 'admin', audience: 'admin'),
      ];

      final parents = buildAnnouncementListViewData(
        announcements: announcements,
        role: 'admin',
        readAnnouncementIds: const {},
        audienceFilter: AnnouncementAudienceFilter.parents,
        now: now,
      );
      final tutors = buildAnnouncementListViewData(
        announcements: announcements,
        role: 'admin',
        readAnnouncementIds: const {},
        audienceFilter: AnnouncementAudienceFilter.tutors,
        now: now,
      );

      expect(
        parents.sections.single.items.single.announcement.id,
        'parent',
      );
      expect(tutors.sections.single.items.single.announcement.id, 'tutor');
    });
  });

  group('labels', () {
    test('maps stored audiences to display labels', () {
      expect(announcementAudienceLabel('all'), 'ALL');
      expect(announcementAudienceLabel('parent'), 'PARENTS');
      expect(announcementAudienceLabel('tutor'), 'TUTORS');
      expect(announcementAudienceLabel('admin'), 'ADMINS');
      expect(announcementAudienceLabel('unexpected'), 'ALL');
    });

    test('degrades dates from time to year', () {
      expect(announcementDateLabel(DateTime(2026, 7, 27, 9), now), '9:00 AM');
      expect(
        announcementDateLabel(DateTime(2026, 7, 26, 9), now),
        'Yesterday',
      );
      expect(announcementDateLabel(DateTime(2026, 7, 23), now), 'Thu');
      expect(announcementDateLabel(DateTime(2026, 7, 8), now), '8 Jul');
      expect(announcementDateLabel(DateTime(2025, 7, 8), now), '8 Jul 25');
    });
  });
}
