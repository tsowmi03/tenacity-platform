import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/announcements_screen.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/home_dashboard.dart';
import 'package:tenacity/src/ui/payment_screen.dart';
import 'package:tenacity/src/ui/timetable_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

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
        const HomeDashboard(),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        const MessagesScreen(),
        const PaymentScreen(),
      ];
      
      navItems = [
        const BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(icon: Icon(Icons.calendar_today), label: "Classes"),
        const BottomNavigationBarItem(icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(icon: Icon(Icons.message), label: "Messages"),
        const BottomNavigationBarItem(icon: Icon(Icons.payment), label: "Invoices"),
      ];
    } else if (role == 'tutor') {
      screens = [
        const HomeDashboard(),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        const MessagesScreen(),
      ];
      navItems = [
        const BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(icon: Icon(Icons.school), label: "Classes"),
        const BottomNavigationBarItem(icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(icon: Icon(Icons.message), label: "Messages"),
      ];
    } else if (role == 'admin') {
      screens = [
        const HomeDashboard(),
        const TimetableScreen(),
        const AnnouncementsScreen(),
        //const UsersScreen(),
        const MessagesScreen(),
        // const InvoicesScreen(),
      ];
      navItems = [
        const BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: "Dashboard"),
        const BottomNavigationBarItem(icon: Icon(Icons.school), label: "Classes"),
        const BottomNavigationBarItem(icon: Icon(Icons.announcement), label: "Announcements"),
        // const BottomNavigationBarItem(icon: Icon(Icons.people), label: "Users"),
        const BottomNavigationBarItem(icon: Icon(Icons.message), label: "Messages"),
        // const BottomNavigationBarItem(icon: Icon(Icons.payment), label: "Invoices"),
      ];
    } else { //TODO: PROPER ERROR CHECKS
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