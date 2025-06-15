import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/main.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/terms_controller.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:tenacity/src/ui/login_screen.dart';
import 'package:tenacity/src/ui/terms_screen.dart';

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    final authController = Provider.of<AuthController>(context);
    final termsController = Provider.of<TermsController>(context);

    if (authController.isLoading || termsController.isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (authController.currentUser != null) {
      // Check if user needs to accept terms
      termsController.checkUserTermsStatus(authController.currentUser!.uid);
      if (termsController.needsToAcceptTerms) {
        return TermsScreen(
          requireAcceptance: true,
          previousVersion: termsController.currentTerms?.version !=
                  termsController.currentTerms?.version
              ? termsController.currentTerms?.version
              : null,
        );
      }
      return HomeScreen(key: homeScreenKey);
    }

    return const LoginScreen();
  }
}
