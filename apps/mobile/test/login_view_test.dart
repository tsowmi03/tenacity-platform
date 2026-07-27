import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/auth/login_form.dart';
import 'package:tenacity/src/ui/auth/login_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

const _viewports = <String, Size>{
  'reference 402x874': Size(402, 874),
  'narrow 320x640': Size(320, 640),
  'large 430x932': Size(430, 932),
};

class Taps {
  int submits = 0;
  int forgotPassword = 0;
  int toggles = 0;
  int enrols = 0;
}

class Harness {
  final Taps taps;
  final TextEditingController email;
  final TextEditingController password;

  Harness(this.taps, this.email, this.password);
}

Future<Harness> pumpLogin(
  WidgetTester tester, {
  bool isLoading = false,
  bool canSubmit = true,
  bool canResetPassword = true,
  bool obscurePassword = true,
  LoginFeedback? feedback,
  String email = 'parent@example.com',
  String password = 'abcdef',
  Size size = const Size(402, 874),
  double textScale = 1.0,
  bool keyboardIsOpen = false,
}) async {
  final taps = Taps();
  final emailController = TextEditingController(text: email);
  final passwordController = TextEditingController(text: password);
  addTearDown(emailController.dispose);
  addTearDown(passwordController.dispose);

  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: Scaffold(
          body: LoginView(
            formKey: GlobalKey<FormState>(),
            emailController: emailController,
            passwordController: passwordController,
            isLoading: isLoading,
            canSubmit: canSubmit,
            canResetPassword: canResetPassword,
            obscurePassword: obscurePassword,
            keyboardIsOpen: keyboardIsOpen,
            feedback: feedback,
            onSubmit: () => taps.submits++,
            onForgotPassword: () => taps.forgotPassword++,
            onToggleObscure: () => taps.toggles++,
            onEnrol: () => taps.enrols++,
          ),
        ),
      ),
    ),
  );
  await tester.pump();

  return Harness(taps, emailController, passwordController);
}

