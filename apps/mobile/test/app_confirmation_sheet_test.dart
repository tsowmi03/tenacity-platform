import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

void main() {
  group('showAppConfirmationSheet', () {
    testWidgets('returns true only from the confirm action', (tester) async {
      bool? result;
      await _pumpLauncher(
        tester,
        onResult: (value) => result = value,
      );

      await tester.tap(find.byKey(const Key('open-confirmation')));
      await tester.pumpAndSettle();

      expect(find.byType(AppBottomSheet), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('Archive this announcement?'), findsOneWidget);
      expect(
        find.text('It will disappear from parent and tutor feeds.'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('app-confirmation-confirm')));
      await tester.pumpAndSettle();

      expect(result, isTrue);
      expect(find.byType(AppConfirmationSheet), findsNothing);
    });

    testWidgets('cancel and barrier dismissal both return false',
        (tester) async {
      final results = <bool>[];
      await _pumpLauncher(tester, onResult: results.add);

      await tester.tap(find.byKey(const Key('open-confirmation')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('app-confirmation-cancel')));
      await tester.pumpAndSettle();

      expect(results, [isFalse]);

      await tester.tap(find.byKey(const Key('open-confirmation')));
      await tester.pumpAndSettle();
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      expect(results, [isFalse, isFalse]);
    });

    testWidgets('honours custom labels and confirm key', (tester) async {
      bool? result;
      await _pumpLauncher(
        tester,
        title: 'Leave without saving?',
        message: 'The attendance and feedback you entered will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        confirmKey: const Key('discard-roll'),
        onResult: (value) => result = value,
      );

      await tester.tap(find.byKey(const Key('open-confirmation')));
      await tester.pumpAndSettle();

      expect(find.text('Keep editing'), findsOneWidget);
      expect(find.byKey(const Key('discard-roll')), findsOneWidget);

      await tester.tap(find.byKey(const Key('discard-roll')));
      await tester.pumpAndSettle();
      expect(result, isTrue);
    });
  });

  group('confirmation tone', () {
    testWidgets('destructive action is red and announced without relying on it',
        (tester) async {
      final semantics = tester.ensureSemantics();
      await _pumpLauncher(
        tester,
        title: 'Delete account?',
        message: 'This permanently deletes your account data.',
        confirmLabel: 'Delete',
        tone: AppConfirmationTone.destructive,
        onResult: (_) {},
      );

      await tester.tap(find.byKey(const Key('open-confirmation')));
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(
        find.byKey(const Key('app-confirmation-confirm')),
      );
      expect(
        button.style?.backgroundColor?.resolve(<WidgetState>{}),
        AppColors.danger,
      );
      expect(
        find.bySemanticsLabel('Delete. Destructive action.'),
        findsOneWidget,
      );
      semantics.dispose();
    });

    testWidgets('caution action uses the warning token and semantic warning',
        (tester) async {
      final semantics = tester.ensureSemantics();
      await _pumpLauncher(
        tester,
        confirmLabel: 'Continue',
        tone: AppConfirmationTone.caution,
        onResult: (_) {},
      );

      await tester.tap(find.byKey(const Key('open-confirmation')));
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(
        find.byKey(const Key('app-confirmation-confirm')),
      );
      expect(
        button.style?.backgroundColor?.resolve(<WidgetState>{}),
        AppColors.warning,
      );
      expect(find.bySemanticsLabel('Continue. Caution.'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets('standard action keeps the app filled-button theme',
        (tester) async {
      await _pumpLauncher(tester, onResult: (_) {});

      await tester.tap(find.byKey(const Key('open-confirmation')));
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(
        find.byKey(const Key('app-confirmation-confirm')),
      );
      expect(button.style, isNull);
    });
  });

  testWidgets('fits a narrow phone with larger accessibility text',
      (tester) async {
    await _pumpLauncher(
      tester,
      size: const Size(320, 640),
      textScale: 1.3,
      title: 'Delete this conversation?',
      message: 'It will be removed from your inbox. This cannot be undone.',
      confirmLabel: 'Delete forever',
      cancelLabel: 'Keep account',
      tone: AppConfirmationTone.destructive,
      onResult: (_) {},
    );

    await tester.tap(find.byKey(const Key('open-confirmation')));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Delete forever'), findsOneWidget);
    expect(find.text('Keep account'), findsOneWidget);
  });
}

Future<void> _pumpLauncher(
  WidgetTester tester, {
  required ValueChanged<bool> onResult,
  String title = 'Archive this announcement?',
  String message = 'It will disappear from parent and tutor feeds.',
  String confirmLabel = 'Archive',
  String cancelLabel = 'Cancel',
  AppConfirmationTone tone = AppConfirmationTone.standard,
  Key? confirmKey,
  Size size = const Size(402, 874),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(textScale),
        ),
        child: child!,
      ),
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: FilledButton(
              key: const Key('open-confirmation'),
              onPressed: () async {
                final result = await showAppConfirmationSheet(
                  context: context,
                  title: title,
                  message: message,
                  confirmLabel: confirmLabel,
                  cancelLabel: cancelLabel,
                  tone: tone,
                  confirmKey: confirmKey,
                );
                onResult(result);
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    ),
  );
}
