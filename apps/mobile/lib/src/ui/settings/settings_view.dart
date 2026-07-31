import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

class SettingsView extends StatelessWidget {
  final bool isParent;
  final bool isLoadingNotifications;
  final bool isDeletingAccount;
  final bool spotOpened;
  final bool lessonReminder;
  final bool isUpdatingSpotOpened;
  final bool isUpdatingLessonReminder;
  final String? notificationError;
  final String? actionError;
  final VoidCallback onBack;
  final VoidCallback onRetryNotifications;
  final ValueChanged<bool> onSpotOpenedChanged;
  final ValueChanged<bool> onLessonReminderChanged;
  final VoidCallback onEditProfile;
  final VoidCallback onChangePassword;
  final VoidCallback onOpenTerms;
  final VoidCallback onDeleteAccount;

  const SettingsView({
    super.key,
    required this.isParent,
    required this.isLoadingNotifications,
    required this.isDeletingAccount,
    required this.spotOpened,
    required this.lessonReminder,
    required this.isUpdatingSpotOpened,
    required this.isUpdatingLessonReminder,
    required this.onBack,
    required this.onRetryNotifications,
    required this.onSpotOpenedChanged,
    required this.onLessonReminderChanged,
    required this.onEditProfile,
    required this.onChangePassword,
    required this.onOpenTerms,
    required this.onDeleteAccount,
    this.notificationError,
    this.actionError,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(
              title: 'Settings',
              subtitle: 'Account, security and preferences',
              onBack: onBack,
            ),
            Expanded(
              child: ContentSheet(
                children: [
                  if (isParent) ...[
                    const SectionLabel(title: 'NOTIFICATIONS'),
                    const SizedBox(height: AppSpacing.labelGap),
                    if (isLoadingNotifications)
                      const SkeletonBlock(height: 150)
                    else ...[
                      if (notificationError != null) ...[
                        _InlineError(
                          key: const Key('settings-notification-error'),
                          message: notificationError!,
                          actionLabel: 'Try again',
                          onAction: onRetryNotifications,
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                      _SettingsCard(
                        children: [
                          _NotificationTile(
                            key: const Key('settings-spot-opened'),
                            icon: Icons.event_available_outlined,
                            title: 'Spot opened',
                            subtitle:
                                'Tell me when a place becomes available in a class.',
                            value: spotOpened,
                            isBusy: isUpdatingSpotOpened,
                            onChanged: onSpotOpenedChanged,
                          ),
                          const Divider(),
                          _NotificationTile(
                            key: const Key('settings-lesson-reminder'),
                            icon: Icons.notifications_active_outlined,
                            title: 'Lesson reminder',
                            subtitle:
                                'Remind me before my child’s scheduled lesson.',
                            value: lessonReminder,
                            isBusy: isUpdatingLessonReminder,
                            onChanged: onLessonReminderChanged,
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xl),
                  ],
                  const SectionLabel(title: 'ACCOUNT'),
                  const SizedBox(height: AppSpacing.labelGap),
                  _SettingsCard(
                    children: [
                      _ActionTile(
                        key: const Key('settings-edit-profile'),
                        icon: Icons.person_outline_rounded,
                        title: 'Edit profile',
                        subtitle: 'Name, email and phone',
                        onTap: onEditProfile,
                      ),
                      const Divider(),
                      _ActionTile(
                        key: const Key('settings-change-password'),
                        icon: Icons.lock_outline_rounded,
                        title: 'Change password',
                        subtitle: 'Update your sign-in password',
                        onTap: onChangePassword,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  const SectionLabel(title: 'LEGAL'),
                  const SizedBox(height: AppSpacing.labelGap),
                  _SettingsCard(
                    children: [
                      _ActionTile(
                        key: const Key('settings-terms'),
                        icon: Icons.description_outlined,
                        title: 'Terms & conditions',
                        subtitle: 'Read the current agreement',
                        onTap: onOpenTerms,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  const SectionLabel(title: 'DANGER ZONE'),
                  const SizedBox(height: AppSpacing.labelGap),
                  if (actionError != null) ...[
                    _InlineError(
                      key: const Key('settings-action-error'),
                      message: actionError!,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  OutlinedButton.icon(
                    key: const Key('settings-delete-account'),
                    onPressed: isDeletingAccount ? null : onDeleteAccount,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.danger,
                      side: const BorderSide(color: AppColors.danger),
                    ),
                    icon: isDeletingAccount
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.danger,
                            ),
                          )
                        : const Icon(Icons.delete_outline_rounded),
                    label: Text(
                      isDeletingAccount
                          ? 'Deleting account…'
                          : 'Delete account',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final List<Widget> children;

  const _SettingsCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.paper,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 68,
      leading: Icon(icon, color: AppColors.blue),
      title: Text(
        title,
        style: AppText.body(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        subtitle,
        style: AppText.body(fontSize: 12, color: AppColors.muted),
      ),
      trailing: const Icon(
        Icons.chevron_right_rounded,
        color: AppColors.muted,
      ),
      onTap: onTap,
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final bool isBusy;
  final ValueChanged<bool> onChanged;

  const _NotificationTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.isBusy,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      secondary: Icon(icon, color: AppColors.blue),
      title: Text(
        title,
        style: AppText.body(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        subtitle,
        style: AppText.body(fontSize: 12, color: AppColors.muted),
      ),
      value: value,
      onChanged: isBusy ? null : onChanged,
    );
  }
}

class _InlineError extends StatelessWidget {
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  const _InlineError({
    super.key,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.danger),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: AppText.body(fontSize: 12.5, color: AppColors.danger),
            ),
          ),
          if (actionLabel != null)
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
        ],
      ),
    );
  }
}
