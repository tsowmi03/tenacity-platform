import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard.dart';
import 'package:tenacity/src/ui/dashboard/tutor/tutor_dashboard.dart';
import 'package:tenacity/src/ui/home_dashboard.dart';
import 'package:tenacity/src/ui/home_navigation.dart';

/// Chooses the dashboard for the signed-in user's role.
///
/// All three roles are on the V3 design. The legacy [HomeDashboard] remains
/// only as the fallback for an unrecognised role, and is removed once role
/// parity is proven (Phase 6). Routing through here means each role's dashboard
/// can be swapped independently without touching the navigation shell.
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
      'parent' => ParentDashboard(
          parentId: currentUser.uid,
          parentName: currentUser.firstName,
          readAnnouncementIds: currentUser.readAnnouncements,
          onNavigate: onNavigate,
        ),
      'tutor' => TutorDashboard(
          tutorId: currentUser.uid,
          tutorName: currentUser.firstName,
          onNavigate: onNavigate,
        ),
      'admin' => AdminDashboard(
          adminId: currentUser.uid,
          adminName: currentUser.firstName,
          onNavigate: onNavigate,
        ),
      _ => HomeDashboard(onNavigate: onNavigate),
    };
  }
}
