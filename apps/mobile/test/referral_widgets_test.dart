import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/components/app_bottom_sheet.dart';
import 'package:tenacity/src/ui/referrals/referral_widgets.dart';

void main() {
  testWidgets('the sheet scrolls rather than overflowing at large text sizes',
      (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => showAppBottomSheet<void>(
              context: context,
              builder: (_) => ReferralSheet(onCopy: () {}, onNotNow: () {}),
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    final notNow = find.byKey(const Key('referral-sheet-not-now'));
    await tester.scrollUntilVisible(notNow, 100,
        scrollable: find.descendant(
          of: find.byKey(const Key('referral-sheet')),
          matching: find.byType(Scrollable),
        ));
    expect(notNow.hitTestable(), findsOneWidget);
  });
}
