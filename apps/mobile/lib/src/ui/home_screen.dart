import 'package:flutter/material.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:provider/provider.dart';

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
      return const Scaffold(body: Center(child: CircularProgressIndicator(),));
    }

    final role = currentUser.role;
    print(currentUser.email);

    //TODO: ROLE BASED NAVIGATION
    List<Widget> screens;
    List<BottomNavigationBarItem> navItems;

    if (role == 'parent') {
      screens = [
        //TODO: IMPLEMENT SCREENS
        
        //classes, announcements, messages, invoices
      ];
      navItems = [
        const BottomNavigationBarItem(icon: Icon(Icons.calendar_today), label: "Classes"),
        const BottomNavigationBarItem(icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(icon: Icon(Icons.message), label: "Messages"),
        const BottomNavigationBarItem(icon: Icon(Icons.payment), label: "Invoices"),
      ];
    } else if (role == 'tutor') {
      screens = [
        //classes, attendance, messages, announcements
      ];
      navItems = [
        const BottomNavigationBarItem(icon: Icon(Icons.class_), label: "Classes"),
        const BottomNavigationBarItem(icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(icon: Icon(Icons.check_circle), label: "Attendance"),
        const BottomNavigationBarItem(icon: Icon(Icons.message), label: "Messages"),
      ];
    } else if (role == 'admin') {
      screens = [
        //classes, announcements, users, messages, invoices 
      ];
      navItems = [
        const BottomNavigationBarItem(icon: Icon(Icons.settings), label: "Classes"),
        const BottomNavigationBarItem(icon: Icon(Icons.announcement), label: "Announcements"),
        const BottomNavigationBarItem(icon: Icon(Icons.people), label: "Users"),
        const BottomNavigationBarItem(icon: Icon(Icons.message), label: "Messages"),
        const BottomNavigationBarItem(icon: Icon(Icons.payment), label: "Invoices"),
      ];
    } else {
      return const Scaffold(body: Center(child: const Text("Unknown role"),));
    }
    return Scaffold(
      body: screens[_selectedIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
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