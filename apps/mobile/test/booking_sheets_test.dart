import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/timetable/parent/booking_data.dart';
import 'package:tenacity/src/ui/timetable/parent/booking_sheets.dart';

const _viewports = <String, Size>{
  'reference 402x874': Size(402, 874),
  'narrow 320x640': Size(320, 640),
  'large 430x932': Size(430, 932),
};

Future<void> _pump(
  WidgetTester tester,
  Widget sheet, {
  Size size = const Size(402, 874),
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      // copyWith rather than a fresh MediaQueryData: the sheet sizes itself
      // from the space it is given, and a replacement drops the viewport.
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: Scaffold(
            body: Align(alignment: Alignment.bottomCenter, child: sheet),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

BookingOption _option(
  String action, {
  bool enabled = true,
  String? disabledHint,
}) {
  return BookingOption(
    action: action,
    label: bookingActionLabel(action),
    description: bookingActionDescription(action),
    enabled: enabled,
    disabledHint: disabledHint,
  );
}

List<BookingChild> _children() => const [
      BookingChild(id: 'c1', name: 'Ava'),
      BookingChild(id: 'c2', name: 'Ben'),
    ];

void main() {
  group('BookingOptionsSheet', () {
    Widget sheet({
      List<BookingOption>? options,
      void Function(BookingOption)? onSelected,
    }) {
      return BookingOptionsSheet(
        classTitle: 'Year 11 Standard Maths',
        whenLabel: 'Wednesday, 4:30 PM',
        options: options ??
            [
              _option(BookingActions.notifyAbsence),
              _option(BookingActions.swapThisWeek),
              _option(BookingActions.swapPermanent),
            ],
        onSelected: onSelected ?? (_) {},
      );
    }

    testWidgets('names the class and each option', (tester) async {
      await _pump(tester, sheet());

      expect(find.text('Year 11 Standard Maths'), findsOneWidget);
      expect(find.text('Wednesday, 4:30 PM'), findsOneWidget);
      expect(find.text('Swap this week only'), findsOneWidget);
      expect(
        find.text('Move to a different class for this week only.'),
        findsOneWidget,
      );
    });

    testWidgets('reports the option that was chosen', (tester) async {
      final chosen = <String>[];
      await _pump(tester, sheet(onSelected: (o) => chosen.add(o.action)));

      await tester.tap(find.text('Swap permanently'));
      await tester.pump();

      expect(chosen, [BookingActions.swapPermanent]);
    });

    testWidgets('shows why an option is unavailable instead of hiding it',
        (tester) async {
      final chosen = <String>[];
      await _pump(
        tester,
        sheet(
          options: [
            _option(
              BookingActions.swapThisWeek,
              enabled: false,
              disabledHint: 'You can only change a single week if it is the '
                  'current or the following week.',
            ),
          ],
          onSelected: (o) => chosen.add(o.action),
        ),
      );

      // The reason sits with the option, rather than arriving as a snackbar
      // after tapping a row that looked tappable.
      expect(
        find.textContaining('current or the following week'),
        findsOneWidget,
      );

      await tester.tap(find.text('Swap this week only'));
      await tester.pump();
      expect(chosen, isEmpty);
    });
  });

  group('BookingChildSelectionSheet', () {
    Widget sheet({
      Future<List<BookingChild>>? children,
      void Function(List<BookingChild>)? onConfirm,
      VoidCallback? onCancel,
    }) {
      return BookingChildSelectionSheet(
        action: BookingActions.bookOneOff,
        children: children ?? Future.value(_children()),
        onConfirm: onConfirm ?? (_) {},
        onCancel: onCancel ?? () {},
      );
    }

    testWidgets('lists the children once they resolve', (tester) async {
      await _pump(tester, sheet());
      await tester.pumpAndSettle();

      expect(find.text('Book a one-off class'), findsOneWidget);
      expect(find.text('Who is this for?'), findsOneWidget);
      expect(find.text('Ava'), findsOneWidget);
      expect(find.text('Ben'), findsOneWidget);
    });

    testWidgets('cannot continue until a child is chosen', (tester) async {
      final confirmed = <List<BookingChild>>[];
      await _pump(tester, sheet(onConfirm: confirmed.add));
      await tester.pumpAndSettle();

      final button = tester.widget<FilledButton>(
        find.byKey(const Key('sheet-confirm')),
      );
      expect(button.onPressed, isNull);

      await tester.tap(find.text('Ava'));
      await tester.pump();

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pump();

      expect(confirmed.single.map((c) => c.id), ['c1']);
    });

    testWidgets('a second tap deselects', (tester) async {
      final confirmed = <List<BookingChild>>[];
      await _pump(tester, sheet(onConfirm: confirmed.add));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Ava'));
      await tester.pump();
      await tester.tap(find.text('Ben'));
      await tester.pump();
      await tester.tap(find.text('Ava'));
      await tester.pump();

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pump();

      expect(confirmed.single.map((c) => c.id), ['c2']);
    });

    testWidgets('shows placeholders while the names load', (tester) async {
      final completer = Completer<List<BookingChild>>();
      await _pump(tester, sheet(children: completer.future));

      expect(find.byType(SkeletonBlock), findsWidgets);
      expect(find.text('Ava'), findsNothing);

      completer.complete(_children());
      await tester.pumpAndSettle();

      expect(find.text('Ava'), findsOneWidget);
    });

    testWidgets('says so when the names cannot be loaded', (tester) async {
      final completer = Completer<List<BookingChild>>();
      await _pump(tester, sheet(children: completer.future));

      completer.completeError(Exception('offline'));
      await tester.pumpAndSettle();

      expect(find.text('We could not load your children'), findsOneWidget);
    });

    testWidgets('cancel closes without choosing', (tester) async {
      var cancelled = 0;
      await _pump(tester, sheet(onCancel: () => cancelled++));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cancel'));
      await tester.pump();

      expect(cancelled, 1);
    });
  });

  group('BookingStartWeekSheet', () {
    final choices = [
      SwapStartWeek(
        weekNumber: 2,
        sessionDate: DateTime(2026, 9, 17, 17, 30),
      ),
      SwapStartWeek(
        weekNumber: 3,
        sessionDate: DateTime(2026, 9, 24, 17, 30),
      ),
    ];

    Widget sheet({
      List<SwapStartWeek>? weeks,
      void Function(SwapStartWeek)? onSelected,
    }) {
      return BookingStartWeekSheet(
        toLabel: 'Thursday, 5:30 PM',
        choices: weeks ?? choices,
        onSelected: onSelected ?? (_) {},
      );
    }

    testWidgets('names the class and dates every week it could start',
        (tester) async {
      await _pump(tester, sheet());

      expect(find.text('The first week in Thursday, 5:30 PM.'), findsOneWidget);
      expect(find.text('Thu 17 Sep'), findsOneWidget);
      expect(find.text('Week 2'), findsOneWidget);
      expect(find.text('Thu 24 Sep'), findsOneWidget);
      expect(find.text('Week 3'), findsOneWidget);
    });

    testWidgets('marks the first week as where a swap would start anyway',
        (tester) async {
      // The default has to be visible as the default, or a family who wants
      // the ordinary immediate swap cannot tell which row gives it to them.
      await _pump(tester, sheet());

      expect(find.text('NEXT SESSION'), findsOneWidget);
    });

    testWidgets('reports the week that was chosen', (tester) async {
      SwapStartWeek? chosen;
      await _pump(tester, sheet(onSelected: (week) => chosen = week));

      await tester.tap(find.text('Thu 24 Sep'));
      await tester.pumpAndSettle();

      expect(chosen?.weekNumber, 3);
    });

    testWidgets('explains a term with no sessions left', (tester) async {
      await _pump(tester, sheet(weeks: const []));

      expect(find.text('No sessions left this term'), findsOneWidget);
    });

    for (final entry in _viewports.entries) {
      testWidgets('fits ${entry.key}', (tester) async {
        await _pump(tester, sheet(), size: entry.value);
        expect(tester.takeException(), isNull);
      });

      testWidgets('fits ${entry.key} with a full term to choose from',
          (tester) async {
        // Eleven weeks is a real term length, and the list is already at the
        // sheet's height cap with nine rows on a 6.9-inch phone — so this is
        // the case that has to scroll rather than overflow.
        await _pump(
          tester,
          sheet(
            weeks: [
              for (var week = 1; week <= 11; week++)
                SwapStartWeek(
                  weekNumber: week,
                  sessionDate: DateTime(2026, 9, 3, 17, 30)
                      .add(Duration(days: 7 * (week - 1))),
                ),
            ],
          ),
          size: entry.value,
        );

        expect(tester.takeException(), isNull);
      });
    }
  });

  group('BookingClassSelectionSheet', () {
    Widget sheet({
      List<BookingClassChoice>? choices,
      String action = BookingActions.swapThisWeek,
      void Function(BookingClassChoice)? onSelected,
    }) {
      return BookingClassSelectionSheet(
        action: action,
        choices: choices ??
            const [
              BookingClassChoice(
                classId: 'c2',
                dayOfWeek: 'Thursday',
                timeLabel: '5:30 PM',
                title: 'Year 11 Standard Maths',
                spotsRemaining: 3,
              ),
            ],
        onSelected: onSelected ?? (_) {},
      );
    }

    testWidgets('lists each class with its remaining places', (tester) async {
      await _pump(tester, sheet());

      expect(find.text('Thursday, 5:30 PM'), findsOneWidget);
      expect(find.text('Year 11 Standard Maths'), findsOneWidget);
      expect(find.text('3 SPOTS'), findsOneWidget);
    });

    testWidgets('says whether the move is for a week or the term',
        (tester) async {
      await _pump(tester, sheet());
      expect(
        find.text('The new class applies to this week only.'),
        findsOneWidget,
      );

      await _pump(tester, sheet(action: BookingActions.swapPermanent));
      expect(
        find.text('The new class applies for the rest of the term.'),
        findsOneWidget,
      );
    });

    testWidgets('uses the singular for a single place', (tester) async {
      await _pump(
        tester,
        sheet(
          choices: const [
            BookingClassChoice(
              classId: 'c2',
              dayOfWeek: 'Thursday',
              timeLabel: '5:30 PM',
              title: 'Year 11 Standard Maths',
              spotsRemaining: 1,
            ),
          ],
        ),
      );

      expect(find.text('1 SPOT'), findsOneWidget);
    });

    testWidgets('explains an empty list rather than showing nothing',
        (tester) async {
      await _pump(tester, sheet(choices: const []));

      expect(find.text('No classes to swap into'), findsOneWidget);
    });

    testWidgets('reports the chosen class', (tester) async {
      final chosen = <String>[];
      await _pump(tester, sheet(onSelected: (c) => chosen.add(c.classId)));

      await tester.tap(find.text('Thursday, 5:30 PM'));
      await tester.pump();

      expect(chosen, ['c2']);
    });
  });

  group('BookingConfirmSheet', () {
    Widget sheet({
      String action = BookingActions.bookOneOff,
      bool isBusy = false,
      VoidCallback? onConfirm,
      VoidCallback? onCancel,
    }) {
      return BookingConfirmSheet(
        action: action,
        message: 'You have 3 lesson tokens available. One token will be used.',
        isBusy: isBusy,
        onConfirm: onConfirm ?? () {},
        onCancel: onCancel ?? () {},
      );
    }

    testWidgets('states the commitment and names the action', (tester) async {
      await _pump(tester, sheet());

      expect(find.text('Book a one-off class'), findsOneWidget);
      expect(find.textContaining('One token will be used.'), findsOneWidget);
      expect(find.text('Book class'), findsOneWidget);
    });

    testWidgets('confirming reports once', (tester) async {
      var confirmed = 0;
      await _pump(tester, sheet(onConfirm: () => confirmed++));

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.pump();

      expect(confirmed, 1);
    });

    testWidgets('blocks both buttons while the booking runs', (tester) async {
      var confirmed = 0;
      var cancelled = 0;
      await _pump(
        tester,
        sheet(
          isBusy: true,
          onConfirm: () => confirmed++,
          onCancel: () => cancelled++,
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.tap(find.byKey(const Key('sheet-confirm')));
      await tester.tap(find.text('Cancel'));
      await tester.pump();

      // A double tap must not book twice, and leaving mid-write must not
      // strand the sheet.
      expect(confirmed, 0);
      expect(cancelled, 0);
    });
  });

  group('responsive', () {
    for (final entry in _viewports.entries) {
      for (final scale in const [1.0, 1.3]) {
        testWidgets('options sheet fits ${entry.key} at scale $scale',
            (tester) async {
          await _pump(
            tester,
            BookingOptionsSheet(
              classTitle: 'Year 12 Mathematics Extension 1',
              whenLabel: 'Wednesday, 4:30 PM',
              options: [
                _option(BookingActions.notifyAbsence),
                _option(
                  BookingActions.swapThisWeek,
                  enabled: false,
                  disabledHint: 'You can only change a single week if it is '
                      'the current or the following week.',
                ),
                _option(BookingActions.swapPermanent),
                _option(BookingActions.enrolAnotherThisWeek),
                _option(BookingActions.enrolAnotherPermanent),
              ],
              onSelected: (_) {},
            ),
            size: entry.value,
            textScale: scale,
          );

          expect(tester.takeException(), isNull);
        });

        testWidgets('confirm sheet fits ${entry.key} at scale $scale',
            (tester) async {
          await _pump(
            tester,
            BookingConfirmSheet(
              action: BookingActions.enrolPermanent,
              message: 'Are you sure you want to permanently enrol Ava, Ben? '
                  'You have 4 lesson tokens available. 4 will be used, and '
                  'you will be invoiced for the remaining 6 sessions.',
              isBusy: false,
              onConfirm: () {},
              onCancel: () {},
            ),
            size: entry.value,
            textScale: scale,
          );

          expect(tester.takeException(), isNull);
        });
      }
    }

    testWidgets('a long option list scrolls rather than overflowing',
        (tester) async {
      await _pump(
        tester,
        BookingOptionsSheet(
          classTitle: 'Year 11 Standard Maths',
          whenLabel: 'Wednesday, 4:30 PM',
          options: [
            for (var i = 0; i < 12; i++) _option(BookingActions.swapPermanent),
          ],
          onSelected: (_) {},
        ),
        size: const Size(320, 480),
      );

      expect(tester.takeException(), isNull);
      expect(find.byType(SingleChildScrollView), findsOneWidget);
    });

    testWidgets('the confirm footer stays put when the message is long',
        (tester) async {
      await _pump(
        tester,
        BookingConfirmSheet(
          action: BookingActions.enrolPermanent,
          message: List.filled(40, 'This is a long explanation.').join(' '),
          isBusy: false,
          onConfirm: () {},
          onCancel: () {},
        ),
        size: const Size(320, 480),
      );

      // Pinned, so the decision is always reachable without scrolling to it.
      expect(find.byKey(const Key('sheet-confirm')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
