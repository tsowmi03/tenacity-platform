import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/services/auth_service.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:tenacity/src/utils/error_presenter.dart';

class ProfileUpdate {
  final String uid;
  final String firstName;
  final String lastName;
  final String phone;
  final String email;
  final String currentEmail;

  const ProfileUpdate({
    required this.uid,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.email,
    required this.currentEmail,
  });
}

class EditProfileScreen extends StatefulWidget {
  final Future<void> Function(ProfileUpdate update)? onSave;
  final AppUser? initialUser;

  const EditProfileScreen({
    super.key,
    this.onSave,
    this.initialUser,
  });

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();

  String? _seededUserId;
  String? _errorMessage;
  String? _successMessage;
  bool _isSaving = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final user =
        widget.initialUser ?? context.read<AuthController>().currentUser;
    if (user == null || _seededUserId == user.uid) return;
    _seededUserId = user.uid;
    _firstNameController.text = user.firstName;
    _lastNameController.text = user.lastName;
    _emailController.text = user.email;
    _phoneController.text = user.phone;
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_isSaving || !_formKey.currentState!.validate()) return;
    final auth =
        widget.initialUser == null ? context.read<AuthController>() : null;
    final user = widget.initialUser ?? auth?.currentUser;
    if (user == null) {
      setState(() => _errorMessage = 'Your signed-in account is unavailable.');
      return;
    }
    final isOnline = widget.onSave != null ||
        await OfflineActionGuard.ensureOnline(
          context,
          action: 'update your profile',
        );
    if (!isOnline) {
      return;
    }
    if (!mounted) return;

    final update = ProfileUpdate(
      uid: user.uid,
      firstName: _firstNameController.text.trim(),
      lastName: _lastNameController.text.trim(),
      phone: _phoneController.text.trim(),
      email: _emailController.text.trim(),
      currentEmail: user.email,
    );
    setState(() {
      _isSaving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      if (widget.onSave != null) {
        await widget.onSave!(update);
      } else {
        await AuthService().updateUserProfile(
          uid: update.uid,
          firstName: update.firstName,
          lastName: update.lastName,
          phone: update.phone,
          email: update.email,
          currentEmail: update.currentEmail,
        );
      }
      if (widget.onSave == null) await auth!.refreshCurrentUser();
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _successMessage = update.email == update.currentEmail
            ? 'Your profile has been updated.'
            : 'Your profile was saved. Check your new email address to verify the change.';
      });
    } on FirebaseAuthException catch (error) {
      if (!mounted) return;
      setState(() {
        _isSaving = false;
        _errorMessage = _profileAuthError(error.code);
      });
    } catch (error, stackTrace) {
      if (!mounted) return;
      // The FirebaseAuthException branch above has a code to go on. This one
      // does not, so it must not name a cause.
      final presented = presentError(
        error,
        action: 'save your profile',
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
              title: 'Edit profile',
              subtitle: 'Keep your contact details up to date',
              onBack: () => Navigator.maybePop(context),
            ),
            Expanded(
              child: ContentSheet(
                children: [
                  if (_successMessage != null) ...[
                    _FormMessage(
                      key: const Key('edit-profile-success'),
                      message: _successMessage!,
                      isSuccess: true,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  if (_errorMessage != null) ...[
                    _FormMessage(
                      key: const Key('edit-profile-error'),
                      message: _errorMessage!,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  Form(
                    key: _formKey,
                    child: Column(
                      children: [
                        TextFormField(
                          key: const Key('edit-profile-first-name'),
                          controller: _firstNameController,
                          enabled: !_isSaving && _successMessage == null,
                          textInputAction: TextInputAction.next,
                          textCapitalization: TextCapitalization.words,
                          autofillHints: const [AutofillHints.givenName],
                          decoration: const InputDecoration(
                            labelText: 'First name',
                            prefixIcon: Icon(Icons.person_outline_rounded),
                          ),
                          validator: _requiredName,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          key: const Key('edit-profile-last-name'),
                          controller: _lastNameController,
                          enabled: !_isSaving && _successMessage == null,
                          textInputAction: TextInputAction.next,
                          textCapitalization: TextCapitalization.words,
                          autofillHints: const [AutofillHints.familyName],
                          decoration: const InputDecoration(
                            labelText: 'Last name',
                            prefixIcon: Icon(Icons.person_outline_rounded),
                          ),
                          validator: _requiredName,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          key: const Key('edit-profile-email'),
                          controller: _emailController,
                          enabled: !_isSaving && _successMessage == null,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.email],
                          autocorrect: false,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.mail_outline_rounded),
                          ),
                          validator: _emailValidator,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        TextFormField(
                          key: const Key('edit-profile-phone'),
                          controller: _phoneController,
                          enabled: !_isSaving && _successMessage == null,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.telephoneNumber],
                          decoration: const InputDecoration(
                            labelText: 'Phone',
                            prefixIcon: Icon(Icons.phone_outlined),
                          ),
                          onFieldSubmitted: (_) => _save(),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        SizedBox(
                          width: double.infinity,
                          child: _successMessage == null
                              ? FilledButton(
                                  key: const Key('edit-profile-save'),
                                  onPressed: _isSaving ? null : _save,
                                  child: _isSaving
                                      ? const SizedBox.square(
                                          dimension: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Text('Save changes'),
                                )
                              : FilledButton(
                                  key: const Key('edit-profile-done'),
                                  onPressed: () => Navigator.pop(context, true),
                                  child: const Text('Done'),
                                ),
                        ),
                      ],
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

class _FormMessage extends StatelessWidget {
  final String message;
  final bool isSuccess;

  const _FormMessage({
    super.key,
    required this.message,
    this.isSuccess = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = isSuccess ? AppColors.success : AppColors.danger;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Text(
        message,
        style: AppText.body(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}

String? _requiredName(String? value) {
  if (value == null || value.trim().isEmpty) return 'Enter a name.';
  return null;
}

String? _emailValidator(String? value) {
  final email = value?.trim() ?? '';
  if (email.isEmpty) return 'Enter an email address.';
  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

String _profileAuthError(String code) {
  switch (code) {
    case 'email-already-in-use':
      return 'That email address is already linked to another account.';
    case 'invalid-email':
      return 'Enter a valid email address.';
    case 'requires-recent-login':
      return 'For security, sign out and back in before changing your email.';
    default:
      return 'Your profile could not be saved. Please try again.';
  }
}
