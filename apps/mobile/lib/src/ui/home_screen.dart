import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/admin_create_invoice_screen.dart';
import 'package:tenacity/src/ui/announcements_screen.dart';
import 'package:tenacity/src/ui/home_dashboard.dart';
import 'package:tenacity/src/ui/inbox_screen.dart';
import 'package:tenacity/src/ui/invoices_screen.dart';
import 'package:tenacity/src/ui/profile_screen.dart';
import 'package:tenacity/src/ui/timetable_screen.dart';

enum DashboardDestination {
  dashboard,
  classes,
  announcements,
  messages,
  invoices,
  profile,
  adminInvoices
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => HomeScreenState();
}

class HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

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
        DashboardDestination.messages: 3,
        DashboardDestination.profile: 4,
      };
    } else if (role == 'admin') {
      mapping = {
        DashboardDestination.dashboard: 0,
        DashboardDestination.classes: 1,
        DashboardDestination.announcements: 2,
        DashboardDestination.messages: 3,
        DashboardDestination.adminInvoices: 4,
        DashboardDestination.profile: 5,
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
        const ProfileScreen(),
      ];

      navItems = [
        const BottomNavigationBarItem(
            icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.school), label: "Classes"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.message), label: "Messages"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.payment), label: "Invoices"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.account_circle), label: "Profile"),
      ];
    } else if (role == 'tutor') {
      screens = [
        HomeDashboard(onCardTapped: _onDashboardCardTapped),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        const InboxScreen(),
        const ProfileScreen(),
      ];
      navItems = [
        const BottomNavigationBarItem(
            icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.school), label: "Classes"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.message), label: "Messages"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.account_circle), label: "Profile"),
      ];
    } else if (role == 'admin') {
      screens = [
        HomeDashboard(onCardTapped: _onDashboardCardTapped),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        //const UsersScreen(),
        const InboxScreen(),
        const AdminCreateInvoiceScreen(),
        const ProfileScreen(),
      ];
      navItems = [
        const BottomNavigationBarItem(
            icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.school), label: "Classes"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.message), label: "Messages"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.payment), label: "Create Invoices"),
        const BottomNavigationBarItem(
            icon: Icon(Icons.account_circle), label: "Profile"),
      ];
    } else {
      //TODO: PROPER ERROR CHECKS
      screens = [];
      navItems = [];
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
