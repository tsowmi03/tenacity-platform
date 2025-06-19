import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/services/notification_service.dart';
import 'package:tenacity/src/ui/announcements_screen.dart';
import 'package:tenacity/src/ui/home_dashboard.dart';
import 'package:tenacity/src/ui/inbox_screen.dart';
import 'package:tenacity/src/ui/invoices_screen.dart';
// import 'package:tenacity/src/ui/payslips_screen.dart';
import 'package:tenacity/src/ui/timetable_screen.dart';
import 'package:tenacity/src/ui/users_list_screen.dart';

enum DashboardDestination {
  dashboard,
  classes,
  announcements,
  messages,
  invoices,
  profile,
  // adminPayslips,
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;
  bool _didProcessPendingNotification = false;

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
    });
  }

  void _onDashboardCardTapped(DashboardDestination destination) {
    final authController = context.read<AuthController>();
    final currentUser = authController.currentUser;
    final role = currentUser?.role;

    // Define mappings for each role
    Map<DashboardDestination, int> mapping;
    if (role == 'parent') {
      mapping = {
        DashboardDestination.dashboard: 0,
        DashboardDestination.classes: 1,
        DashboardDestination.announcements: 2,
        DashboardDestination.messages: 3,
        DashboardDestination.invoices: 4,
        DashboardDestination.profile: 5,
      };
    } else if (role == 'tutor') {
      mapping = {
        DashboardDestination.dashboard: 0,
        DashboardDestination.classes: 1,
        DashboardDestination.announcements: 2,
        DashboardDestination.messages: 4,
        DashboardDestination.profile: 5,
      };
    } else if (role == 'admin') {
      mapping = {
        DashboardDestination.dashboard: 0,
        DashboardDestination.classes: 1,
        DashboardDestination.announcements: 2,
        DashboardDestination.messages: 4,
        // DashboardDestination.adminPayslips: 5,
        DashboardDestination.profile: 6,
      };
    } else {
      mapping = {};
    }

    // Update the index if the mapping exists
    if (mapping.containsKey(destination)) {
      setState(() {
        _selectedIndex = mapping[destination]!;
      });
    }
  }

  void selectTab(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  Widget _messagesIconWithBadge(BuildContext context) {
    return FutureBuilder<int>(
      future: context.read<ChatController>().getUnreadCount(),
      builder: (context, snapshot) {
        final unread = snapshot.data ?? 0;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            const Icon(Icons.message),
            if (unread > 0)
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _invoicesIconWithBadge(BuildContext context, String parentId) {
    return FutureBuilder<bool>(
      future: context.read<InvoiceController>().hasUnpaidInvoices(parentId),
      builder: (context, snapshot) {
        final hasUnpaid = snapshot.data ?? false;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            const Icon(Icons.payment),
            if (hasUnpaid)
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _announcementsIconWithBadge(
      BuildContext context, String userId, String userRole) {
    return FutureBuilder<int>(
      future: context
          .read<AnnouncementsController>()
          .getUnreadAnnouncementsCount(userId, userRole),
      builder: (context, snapshot) {
        final unread = snapshot.data ?? 0;
        return Stack(
          clipBehavior: Clip.none,
          children: [
            const Icon(Icons.announcement),
            if (unread > 0)
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final currentUser = authController.currentUser;

    if (currentUser == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final role = currentUser.role;
    List<Widget> screens;
    List<BottomNavigationBarItem> navItems;

    if (role == 'parent') {
      screens = [
        HomeDashboard(onCardTapped: _onDashboardCardTapped),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        const InboxScreen(),
        InvoicesScreen(parentId: currentUser.uid),
      ];

      navItems = [
        const BottomNavigationBarItem(
            icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.school), label: "Classes"),
        BottomNavigationBarItem(
          icon: _announcementsIconWithBadge(context, currentUser.uid, role),
          label: "Announcements",
        ),
        BottomNavigationBarItem(
          icon: _messagesIconWithBadge(context),
          label: "Messages",
        ),
        BottomNavigationBarItem(
          icon: _invoicesIconWithBadge(context, currentUser.uid),
          label: "Invoices",
        ),
      ];
    } else if (role == 'tutor') {
      screens = [
        HomeDashboard(onCardTapped: _onDashboardCardTapped),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        const UsersScreen(),
        const InboxScreen(),
        // PayslipsScreen(userId: currentUser.uid),
      ];
      navItems = [
        const BottomNavigationBarItem(
            icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.school), label: "Classes"),
        BottomNavigationBarItem(
          icon: _announcementsIconWithBadge(context, currentUser.uid, role),
          label: "Announcements",
        ),
        const BottomNavigationBarItem(
            icon: Icon(Icons.supervised_user_circle), label: "Users"),
        BottomNavigationBarItem(
          icon: _messagesIconWithBadge(context),
          label: "Messages",
        ),
        // const BottomNavigationBarItem(
        //     icon: Icon(Icons.payment), label: "Payslips"),
      ];
    } else if (role == 'admin') {
      screens = [
        HomeDashboard(onCardTapped: _onDashboardCardTapped),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        const UsersScreen(),
        const InboxScreen(),
        // PayslipsScreen(
        //   userId: currentUser.uid,
        // ),
      ];
      navItems = [
        const BottomNavigationBarItem(
            icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.school), label: "Classes"),
        BottomNavigationBarItem(
          icon: _announcementsIconWithBadge(context, currentUser.uid, role),
          label: "Announcements",
        ),
        const BottomNavigationBarItem(
            icon: Icon(Icons.supervised_user_circle), label: "Users"),
        BottomNavigationBarItem(
          icon: _messagesIconWithBadge(context),
          label: "Messages",
        ),
        // const BottomNavigationBarItem(
        //     icon: Icon(Icons.payment), label: "Payslips"),
      ];
    } else {
      // Show an error screen if the role is invalid or missing
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, color: Colors.red, size: 64),
              const SizedBox(height: 16),
              const Text(
                'Invalid user role.\nPlease contact support.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  // Optionally, log out the user or navigate away
                  context.read<AuthController>().logout();
                },
                child: const Text('Sign Out'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: screens[_selectedIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        backgroundColor: Colors.white,
        selectedItemColor: Theme.of(context).primaryColorDark,
        unselectedItemColor: Colors.grey,
        items: navItems,
        onTap: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
      ),
    );
  }
}
