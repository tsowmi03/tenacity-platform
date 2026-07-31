import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
// import 'package:tenacity/src/controllers/timetable_controller.dart';
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
  String? _scheduledTermsUserId;
  String? _checkedTermsUserId;

  void _scheduleTermsCheck(
    AuthController authController,
    TermsController termsController,
    String userId,
  ) {
    if (_scheduledTermsUserId == userId) return;
    _scheduledTermsUserId = userId;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || authController.currentUser?.uid != userId) return;
      await termsController.checkUserTermsStatus(userId);
      if (!mounted || authController.currentUser?.uid != userId) return;
      setState(() => _checkedTermsUserId = userId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final authController = Provider.of<AuthController>(context);
    final termsController = Provider.of<TermsController>(context);

    final user = authController.currentUser;

    if (user == null) {
      _scheduledTermsUserId = null;
      _checkedTermsUserId = null;
      return const LoginScreen();
    }

    if (_checkedTermsUserId != user.uid) {
      _scheduleTermsCheck(authController, termsController, user.uid);
      return TermsScreen(
        requireAcceptance: true,
        waitingForStatus: true,
        previousVersion: termsController.userAcceptedVersion,
      );
    }

    if (termsController.needsToAcceptTerms) {
      return TermsScreen(
        requireAcceptance: true,
        previousVersion: termsController.userAcceptedVersion,
      );
    }

    // if (user.role == 'admin' || user.role == 'tutor') {
    //   final timetableController =
    //       Provider.of<TimetableController>(context, listen: false);
    //   if (timetableController.activeTerm == null ||
    //       timetableController.allClasses.isEmpty) {
    //     timetableController.loadActiveTerm();
    //     timetableController.loadAllClasses();
    //     timetableController.loadAttendanceForWeek();
    //   }
    // }

    return HomeScreen(key: homeScreenKey);
  }
}
