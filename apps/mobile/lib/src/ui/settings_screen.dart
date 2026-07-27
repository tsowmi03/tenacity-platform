import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/profile_controller.dart';
import 'package:tenacity/src/controllers/settings_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/ui/change_password_screen.dart';
import 'package:tenacity/src/ui/edit_profile_screen.dart';
import 'package:tenacity/src/ui/settings/settings_view.dart';
import 'package:tenacity/src/ui/terms_screen.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String? _scheduledUserId;
  String? _actionError;
  bool _isDeletingAccount = false;

  void _scheduleParentSettings(String userId) {
    if (_scheduledUserId == userId) return;
    _scheduledUserId = userId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<SettingsController>().loadSettings(userId);
    });
  }

  Future<void> _updateSetting(String key, bool value) async {
    final user = context.read<AuthController>().currentUser;
    if (user == null) return;
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'update notification settings',
    )) {
      return;
    }
    if (!mounted) return;
    await context.read<SettingsController>().updateSetting(
          user.uid,
          key,
          value,
        );
  }

  Future<void> _openEditProfile() async {
    final changed = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => const EditProfileScreen()),
    );
    if (changed != true || !mounted) return;
    final user = context.read<AuthController>().currentUser;
    if (user != null) {
      await context
          .read<ProfileController>()
          .loadProfile(expectedUserId: user.uid);
    }
  }

  Future<void> _deleteAccount() async {
    if (_isDeletingAccount) return;
    final firstConfirmation = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete account?'),
        content: const Text(
          'This permanently deletes your account data. For parent accounts, '
          'linked students will be unenrolled and deleted too.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    if (firstConfirmation != true || !mounted) return;

    final finalConfirmation = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete forever?'),
        content: const Text(
          'This cannot be undone. Your login and associated Tenacity data '
          'will no longer be available.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep account'),
          ),
          FilledButton(
            key: const Key('settings-confirm-delete'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete forever'),
          ),
        ],
      ),
    );
    if (finalConfirmation != true || !mounted) return;
    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'delete your account',
    )) {
      return;
    }
    if (!mounted) return;

    setState(() {
      _isDeletingAccount = true;
      _actionError = null;
    });
    try {
      await context.read<AuthController>().deleteCurrentAccount();
      if (!mounted) return;
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isDeletingAccount = false;
        _actionError =
            'Your account could not be deleted. Please try again or contact support.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().currentUser;
    final settings = context.watch<SettingsController>();
    final isParent = user?.role == 'parent';

    if (isParent && user != null) _scheduleParentSettings(user.uid);

    return SettingsView(
      isParent: isParent,
      isLoadingNotifications: isParent &&
          (settings.loadedUserId != user?.uid || settings.isLoading),
      isDeletingAccount: _isDeletingAccount,
      spotOpened: settings.spotOpenedNotif,
      lessonReminder: settings.lessonReminderNotif,
      isUpdatingSpotOpened: settings.isUpdating('spotOpened'),
      isUpdatingLessonReminder: settings.isUpdating('lessonReminder'),
      notificationError:
          settings.loadedUserId == user?.uid ? settings.errorMessage : null,
      actionError: _actionError,
      onBack: () => Navigator.maybePop(context),
      onRetryNotifications: () {
        if (user != null) settings.loadSettings(user.uid);
      },
      onSpotOpenedChanged: (value) => _updateSetting('spotOpened', value),
      onLessonReminderChanged: (value) =>
          _updateSetting('lessonReminder', value),
      onEditProfile: _openEditProfile,
      onChangePassword: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ChangePasswordScreen()),
        );
      },
      onOpenTerms: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => const TermsScreen(requireAcceptance: false),
          ),
        );
      },
      onDeleteAccount: _deleteAccount,
    );
  }
}
