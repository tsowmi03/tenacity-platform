import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/users/admin/admin_person_screen.dart';

void main() {
  testWidgets('lesson-token sheet starts at the current balance and saves',
      (tester) async {
    int? saved;
    await _pumpSheet(
      tester,
      initialValue: 8,
      onSave: (value) => saved = value,
    );

    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Edit lesson tokens'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(
            find.byKey(const Key('admin-lesson-tokens-field')),
          )
          .controller
          ?.text,
      '8',
    );

    await tester.enterText(
      find.byKey(const Key('admin-lesson-tokens-field')),
      ' 12 ',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();

    expect(saved, 12);
  });

  testWidgets(
      'lesson-token sheet explains blank, non-integer and negative input',
      (tester) async {
    final saved = <int>[];
    await _pumpSheet(tester, initialValue: 4, onSave: saved.add);

    await tester.enterText(
      find.byKey(const Key('admin-lesson-tokens-field')),
      '',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();
    expect(saved, isEmpty);
    expect(find.text('Enter a lesson-token balance.'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('admin-lesson-tokens-field')),
      'not a number',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();
    expect(saved, isEmpty);
    expect(find.text('Enter a whole number.'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('admin-lesson-tokens-field')),
      '-1',
    );
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();
    expect(saved, isEmpty);
    expect(
      find.text('Lesson tokens cannot be negative.'),
      findsOneWidget,
    );

    await tester.enterText(
      find.byKey(const Key('admin-lesson-tokens-field')),
      '0',
    );
    await tester.pump();
    expect(find.text('Lesson tokens cannot be negative.'), findsNothing);
    await tester.tap(find.byKey(const Key('sheet-confirm')));
    await tester.pump();
    expect(saved, [0]);
  });

  testWidgets('lesson-token sheet reports cancellation', (tester) async {
    var cancellations = 0;
    await _pumpSheet(
      tester,
      initialValue: 3,
      onSave: (_) {},
      onCancel: () => cancellations++,
    );

    await tester.tap(find.text('Cancel'));
    await tester.pump();

    expect(cancellations, 1);
  });

  testWidgets('lesson-token form fits narrow, large-text and keyboard layouts',
      (tester) async {
    await _pumpSheet(
      tester,
      initialValue: 120,
      onSave: (_) {},
      size: const Size(320, 640),
      textScale: 1.3,
      viewInsets: const EdgeInsets.only(bottom: 260),
    );

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('admin-lesson-tokens-field')), findsOneWidget);
    expect(find.byKey(const Key('sheet-confirm')), findsOneWidget);
  });
}

Future<void> _pumpSheet(
  WidgetTester tester, {
  required int initialValue,
  required ValueChanged<int> onSave,
  VoidCallback? onCancel,
  Size size = const Size(402, 874),
  double textScale = 1,
  EdgeInsets viewInsets = EdgeInsets.zero,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
          viewInsets: viewInsets,
        ),
        child: Scaffold(
          body: AdminLessonTokensSheet(
            initialValue: initialValue,
            onSave: onSave,
            onCancel: onCancel ?? () {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}
