import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:tenacity/src/ui/login_screen.dart';
import 'package:tenacity/src/ui/terms_screen.dart';
import 'package:tenacity/main.dart'; // Import for homeScreenKey

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  AuthWrapperState createState() => AuthWrapperState();
}

class AuthWrapperState extends State<AuthWrapper> {
  bool _didCheckTerms = false;

  @override
  Widget build(BuildContext context) {
    final authController = Provider.of<AuthController>(context);
    final termsController = Provider.of<TermsController>(context);

    final user = authController.currentUser;

    // schedule only once, after first frame
    if (user != null && !_didCheckTerms) {
      _didCheckTerms = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        termsController.checkUserTermsStatus(user.uid);
      });
    }

    if (user == null) {
      return const LoginScreen();
    }

    if (termsController.isLoading) {
      // Show a loading indicator while checking terms status
      return const Center(child: CircularProgressIndicator());
    }

    if (termsController.needsToAcceptTerms) {
      return TermsScreen(
        requireAcceptance: true,
        previousVersion: termsController.userAcceptedVersion, // <-- use getter
      );
    }

    if (user.role == 'admin' || user.role == 'tutor') {
      final timetableController =
          Provider.of<TimetableController>(context, listen: false);
      if (timetableController.activeTerm == null ||
          timetableController.allClasses.isEmpty) {
        timetableController.loadActiveTerm();
        timetableController.loadAllClasses();
        timetableController.loadAttendanceForWeek();
      }
    }

    return HomeScreen(key: homeScreenKey);
  }
}
