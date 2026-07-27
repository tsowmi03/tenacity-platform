import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/ui/login_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// Stands in for the real controller so the screen's wiring can be exercised
/// without Firebase. Messages are settable, because what the screen does with
/// them is the point.
class _FakeAuthController extends ChangeNotifier implements AuthController {
  String? _errorMessage;
  String? _statusMessage;
  int clearMessageCalls = 0;

  _FakeAuthController({String? errorMessage, String? statusMessage})
      : _errorMessage = errorMessage,
        _statusMessage = statusMessage;

  @override
  AppUser? get currentUser => null;

  @override
  String? get errorMessage => _errorMessage;

  @override
  String? get statusMessage => _statusMessage;

  @override
  bool get isLoading => false;

  @override
  void clearMessages() {
    clearMessageCalls++;
    if (_errorMessage == null && _statusMessage == null) return;
    _errorMessage = null;
    _statusMessage = null;
    notifyListeners();
  }

  @override
  Future<void> login(String email, String password) async {}

  @override
  Future<void> resetPassword(String email) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> pumpLoginScreen(
  WidgetTester tester,
  _FakeAuthController controller,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider<AuthController>.value(
      value: controller,
      child: MaterialApp(
        theme: AppTheme.light,
        home: const LoginScreen(),
      ),
    ),
  );
}

void main() {
  testWidgets('Login screen enables login for valid credentials',
      (WidgetTester tester) async {
    await pumpLoginScreen(tester, _FakeAuthController());

    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Log in'), findsOneWidget);

    FilledButton loginButton = tester.widget(
      find.byKey(const Key('login-submit')),
    );
    expect(loginButton.onPressed, isNull);

    await tester.enterText(
      find.byKey(const Key('login-email')),
      'parent@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('login-password')),
      'password123',
    );
    await tester.pump();

    loginButton = tester.widget(find.byKey(const Key('login-submit')));
    expect(loginButton.onPressed, isNotNull);
  });

  testWidgets(
      'Login screen withholds a password reset until the email is '
      'usable', (WidgetTester tester) async {
    await pumpLoginScreen(tester, _FakeAuthController());

    TextButton resetButton = tester.widget(
      find.byKey(const Key('login-forgot-password')),
    );
    expect(resetButton.onPressed, isNull);

    // No password: a family who has forgotten theirs will not have typed one.
    await tester.enterText(
      find.byKey(const Key('login-email')),
      'parent@example.com',
    );
    await tester.pump();

    resetButton = tester.widget(find.byKey(const Key('login-forgot-password')));
    expect(resetButton.onPressed, isNotNull);
  });

  // A sent reset email arrives on the controller's status channel, and must not
  // be shown in the red the error channel gets.
  testWidgets('Login screen shows a sent reset email as a success',
      (WidgetTester tester) async {
    await pumpLoginScreen(
      tester,
      _FakeAuthController(
        statusMessage: 'Sent! Please check your inbox to reset your password.',
      ),
    );

    expect(find.byKey(const Key('login-feedback-success')), findsOneWidget);
    expect(find.byKey(const Key('login-feedback-error')), findsNothing);
  });

  testWidgets('Login screen shows a failed sign-in as an error',
      (WidgetTester tester) async {
    await pumpLoginScreen(
      tester,
      _FakeAuthController(errorMessage: 'Invalid username or password.'),
    );

    expect(find.byKey(const Key('login-feedback-error')), findsOneWidget);
    expect(find.text('Invalid username or password.'), findsOneWidget);
  });

  // The screen must read the keyboard inset above its own Scaffold, because a
  // Scaffold removes the bottom view inset from its body's MediaQuery. Read
  // from inside, it was always zero and the compact layout never appeared.
  testWidgets('Login screen drops the brand when the keyboard opens',
      (WidgetTester tester) async {
    await pumpLoginScreen(tester, _FakeAuthController());
    expect(
      find.text('Sign in to see your classes, messages and invoices.'),
      findsOneWidget,
    );

    tester.view.viewInsets = const FakeViewPadding(bottom: 600);
    addTearDown(tester.view.resetViewInsets);
    await tester.pump();

    expect(
      find.text('Sign in to see your classes, messages and invoices.'),
      findsNothing,
    );
    expect(find.byKey(const Key('login-email')), findsOneWidget);
  });

  // An error from the previous attempt should not sit beside input that has
  // since changed.
  testWidgets('Login screen clears a stale error once the form is edited',
      (WidgetTester tester) async {
    final controller = _FakeAuthController(
      errorMessage: 'Invalid username or password.',
    );
    await pumpLoginScreen(tester, controller);

    expect(find.byKey(const Key('login-feedback-error')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('login-email')), 'p');
    await tester.pump();

    expect(controller.clearMessageCalls, greaterThan(0));
    expect(find.byKey(const Key('login-feedback-error')), findsNothing);
  });
}
