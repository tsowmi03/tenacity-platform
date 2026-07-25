import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/admin_invoice_view.dart';
import 'package:tenacity/src/ui/announcements_screen.dart';
import 'package:tenacity/src/ui/inbox_screen.dart';
import 'package:tenacity/src/ui/invoices_screen.dart';
import 'package:tenacity/src/ui/timetable_screen.dart';
import 'package:tenacity/src/ui/users_list_screen.dart';

/// A place the user can navigate to from the bottom bar or a dashboard card.
///
/// Destinations are named, not numbered. The previous implementation mapped
/// them to per-role integer indexes, which put `profile` out of range for
/// parents and tutors and made `selectTab(4)` mean Invoices for a parent but
/// Messages for a tutor. Anything that resolves a destination now goes through
/// [destinationsForRole], so a role that lacks a destination simply has no
/// entry rather than landing somewhere unrelated.
///
/// Profile is deliberately absent: it is a pushed route from the header avatar,
/// not a tab.
enum AppDestination {
  dashboard,
  classes,
  announcements,
  users,
  messages,
  invoices,
}

/// Which unread/unpaid badges are currently showing.
class NavIndicators {
  final bool hasUnreadMessages;
  final bool hasUnreadAnnouncements;
  final bool hasUnpaidInvoices;

  const NavIndicators({
    this.hasUnreadMessages = false,
    this.hasUnreadAnnouncements = false,
    this.hasUnpaidInvoices = false,
  });

  bool showsBadgeFor(AppDestination destination) => switch (destination) {
        AppDestination.messages => hasUnreadMessages,
        AppDestination.announcements => hasUnreadAnnouncements,
        AppDestination.invoices => hasUnpaidInvoices,
        _ => false,
      };
}

/// One tab: its identity, how it is labelled and iconed, and how to build it.
class RoleDestination {
  final AppDestination id;
  final String label;
  final IconData icon;
  final IconData activeIcon;
  final Widget Function(BuildContext context) build;

  const RoleDestination({
    required this.id,
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.build,
  });
}

/// The ordered tabs for [role], or an empty list if the role is unrecognised.
///
/// [parentId] is required to build a parent's own invoice list and is ignored
/// for other roles.
///
/// Parent keeps its Announcements tab here. The reference design moves parent
/// announcements onto the dashboard and drops the tab, but that is only safe
/// once the redesigned parent dashboard exists to carry the entry point and its
/// unread badge — see P01/P03 in `V3_REDESIGN_ROADMAP.md`.
List<RoleDestination> destinationsForRole(String role, {String? parentId}) {
  final dashboard = RoleDestination(
    id: AppDestination.dashboard,
    label: 'Home',
    icon: Icons.home_outlined,
    activeIcon: Icons.home_rounded,
    // Supplied by HomeScreen, which owns the dashboard router.
    build: (_) => const SizedBox.shrink(),
  );

  final classes = RoleDestination(
    id: AppDestination.classes,
    label: 'Classes',
    icon: Icons.school_outlined,
    activeIcon: Icons.school_rounded,
    build: (_) => const TimetableScreen(),
  );

  final announcements = RoleDestination(
    id: AppDestination.announcements,
    label: 'Notices',
    icon: Icons.campaign_outlined,
    activeIcon: Icons.campaign_rounded,
    build: (_) => const AnnouncementsScreen(),
  );

  final users = RoleDestination(
    id: AppDestination.users,
    label: 'Users',
    icon: Icons.people_outline_rounded,
    activeIcon: Icons.people_rounded,
    build: (_) => const UsersScreen(),
  );

  final messages = RoleDestination(
    id: AppDestination.messages,
    label: 'Messages',
    icon: Icons.chat_bubble_outline_rounded,
    activeIcon: Icons.chat_bubble_rounded,
    build: (_) => const InboxScreen(),
  );

  return switch (role) {
    'parent' => [
        dashboard,
        classes,
        announcements,
        messages,
        RoleDestination(
          id: AppDestination.invoices,
          label: 'Invoices',
          icon: Icons.receipt_long_outlined,
          activeIcon: Icons.receipt_long_rounded,
          build: (_) => InvoicesScreen(parentId: parentId ?? ''),
        ),
      ],
    'tutor' => [dashboard, classes, announcements, users, messages],
    'admin' => [
        dashboard,
        classes,
        announcements,
        users,
        messages,
        RoleDestination(
          id: AppDestination.invoices,
          label: 'Invoices',
          icon: Icons.receipt_long_outlined,
          activeIcon: Icons.receipt_long_rounded,
          build: (_) => AdminInvoiceView(),
        ),
      ],
    _ => const [],
  };
}
