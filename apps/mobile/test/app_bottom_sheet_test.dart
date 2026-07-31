import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  testWidgets('keeps a form footer above the keyboard inset', (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: Builder(
            builder: (context) => Center(
              child: FilledButton(
                onPressed: () => showAppBottomSheet<void>(
                  context: context,
                  builder: (_) => AppBottomSheet(
                    title: 'Keyboard form',
                    footer: const SizedBox(
                      key: Key('keyboard-sheet-footer'),
                      height: 48,
                    ),
                    child: const TextField(autofocus: true),
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    tester.view.viewInsets = const FakeViewPadding(bottom: 260);
    await tester.pumpAndSettle();

    final footerBottom = tester
        .getBottomRight(find.byKey(const Key('keyboard-sheet-footer')))
        .dy;
    expect(footerBottom, lessThanOrEqualTo(874 - 260));
    expect(tester.takeException(), isNull);
  });
}
