import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

abstract class PasswordUpdater {
  Future<void> update({
    required String currentPassword,
    required String newPassword,
  });
}

class FirebasePasswordUpdater implements PasswordUpdater {
  @override
  Future<void> update({
    required String currentPassword,
    required String newPassword,
  }) async {
    final user = FirebaseAuth.instance.currentUser;
    final email = user?.email;
    if (user == null || email == null) {
      throw FirebaseAuthException(
        code: 'no-current-user',
        message: 'No signed-in account.',
      );
    }
    final credential = EmailAuthProvider.credential(
      email: email,
      password: currentPassword,
    );
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(newPassword);
  }
}

class ChangePasswordScreen extends StatefulWidget {
  final PasswordUpdater? updater;

  const ChangePasswordScreen({super.key, this.updater});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _isSaving = false;
  bool _showCurrentPassword = false;
  bool _showNewPassword = false;
  bool _showConfirmation = false;
  String? _errorMessage;
  bool _isComplete = false;

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (_isSaving || !_formKey.currentState!.validate()) return;
    final isOnline = widget.updater != null ||
        await OfflineActionGuard.ensureOnline(
          context,
          action: 'change your password',
        );
    if (!isOnline) {
      return;
    }
    if (!mounted) return;
    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });
    try {
      await (widget.updater ?? FirebasePasswordUpdater()).update(
        currentPassword: _currentPasswordController.text,
        newPassword: _newPasswordController.text,
      );
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _isComplete = true;
      });
      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
    } on FirebaseAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _errorMessage = _passwordAuthError(error.code);
      });
    } catch (error, stackTrace) {
      if (!mounted) return;
      // The FirebaseAuthException branch above has a code to go on. This one
      // does not, so it must not name a cause.
      final presented = presentError(
        error,
        action: 'change your password',
        stackTrace: stackTrace,
      );
      setState(() {
        _isSaving = false;
        _errorMessage = presented.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            DetailHeader(
              title: 'Change password',
              subtitle: 'Choose a strong password you do not use elsewhere',
              onBack: () => Navigator.maybePop(context),
            ),
            Expanded(
              child: ContentSheet(
                children: [
                  if (_isComplete) ...[
                    Container(
                      key: const Key('password-success'),
                      width: double.infinity,
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      decoration: BoxDecoration(
                        color: AppColors.successSurface,
                        borderRadius: BorderRadius.circular(AppRadii.md),
                      ),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.check_circle_outline_rounded,
                            color: AppColors.success,
                            size: 34,
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            'Password changed',
                            style: AppText.body(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.success,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            'Use your new password the next time you sign in.',
                            textAlign: TextAlign.center,
                            style: AppText.body(
                              fontSize: 13,
                              color: AppColors.text,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        key: const Key('password-done'),
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Done'),
                      ),
                    ),
                  ] else ...[
                    if (_errorMessage != null) ...[
                      Container(
                        key: const Key('password-error'),
                        width: double.infinity,
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(
                          color: AppColors.danger.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(AppRadii.sm),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: AppText.body(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.danger,
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                    ],
                    Form(
                      key: _formKey,
                      child: Column(
                        children: [
                          _PasswordField(
                            key: const Key('password-current'),
                            controller: _currentPasswordController,
                            label: 'Current password',
                            visible: _showCurrentPassword,
                            enabled: !_isSaving,
                            onVisibilityChanged: () => setState(
                              () =>
                                  _showCurrentPassword = !_showCurrentPassword,
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Enter your current password.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: AppSpacing.md),
                          _PasswordField(
                            key: const Key('password-new'),
                            controller: _newPasswordController,
                            label: 'New password',
                            visible: _showNewPassword,
                            enabled: !_isSaving,
                            onVisibilityChanged: () => setState(
                              () => _showNewPassword = !_showNewPassword,
                            ),
                            validator: (value) {
                              if (value == null || value.length < 8) {
                                return 'Use at least 8 characters.';
                              }
                              if (value == _currentPasswordController.text) {
                                return 'Choose a different password.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: AppSpacing.md),
                          _PasswordField(
                            key: const Key('password-confirm'),
                            controller: _confirmPasswordController,
                            label: 'Confirm new password',
                            visible: _showConfirmation,
                            enabled: !_isSaving,
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => _changePassword(),
                            onVisibilityChanged: () => setState(
                              () => _showConfirmation = !_showConfirmation,
                            ),
                            validator: (value) {
                              if (value != _newPasswordController.text) {
                                return 'Passwords do not match.';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: AppSpacing.xl),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              key: const Key('password-submit'),
                              onPressed: _isSaving ? null : _changePassword,
                              child: _isSaving
                                  ? const SizedBox.square(
                                      dimension: 18,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Text('Change password'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PasswordField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final bool visible;
  final bool enabled;
  final VoidCallback onVisibilityChanged;
  final FormFieldValidator<String>? validator;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;

  const _PasswordField({
    super.key,
    required this.controller,
    required this.label,
    required this.visible,
    required this.enabled,
    required this.onVisibilityChanged,
    this.validator,
    this.textInputAction = TextInputAction.next,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      enabled: enabled,
      obscureText: !visible,
      autocorrect: false,
      enableSuggestions: false,
      textInputAction: textInputAction,
      autofillHints: const [AutofillHints.password],
      onFieldSubmitted: onSubmitted,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.lock_outline_rounded),
        suffixIcon: IconButton(
          tooltip: visible ? 'Hide password' : 'Show password',
          onPressed: onVisibilityChanged,
          icon: Icon(
            visible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
          ),
        ),
      ),
      validator: validator,
    );
  }
}

String _passwordAuthError(String code) {
  switch (code) {
    case 'wrong-password':
    case 'invalid-credential':
      return 'Your current password is incorrect.';
    case 'weak-password':
      return 'Choose a stronger password.';
    case 'too-many-requests':
      return 'Too many attempts. Wait a moment, then try again.';
    case 'network-request-failed':
      return 'Check your connection and try again.';
    case 'no-current-user':
      return 'Your signed-in account is unavailable.';
    default:
      return 'Your password could not be changed. Please try again.';
  }
}
