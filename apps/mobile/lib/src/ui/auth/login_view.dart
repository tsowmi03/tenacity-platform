import 'package:flutter/material.dart';
import 'package:tenacity/src/ui/auth/login_form.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// The signed-out screen: the brand over a white sheet holding the sign-in
/// form.
///
/// Presentation only. Validation comes from `login_form.dart` and every action
/// is a callback, so the authentication and offline-guard behaviour stays where
/// it already lives.
class LoginView extends StatelessWidget {
  final GlobalKey<FormState> formKey;
  final TextEditingController emailController;
  final TextEditingController passwordController;

  final bool isLoading;
  final bool canSubmit;
  final bool canResetPassword;
  final bool obscurePassword;
  final LoginFeedback? feedback;

  /// Drops the brand to leave the form room on a short phone.
  ///
  /// Passed in rather than read here, because `Scaffold` removes the bottom
  /// view inset from its body's `MediaQuery` — reading it inside this widget
  /// always returned zero, so the compact layout never appeared.
  final bool keyboardIsOpen;

  final VoidCallback onSubmit;
  final VoidCallback onForgotPassword;
  final VoidCallback onToggleObscure;
  final VoidCallback onEnrol;

  const LoginView({
    super.key,
    required this.formKey,
    required this.emailController,
    required this.passwordController,
    required this.isLoading,
    required this.canSubmit,
    required this.canResetPassword,
    required this.obscurePassword,
    required this.feedback,
    required this.keyboardIsOpen,
    required this.onSubmit,
    required this.onForgotPassword,
    required this.onToggleObscure,
    required this.onEnrol,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.ink,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(compact: keyboardIsOpen),
            Expanded(
              child: ContentSheet(
                scrollKey: const Key('login-scroll'),
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                  AppSpacing.screenH,
                  AppSpacing.xxl,
                ),
                children: [
                  Form(
                    key: formKey,
                    // Each field is checked when it loses focus, not the whole
                    // form the moment anything is typed. Under
                    // `onUserInteraction`, entering an email immediately drew a
                    // red "Please enter your password" under a field the user
                    // had not reached yet.
                    autovalidateMode: AutovalidateMode.onUnfocus,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextFormField(
                          key: const Key('login-email'),
                          controller: emailController,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.mail_outline_rounded),
                          ),
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          autofillHints: const [AutofillHints.email],
                          validator: emailErrorFor,
                        ),
                        const SizedBox(height: AppSpacing.sectionGap),
                        TextFormField(
                          key: const Key('login-password'),
                          controller: passwordController,
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_outline_rounded),
                            suffixIcon: IconButton(
                              key: const Key('login-toggle-password'),
                              onPressed: onToggleObscure,
                              icon: Icon(
                                obscurePassword
                                    ? Icons.visibility_off_outlined
                                    : Icons.visibility_outlined,
                              ),
                              color: AppColors.muted,
                              tooltip: obscurePassword
                                  ? 'Show password'
                                  : 'Hide password',
                            ),
                          ),
                          obscureText: obscurePassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.password],
                          onFieldSubmitted: (_) {
                            if (canSubmit && !isLoading) onSubmit();
                          },
                          validator: passwordErrorFor,
                        ),
                      ],
                    ),
                  ),
                  if (feedback != null) ...[
                    const SizedBox(height: AppSpacing.sectionGap),
                    _FeedbackPanel(feedback: feedback!),
                  ],
                  const SizedBox(height: AppSpacing.xl),
                  _SubmitButton(
                    isLoading: isLoading,
                    onPressed: canSubmit && !isLoading ? onSubmit : null,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Center(
                    child: TextButton(
                      key: const Key('login-forgot-password'),
                      onPressed: canResetPassword && !isLoading
                          ? onForgotPassword
                          : null,
                      child: const Text('Forgot your password?'),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  const Divider(),
                  const SizedBox(height: AppSpacing.lg),
                  _EnrolPrompt(onEnrol: isLoading ? null : onEnrol),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  /// Drops the logo when the keyboard has taken the room it needs.
  final bool compact;

  const _Header({required this.compact});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        compact ? AppSpacing.lg : AppSpacing.xxl,
        AppSpacing.screenH,
        compact ? AppSpacing.lg : AppSpacing.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!compact) ...[
            Image.asset(
              'lib/assets/img/Tenacity-Vertical-Logo-White.png',
              height: 46,
              alignment: Alignment.centerLeft,
              fit: BoxFit.contain,
              excludeFromSemantics: true,
              errorBuilder: (_, __, ___) => Text(
                'TENACITY',
                style: AppText.display(fontSize: 22, color: Colors.white),
              ),
            ),
            const SizedBox(height: AppSpacing.xxl),
          ],
          Text(
            'Welcome back',
            style: AppText.display(
              fontSize: compact ? 22 : 30,
              color: Colors.white,
            ),
          ),
          if (!compact) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Sign in to see your classes, messages and invoices.',
              style: AppText.body(fontSize: 13.5, color: AppColors.onInkMuted),
            ),
          ],
        ],
      ),
    );
  }
}

/// The one place the form answers "did that work?" — a failed sign-in and a
/// sent reset email both land here rather than in a snack bar that has already
/// gone by the time the user looks up.
class _FeedbackPanel extends StatelessWidget {
  final LoginFeedback feedback;

  const _FeedbackPanel({required this.feedback});

  @override
  Widget build(BuildContext context) {
    final (background, foreground, icon) = feedback.isError
        ? (
            const Color(0x14D64545),
            AppColors.danger,
            Icons.error_outline_rounded,
          )
        : (
            AppColors.successSurface,
            AppColors.success,
            Icons.check_circle_outline_rounded,
          );

    return Container(
      key: Key(
        feedback.isError ? 'login-feedback-error' : 'login-feedback-success',
      ),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadii.sm),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: foreground),
          const SizedBox(width: AppSpacing.labelGap),
          Expanded(
            child: Text(
              feedback.message,
              style: AppText.body(fontSize: 13, color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}

/// Keeps its size while loading, so the form does not jump when the spinner
/// replaces the label.
class _SubmitButton extends StatelessWidget {
  final bool isLoading;
  final VoidCallback? onPressed;

  const _SubmitButton({required this.isLoading, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      key: const Key('login-submit'),
      onPressed: onPressed,
      child: isLoading
          ? const SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : const Text('Log in'),
    );
  }
}

class _EnrolPrompt extends StatelessWidget {
  final VoidCallback? onEnrol;

  const _EnrolPrompt({required this.onEnrol});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          'New to Tenacity?',
          style: AppText.body(fontSize: 13, color: AppColors.muted),
        ),
        const SizedBox(height: AppSpacing.xs),
        TextButton(
          key: const Key('login-enrol'),
          onPressed: onEnrol,
          child: const Text('Enrol now'),
        ),
      ],
    );
  }
}
