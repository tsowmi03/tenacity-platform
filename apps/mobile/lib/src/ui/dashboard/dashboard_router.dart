import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/dashboard/tutor/tutor_dashboard.dart';
import 'package:tenacity/src/ui/home_dashboard.dart';
import 'package:tenacity/src/ui/home_navigation.dart';

/// Chooses the dashboard for the signed-in user's role.
///
/// Tutor is on the V3 design; parent and admin still render the legacy
/// [HomeDashboard] until P01 and A01 replace them. Routing through here means
/// each role's dashboard can be swapped independently without touching the
/// navigation shell.
class DashboardRouter extends StatelessWidget {
  final void Function(AppDestination) onNavigate;

  const DashboardRouter({super.key, required this.onNavigate});

  @override
  Widget build(BuildContext context) {
    final currentUser = context.watch<AuthController>().currentUser;

    if (currentUser == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return switch (currentUser.role) {
      'tutor' => TutorDashboard(
          tutorId: currentUser.uid,
          tutorName: currentUser.firstName,
          onNavigate: onNavigate,
        ),
      _ => HomeDashboard(onNavigate: onNavigate),
    };
  }
}
