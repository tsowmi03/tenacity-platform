import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/ui/boot_destination.dart';
import 'package:tenacity/src/ui/boot_splash.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:tenacity/src/ui/login_screen.dart';
import 'package:tenacity/src/ui/terms_screen.dart';
import 'package:tenacity/main.dart'; // Import for homeScreenKey

/// Routes boot to one of three places: the login screen, the terms gate, or
/// the app.
///
/// Every one of those decisions depends on an answer that arrives from the
/// network, so the wrapper has a fourth state — not knowing yet — and it has
/// to render something for it. That something is [AppBootSplash]. Showing a
/// destination screen instead is how a returning user came to see the terms
/// gate flash past on the way to their dashboard (MOB-29).
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
    } else if (_checkedTermsUserId != user.uid) {
      // Two reads stand between here and a routing decision — this user's
      // acceptance, and the current terms document. This starts the first.
      _scheduleTermsCheck(authController, termsController, user.uid);
    }

    final destination = resolveBootDestination(
      isRestoringSession: authController.isRestoringSession,
      isSignedIn: user != null,
      hasCheckedAcceptance: user != null && _checkedTermsUserId == user.uid,
      isTermsGateResolved: termsController.isGateResolved,
      needsToAcceptTerms: termsController.needsToAcceptTerms,
    );

    switch (destination) {
      case BootDestination.waiting:
        return const AppBootSplash();
      case BootDestination.login:
        return const LoginScreen();
      case BootDestination.terms:
        return TermsScreen(
          requireAcceptance: true,
          previousVersion: termsController.userAcceptedVersion,
        );
      case BootDestination.app:
        return HomeScreen(key: homeScreenKey);
    }
  }
}
