import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/ui/login_screen.dart';

class _FakeAuthController extends ChangeNotifier implements AuthController {
  @override
  AppUser? get currentUser => null;

  @override
  String? get errorMessage => null;

  @override
  bool get isLoading => false;

  @override
  Future<void> login(String email, String password) async {}

  @override
  Future<void> resetPassword(String email) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('Login screen enables login for valid credentials',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthController>.value(
        value: _FakeAuthController(),
        child: const MaterialApp(
          home: LoginScreen(),
        ),
      ),
    );

    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Log In'), findsOneWidget);

    ElevatedButton loginButton = tester.widget(
      find.widgetWithText(ElevatedButton, 'Log In'),
    );
    expect(loginButton.onPressed, isNull);

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Email'),
      'parent@example.com',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Password'),
      'password123',
    );
    await tester.pump();

    loginButton = tester.widget(
      find.widgetWithText(ElevatedButton, 'Log In'),
    );
    expect(loginButton.onPressed, isNotNull);
  });
}
