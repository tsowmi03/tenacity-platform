import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/helpers/offline_action_guard.dart';
import 'package:tenacity/src/ui/auth/login_form.dart';
import 'package:tenacity/src/ui/auth/login_view.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';
import 'package:url_launcher/url_launcher.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    _emailController.addListener(_onFieldChanged);
    _passwordController.addListener(_onFieldChanged);
  }

  @override
  void dispose() {
    _emailController.removeListener(_onFieldChanged);
    _passwordController.removeListener(_onFieldChanged);
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _onFieldChanged() {
    // The submit button and the reset link both derive from the field values,
    // so the rebuild is what enables them.
    setState(() {});
    // A failure from the previous attempt should not sit beside input that has
    // since changed. Clearing is a no-op when there is nothing to clear, so
    // this does not notify on every keystroke.
    context.read<AuthController>().clearMessages();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    if (!await OfflineActionGuard.ensureOnline(context, action: 'log in')) {
      return;
    }
    if (!mounted) return;

    await context.read<AuthController>().login(
          _emailController.text.trim(),
          _passwordController.text.trim(),
        );
    // The outcome is shown inline by LoginView, from the controller's message
    // channels. On success this screen is replaced by AuthWrapper.
  }

  Future<void> _resetPassword() async {
    final email = _emailController.text.trim();

    if (!await OfflineActionGuard.ensureOnline(
      context,
      action: 'reset your password',
    )) {
      return;
    }
    if (!mounted) return;

    await context.read<AuthController>().resetPassword(email);
  }

  Future<void> _openEnrolment() async {
    final url = Uri.parse('https://www.tenacitytutoring.com/register');
    if (await canLaunchUrl(url)) {
      await launchUrl(url);
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Could not launch the registration page.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authController = context.watch<AuthController>();
    final email = _emailController.text;

    // Read above the Scaffold: the Scaffold removes the bottom view inset from
    // its body's MediaQuery, so the view itself cannot see the keyboard.
    final keyboardIsOpen = MediaQuery.viewInsetsOf(context).bottom > 0;

    return Scaffold(
      backgroundColor: AppColors.ink,
      body: LoginView(
        formKey: _formKey,
        emailController: _emailController,
        passwordController: _passwordController,
        isLoading: authController.isLoading,
        canSubmit: canSubmitLogin(
          email: email,
          password: _passwordController.text,
        ),
        canResetPassword: canRequestPasswordReset(email),
        obscurePassword: _obscurePassword,
        keyboardIsOpen: keyboardIsOpen,
        feedback: LoginFeedback.from(
          errorMessage: authController.errorMessage,
          statusMessage: authController.statusMessage,
        ),
        onSubmit: _login,
        onForgotPassword: _resetPassword,
        onToggleObscure: () =>
            setState(() => _obscurePassword = !_obscurePassword),
        onEnrol: _openEnrolment,
      ),
    );
  }
}
