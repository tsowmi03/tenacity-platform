import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/home_navigation.dart';

void main() {
  group('destinationsForRole', () {
    test('gives each role the destinations its permissions allow', () {
      List<AppDestination> idsFor(String role) =>
          destinationsForRole(role, parentId: 'p1').map((d) => d.id).toList();

      expect(idsFor('parent'), const [
        AppDestination.dashboard,
        AppDestination.classes,
        AppDestination.announcements,
        AppDestination.messages,
        AppDestination.invoices,
      ]);

      // Tutors have no billing access and admins get both Users and Invoices.
      expect(idsFor('tutor'), const [
        AppDestination.dashboard,
        AppDestination.classes,
        AppDestination.announcements,
        AppDestination.users,
        AppDestination.messages,
      ]);

      expect(idsFor('admin'), const [
        AppDestination.dashboard,
        AppDestination.classes,
        AppDestination.announcements,
        AppDestination.users,
        AppDestination.messages,
        AppDestination.invoices,
      ]);
    });

    test('returns nothing for an unknown or empty role', () {
      expect(destinationsForRole('student'), isEmpty);
      expect(destinationsForRole(''), isEmpty);
    });

    test('never exposes users to parents or invoices to tutors', () {
      final parent = destinationsForRole('parent').map((d) => d.id);
      final tutor = destinationsForRole('tutor').map((d) => d.id);

      expect(parent, isNot(contains(AppDestination.users)));
      expect(tutor, isNot(contains(AppDestination.invoices)));
    });

    test('always puts the dashboard first so index 0 is a safe fallback', () {
      for (final role in const ['parent', 'tutor', 'admin']) {
        expect(
          destinationsForRole(role).first.id,
          AppDestination.dashboard,
          reason: '$role should start on the dashboard',
        );
      }
    });

    test('labels and icons are distinct within a role', () {
      for (final role in const ['parent', 'tutor', 'admin']) {
        final destinations = destinationsForRole(role);
        expect(
          destinations.map((d) => d.label).toSet(),
          hasLength(destinations.length),
          reason: '$role has a duplicate tab label',
        );
        expect(
          destinations.map((d) => d.icon).toSet(),
          hasLength(destinations.length),
          reason: '$role has a duplicate tab icon',
        );
      }
    });

    test('profile is not a destination — it is a pushed route', () {
      // Regression guard. Profile used to be mapped to index 5 for parents and
      // tutors, both of which had only five screens, so selecting it threw.
      for (final role in const ['parent', 'tutor', 'admin']) {
        final labels = destinationsForRole(role).map((d) => d.label);
        expect(labels, isNot(contains('Profile')));
      }
    });

    test('every destination a role has is reachable by its own index', () {
      // The shell resolves a destination to a position in this same list, so a
      // mismatch here is what previously sent tutors to the wrong screen.
      for (final role in const ['parent', 'tutor', 'admin']) {
        final destinations = destinationsForRole(role, parentId: 'p1');
        for (var i = 0; i < destinations.length; i++) {
          final resolved =
              destinations.indexWhere((d) => d.id == destinations[i].id);
          expect(resolved, i, reason: '$role destination $i is ambiguous');
        }
      }
    });
  });

  group('NavIndicators', () {
    test('maps each badge to the destination that owns it', () {
      const indicators = NavIndicators(
        hasUnreadMessages: true,
        hasUnreadAnnouncements: true,
        hasUnpaidInvoices: true,
      );

      expect(indicators.showsBadgeFor(AppDestination.messages), isTrue);
      expect(indicators.showsBadgeFor(AppDestination.announcements), isTrue);
      expect(indicators.showsBadgeFor(AppDestination.invoices), isTrue);
      expect(indicators.showsBadgeFor(AppDestination.dashboard), isFalse);
      expect(indicators.showsBadgeFor(AppDestination.classes), isFalse);
      expect(indicators.showsBadgeFor(AppDestination.users), isFalse);
    });

    test('shows nothing by default', () {
      const indicators = NavIndicators();
      for (final destination in AppDestination.values) {
        expect(indicators.showsBadgeFor(destination), isFalse);
      }
    });

    test('badges are independent of one another', () {
      const onlyMessages = NavIndicators(hasUnreadMessages: true);

      expect(onlyMessages.showsBadgeFor(AppDestination.messages), isTrue);
      expect(onlyMessages.showsBadgeFor(AppDestination.announcements), isFalse);
      expect(onlyMessages.showsBadgeFor(AppDestination.invoices), isFalse);
    });
  });
}