void main() {
  group('hierarchy', () {
    testWidgets('renders the brand, both fields and the actions',
        (tester) async {
      await pumpLogin(tester);

      expect(find.text('Welcome back'), findsOneWidget);
      expect(
        find.text('Sign in to see your classes, messages and invoices.'),
        findsOneWidget,
      );

      expect(find.byKey(const Key('login-email')), findsOneWidget);
      expect(find.byKey(const Key('login-password')), findsOneWidget);
      expect(find.text('Log in'), findsOneWidget);
      expect(find.text('Forgot your password?'), findsOneWidget);
      expect(find.text('New to Tenacity?'), findsOneWidget);
      expect(find.text('Enrol now'), findsOneWidget);
    });

    testWidgets('says nothing about the outcome before an attempt',
        (tester) async {
      await pumpLogin(tester);

      expect(find.byKey(const Key('login-feedback-error')), findsNothing);
      expect(find.byKey(const Key('login-feedback-success')), findsNothing);
    });
  });

  group('feedback', () {
    testWidgets('shows a failure as an error', (tester) async {
      await pumpLogin(
        tester,
        feedback: const LoginFeedback.error('Invalid username or password.'),
      );

      expect(find.byKey(const Key('login-feedback-error')), findsOneWidget);
      expect(find.text('Invalid username or password.'), findsOneWidget);
    });

    // A sent reset email must not be dressed as a failure, which is how it read
    // when it arrived on the error channel.
    testWidgets('shows a sent reset email as a success, not an error',
        (tester) async {
      await pumpLogin(
        tester,
        feedback: const LoginFeedback.success(
          'Sent! Please check your inbox to reset your password.',
        ),
      );

      expect(find.byKey(const Key('login-feedback-success')), findsOneWidget);
      expect(find.byKey(const Key('login-feedback-error')), findsNothing);
    });
  });

  group('submission', () {
    testWidgets('an incomplete form cannot be submitted', (tester) async {
      final harness = await pumpLogin(tester, canSubmit: false);

      await tester.tap(find.byKey(const Key('login-submit')));
      expect(harness.taps.submits, 0);
    });

    testWidgets('a complete form can be', (tester) async {
      final harness = await pumpLogin(tester);

      await tester.tap(find.byKey(const Key('login-submit')));
      expect(harness.taps.submits, 1);
    });

    // Without this a second tap starts a second sign-in over the first.
    testWidgets('the button is inert while a sign-in is in flight',
        (tester) async {
      final harness = await pumpLogin(tester, isLoading: true);

      await tester.tap(find.byKey(const Key('login-submit')));
      expect(harness.taps.submits, 0);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Log in'), findsNothing);
    });

    testWidgets('the submit button keeps its height while loading',
        (tester) async {
      await pumpLogin(tester);
      final idle = tester.getSize(find.byKey(const Key('login-submit')));

      await pumpLogin(tester, isLoading: true);
      final loading = tester.getSize(find.byKey(const Key('login-submit')));

      expect(loading.height, idle.height);
    });
  });

  group('password reset', () {
    testWidgets('is offered once an email has been entered', (tester) async {
      final harness = await pumpLogin(tester);

      await tester.tap(find.byKey(const Key('login-forgot-password')));
      expect(harness.taps.forgotPassword, 1);
    });

    // Firebase would reject it, and the round trip only produces an error the
    // form could have given straight away.
    testWidgets('is not offered without a usable email', (tester) async {
      final harness = await pumpLogin(tester, canResetPassword: false);

      await tester.tap(find.byKey(const Key('login-forgot-password')));
      expect(harness.taps.forgotPassword, 0);
    });

    testWidgets('is offered even when the password is unusable',
        (tester) async {
      final harness = await pumpLogin(tester, canSubmit: false);

      await tester.tap(find.byKey(const Key('login-forgot-password')));
      expect(harness.taps.forgotPassword, 1);
    });
  });

  group('password visibility', () {
    testWidgets('starts hidden and can be revealed', (tester) async {
      final harness = await pumpLogin(tester);

      expect(find.byIcon(Icons.visibility_off_outlined), findsOneWidget);

      await tester.tap(find.byKey(const Key('login-toggle-password')));
      expect(harness.taps.toggles, 1);
    });

    testWidgets('shows the hide icon once revealed', (tester) async {
      await pumpLogin(tester, obscurePassword: false);

      expect(find.byIcon(Icons.visibility_outlined), findsOneWidget);
    });
  });

  group('enrolment', () {
    testWidgets('offers a way to sign up', (tester) async {
      final harness = await pumpLogin(tester);

      await tester.tap(find.byKey(const Key('login-enrol')));
      expect(harness.taps.enrols, 1);
    });
  });

  group('validation timing', () {
    // Under `onUserInteraction` the whole form was validated the moment
    // anything was typed, so entering an email drew a red "Please enter your
    // password" under a field the user had not reached yet.
    testWidgets('does not fault a field the user has not reached',
        (tester) async {
      await pumpLogin(tester, email: '', password: '');

      await tester.enterText(
        find.byKey(const Key('login-email')),
        'parent@example.com',
      );
      await tester.pump();

      expect(find.text('Please enter your password.'), findsNothing);
    });

    testWidgets('faults a field once it has been left', (tester) async {
      await pumpLogin(tester, email: '', password: '');

      await tester.tap(find.byKey(const Key('login-password')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('login-email')));
      await tester.pumpAndSettle();

      expect(find.text('Please enter your password.'), findsOneWidget);
    });
  });

  group('layout', () {
    for (final entry in _viewports.entries) {
      testWidgets('lays out without overflow at ${entry.key}', (tester) async {
        await pumpLogin(tester, size: entry.value);

        expect(tester.takeException(), isNull);
        expect(find.text('Welcome back'), findsOneWidget);
        expect(find.byKey(const Key('login-submit')), findsOneWidget);
      });

      testWidgets('lays out at ${entry.key} with large text', (tester) async {
        await pumpLogin(tester, size: entry.value, textScale: 1.3);

        expect(tester.takeException(), isNull);
      });
    }

    // The keyboard leaves too little room for both the brand and the form on a
    // short phone, and the form is what the user came for.
    testWidgets('drops the brand when the keyboard is open', (tester) async {
      await pumpLogin(
        tester,
        size: const Size(320, 640),
        keyboardIsOpen: true,
      );

      expect(tester.takeException(), isNull);
      expect(
        find.text('Sign in to see your classes, messages and invoices.'),
        findsNothing,
      );
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.byKey(const Key('login-email')), findsOneWidget);
    });

    testWidgets('a long error message wraps rather than overflowing',
        (tester) async {
      await pumpLogin(
        tester,
        size: const Size(320, 640),
        feedback: const LoginFeedback.error(
          'No internet connection. Please reconnect, then try again.',
        ),
      );

      expect(tester.takeException(), isNull);
      expect(find.byKey(const Key('login-feedback-error')), findsOneWidget);
    });
  });
}
