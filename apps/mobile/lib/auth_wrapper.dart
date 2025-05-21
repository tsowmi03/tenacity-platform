import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/main.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:tenacity/src/ui/login_screen.dart';

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    final authController = Provider.of<AuthController>(context);

    if (authController.isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (authController.currentUser != null) {
      return HomeScreen(key: homeScreenKey);
    }

    return const LoginScreen();
  }
}
