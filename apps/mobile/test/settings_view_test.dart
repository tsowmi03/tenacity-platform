import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/components/state_surfaces.dart';
import 'package:tenacity/src/ui/settings/settings_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

class _Actions {
  int backs = 0;
  int edits = 0;
  int passwords = 0;
  int terms = 0;
  int deletes = 0;
  bool? spotOpened;
  bool? lessonReminder;
}

Future<_Actions> _pumpSettings(
  WidgetTester tester, {
  bool isParent = true,
  bool loading = false,
  String? notificationError,
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  final actions = _Actions();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: SettingsView(
          isParent: isParent,
          isLoadingNotifications: loading,
          isDeletingAccount: false,
          spotOpened: true,
          lessonReminder: false,
          isUpdatingSpotOpened: false,
          isUpdatingLessonReminder: false,
          notificationError: notificationError,
          onBack: () => actions.backs++,
          onRetryNotifications: () {},
          onSpotOpenedChanged: (value) => actions.spotOpened = value,
          onLessonReminderChanged: (value) => actions.lessonReminder = value,
          onEditProfile: () => actions.edits++,
          onChangePassword: () => actions.passwords++,
          onOpenTerms: () => actions.terms++,
          onDeleteAccount: () => actions.deletes++,
        ),
      ),
    ),
  );
  await tester.pump();
  return actions;
}

void main() {
  testWidgets('parent sees and can change notification preferences',
      (tester) async {
    final actions = await _pumpSettings(tester);

    expect(find.text('NOTIFICATIONS'), findsOneWidget);
    expect(find.text('Spot opened'), findsOneWidget);
    expect(find.text('Lesson reminder'), findsOneWidget);

    await tester.tap(find.byKey(const Key('settings-spot-opened')));
    await tester.pump();
    expect(actions.spotOpened, isFalse);
  });

  testWidgets('non-parent omits notification preferences', (tester) async {
    await _pumpSettings(tester, isParent: false);

    expect(find.text('NOTIFICATIONS'), findsNothing);
    expect(find.text('Spot opened'), findsNothing);
    expect(find.text('ACCOUNT'), findsOneWidget);
  });

  testWidgets('account and legal actions are wired', (tester) async {
    final actions = await _pumpSettings(tester, isParent: false);

    await tester.tap(find.byKey(const Key('settings-edit-profile')));
    await tester.tap(find.byKey(const Key('settings-change-password')));
    await tester.tap(find.byKey(const Key('settings-terms')));
    await tester.tap(find.byKey(const Key('settings-delete-account')));

    expect(actions.edits, 1);
    expect(actions.passwords, 1);
    expect(actions.terms, 1);
    expect(actions.deletes, 1);
  });

  testWidgets('shows notification loading and retry states', (tester) async {
    await _pumpSettings(tester, loading: true);
    expect(find.byType(SkeletonBlock), findsOneWidget);

    await _pumpSettings(
      tester,
      notificationError: 'Settings could not be loaded.',
    );
    expect(
      find.byKey(const Key('settings-notification-error')),
      findsOneWidget,
    );
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('fits narrow and large-text layouts', (tester) async {
    await _pumpSettings(
      tester,
      size: const Size(320, 640),
      textScale: 1.3,
    );

    expect(tester.takeException(), isNull);
  });
}
