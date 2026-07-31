import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/ui/change_password_screen.dart';
import 'package:tenacity/src/ui/edit_profile_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

Parent _parent() => Parent(
      uid: 'parent-1',
      firstName: 'Pat',
      lastName: 'Parent',
      email: 'pat@example.com',
      fcmTokens: const [],
      students: const [],
      phone: '0400 000 000',
      unreadChats: const {},
      activeChats: const [],
    );

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: child,
      ),
    ),
  );
  await tester.pump();
}

class _FakePasswordUpdater implements PasswordUpdater {
  final Completer<void>? gate;
  Object? error;
  int calls = 0;
  String? currentPassword;
  String? newPassword;

  _FakePasswordUpdater({this.gate, this.error});

  @override
  Future<void> update({
    required String currentPassword,
    required String newPassword,
  }) async {
    calls++;
    this.currentPassword = currentPassword;
    this.newPassword = newPassword;
    if (gate != null) await gate!.future;
    if (error != null) throw error!;
  }
}

void main() {
  testWidgets('edit form starts with current values and saves trimmed data',
      (tester) async {
    ProfileUpdate? saved;
    await _pump(
      tester,
      EditProfileScreen(
        initialUser: _parent(),
        onSave: (update) async => saved = update,
      ),
    );

    expect(find.text('Pat'), findsOneWidget);
    expect(find.text('Parent'), findsOneWidget);
    expect(find.text('pat@example.com'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('edit-profile-first-name')),
      '  Patricia  ',
    );
    await tester.tap(find.byKey(const Key('edit-profile-save')));
    await tester.pumpAndSettle();

    expect(saved?.firstName, 'Patricia');
    expect(saved?.email, 'pat@example.com');
    expect(find.byKey(const Key('edit-profile-success')), findsOneWidget);
    expect(find.byKey(const Key('edit-profile-done')), findsOneWidget);
  });

  testWidgets('edit form validates required names and email', (tester) async {
    await _pump(
      tester,
      EditProfileScreen(
        initialUser: _parent(),
        onSave: (_) async {},
      ),
    );

    await tester.enterText(
      find.byKey(const Key('edit-profile-first-name')),
      ' ',
    );
    await tester.enterText(
      find.byKey(const Key('edit-profile-email')),
      'not-an-email',
    );
    await tester.tap(find.byKey(const Key('edit-profile-save')));
    await tester.pump();

    expect(find.text('Enter a name.'), findsOneWidget);
    expect(find.text('Enter a valid email address.'), findsOneWidget);
  });

  testWidgets('edit form keeps a failed save on screen', (tester) async {
    await _pump(
      tester,
      EditProfileScreen(
        initialUser: _parent(),
        onSave: (_) => throw Exception('offline'),
      ),
    );

    await tester.tap(find.byKey(const Key('edit-profile-save')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('edit-profile-error')), findsOneWidget);
    expect(find.byKey(const Key('edit-profile-save')), findsOneWidget);
  });

  testWidgets('password form validates length and matching confirmation',
      (tester) async {
    await _pump(
      tester,
      ChangePasswordScreen(updater: _FakePasswordUpdater()),
    );

    await tester.enterText(
      find.byKey(const Key('password-current')),
      'current-password',
    );
    await tester.enterText(find.byKey(const Key('password-new')), 'short');
    await tester.enterText(
      find.byKey(const Key('password-confirm')),
      'different',
    );
    await tester.tap(find.byKey(const Key('password-submit')));
    await tester.pump();

    expect(find.text('Use at least 8 characters.'), findsOneWidget);
    expect(find.text('Passwords do not match.'), findsOneWidget);
  });

  testWidgets('password change blocks duplicates and shows durable success',
      (tester) async {
    final gate = Completer<void>();
    final updater = _FakePasswordUpdater(gate: gate);
    await _pump(tester, ChangePasswordScreen(updater: updater));

    await tester.enterText(
      find.byKey(const Key('password-current')),
      'current-password',
    );
    await tester.enterText(
      find.byKey(const Key('password-new')),
      'new-password-123',
    );
    await tester.enterText(
      find.byKey(const Key('password-confirm')),
      'new-password-123',
    );
    await tester.tap(find.byKey(const Key('password-submit')));
    await tester.tap(find.byKey(const Key('password-submit')));
    await tester.pump();

    expect(updater.calls, 1);
    gate.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('password-success')), findsOneWidget);
    expect(find.byKey(const Key('password-done')), findsOneWidget);
  });

  testWidgets('password auth failures use a safe message', (tester) async {
    final updater = _FakePasswordUpdater(
      error: FirebaseAuthException(code: 'wrong-password'),
    );
    await _pump(tester, ChangePasswordScreen(updater: updater));

    await tester.enterText(
      find.byKey(const Key('password-current')),
      'wrong-password',
    );
    await tester.enterText(
      find.byKey(const Key('password-new')),
      'new-password-123',
    );
    await tester.enterText(
      find.byKey(const Key('password-confirm')),
      'new-password-123',
    );
    await tester.tap(find.byKey(const Key('password-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Your current password is incorrect.'), findsOneWidget);
  });

  testWidgets('forms fit narrow and large-text layouts', (tester) async {
    await _pump(
      tester,
      EditProfileScreen(
        initialUser: _parent(),
        onSave: (_) async {},
      ),
      size: const Size(320, 640),
      textScale: 1.3,
    );
    expect(tester.takeException(), isNull);
  });
}
