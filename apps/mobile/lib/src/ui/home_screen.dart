import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/services/notification_service.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_router.dart';
import 'package:tenacity/src/ui/home_navigation.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The signed-in shell: a role-appropriate set of destinations behind one
/// bottom navigation bar.
///
/// Selection is held as an [AppDestination] rather than an index, so a role
/// that lacks a destination cannot be sent to the wrong screen or off the end
/// of its own list.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> {
  AppDestination _selected = AppDestination.dashboard;
  bool _didProcessPendingNotification = false;
  NavIndicators _indicators = const NavIndicators();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_didProcessPendingNotification) {
        _didProcessPendingNotification = true;
        final data = NotificationService.takePendingNotification();
        if (data != null) {
          NotificationService().handleNotificationTap(data);
        }
      }
      _fetchIndicators();
    });
  }

  Future<void> _fetchIndicators() async {
    final currentUser = context.read<AuthController>().currentUser;
    if (currentUser == null) return;

    // Resolve every controller before the first await — reading from context
    // afterwards is unsafe once this widget may have been disposed.
    final chatController = context.read<ChatController>();
    final invoiceController = context.read<InvoiceController>();
    final announcementsController = context.read<AnnouncementsController>();

    var hasUnreadMessages = _indicators.hasUnreadMessages;
    var hasUnpaidInvoices = _indicators.hasUnpaidInvoices;
    var hasUnreadAnnouncements = _indicators.hasUnreadAnnouncements;

    try {
      final unreadCount = await chatController.getUnreadCount();
      hasUnreadMessages = unreadCount > 0;
    } catch (_) {
      // Leave the badge as it was; a failed count should not clear a real one.
    }

    if (currentUser.role == 'parent') {
      try {
        hasUnpaidInvoices =
            await invoiceController.hasUnpaidInvoices(currentUser.uid);
      } catch (_) {
        // As above.
      }
    }

    try {
      await announcementsController.loadAnnouncements(
        onlyActive: true,
        audienceFilter: ['all', currentUser.role.toLowerCase()],
      );
      final readIds = currentUser.readAnnouncements;
      hasUnreadAnnouncements = announcementsController.announcements
          .any((a) => !readIds.contains(a.id));
    } catch (_) {
      hasUnreadAnnouncements = false;
    }

    if (!mounted) return;
    setState(() {
      _indicators = NavIndicators(
        hasUnreadMessages: hasUnreadMessages,
        hasUnpaidInvoices: hasUnpaidInvoices,
        hasUnreadAnnouncements: hasUnreadAnnouncements,
      );
    });
  }

  /// Switches to [destination] if the current role has it, and does nothing if
  /// it does not. Callers do not need to know which tabs a role has.
  void selectDestination(AppDestination destination) {
    final role = context.read<AuthController>().currentUser?.role;
    if (role == null) return;

    final available = destinationsForRole(role);
    if (!available.any((d) => d.id == destination)) return;

    setState(() => _selected = destination);
    _fetchIndicators();
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = context.watch<AuthController>().currentUser;

    if (currentUser == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final destinations = destinationsForRole(
      currentUser.role,
      parentId: currentUser.uid,
    );

    if (destinations.isEmpty) {
      return _InvalidRoleScreen(
        onSignOut: () => context.read<AuthController>().logout(),
      );
    }

    // A role change can leave the previous selection unavailable.
    final selectedIndex = destinations.indexWhere((d) => d.id == _selected);
    final index = selectedIndex == -1 ? 0 : selectedIndex;

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: destinations[index].id == AppDestination.dashboard
          ? DashboardRouter(onNavigate: selectDestination)
          : destinations[index].build(context),
      bottomNavigationBar: AppBottomNavigation(
        currentIndex: index,
        onSelected: (i) => selectDestination(destinations[i].id),
        items: [
          for (final destination in destinations)
            AppNavItem(
              label: destination.label,
              icon: destination.icon,
              activeIcon: destination.activeIcon,
              showBadge: _indicators.showsBadgeFor(destination.id),
            ),
        ],
      ),
    );
  }
}

class _InvalidRoleScreen extends StatelessWidget {
  final VoidCallback onSignOut;

  const _InvalidRoleScreen({required this.onSignOut});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                color: AppColors.danger,
                size: 64,
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                'Invalid user role.\nPlease contact support.',
                textAlign: TextAlign.center,
                style: AppText.body(fontSize: 18),
              ),
              const SizedBox(height: AppSpacing.xxl),
              ElevatedButton(
                onPressed: onSignOut,
                child: const Text('Sign Out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
