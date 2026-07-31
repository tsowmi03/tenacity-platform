import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/auth_wrapper.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/profile_controller.dart';
import 'package:tenacity/src/controllers/timetable_controller.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/ui/profile/profile_view.dart';
import 'package:tenacity/src/ui/settings_screen.dart';
import 'package:url_launcher/url_launcher.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final Map<String, Future<List<ClassModel>>> _classRequests = {};
  String? _scheduledUserId;
  String? _actionMessage;
  bool _isSigningOut = false;

  void _scheduleLoad(String userId) {
    if (_scheduledUserId == userId) return;
    _scheduledUserId = userId;
    _classRequests.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<ProfileController>().loadProfile(expectedUserId: userId);
    });
  }

  Future<List<ClassModel>> _classesFor(Student student) {
    return _classRequests.putIfAbsent(
      student.id,
      () => context
          .read<TimetableController>()
          .fetchClassesForStudent(student.id),
    );
  }

  Future<void> _openEnrolment() async {
    const message =
        'Registration could not be opened. Please try again in a moment.';
    try {
      final opened = await launchUrl(
        Uri.parse('https://www.tenacitytutoring.com/register'),
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) setState(() => _actionMessage = message);
    } catch (_) {
      if (mounted) setState(() => _actionMessage = message);
    }
  }

  Future<void> _signOut() async {
    if (_isSigningOut) return;
    setState(() {
      _isSigningOut = true;
      _actionMessage = null;
    });
    try {
      await context.read<AuthController>().logout();
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const AuthWrapper()),
        (_) => false,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSigningOut = false;
        _actionMessage =
            'Sign out could not be completed. Check your connection and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = context.watch<AuthController>().currentUser;
    final profile = context.watch<ProfileController>();

    if (currentUser == null) {
      return const Scaffold(
        body: Center(child: Text('No signed-in account is available.')),
      );
    }

    _scheduleLoad(currentUser.uid);
    final profileUser =
        profile.loadedUserId == currentUser.uid ? profile.parent : null;

    return ProfileView(
      user: profileUser ?? currentUser,
      children:
          profile.loadedUserId == currentUser.uid ? profile.children : const [],
      isLoading: profile.loadedUserId != currentUser.uid || profile.isLoading,
      loadError:
          profile.loadedUserId == currentUser.uid ? profile.loadError : null,
      isSigningOut: _isSigningOut,
      actionMessage: _actionMessage,
      loadClasses: _classesFor,
      onBack: () => Navigator.maybePop(context),
      onOpenSettings: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const SettingsScreen()),
        );
      },
      onEnrolStudent: _openEnrolment,
      onSignOut: _signOut,
      onRetry: () {
        _classRequests.clear();
        context
            .read<ProfileController>()
            .loadProfile(expectedUserId: currentUser.uid);
      },
    );
  }
}
