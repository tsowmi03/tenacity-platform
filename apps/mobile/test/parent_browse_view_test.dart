import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_browse_data.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_browse_view.dart';

const _viewports = <String, Size>{
  'reference 402x874': Size(402, 874),
  'narrow 320x640': Size(320, 640),
  'large 430x932': Size(430, 932),
};

ParentBrowseClass _browseClass({
  String classId = 'c1',
  String time = '4:30',
  String title = 'Year 11 Standard Maths',
  String subtitle = 'One-off spot this week · Jordan Lee',
  ParentBrowseAvailability availability = ParentBrowseAvailability.open,
  int spotsRemaining = 3,
  int day = 15,
}) {
  return ParentBrowseClass(
    classId: classId,
    startsAt: DateTime(2026, 7, day, 16, 30),
    time: time,
    durationLabel: '1 hr',
    title: title,
    subtitle: subtitle,
    availability: availability,
    spotsRemaining: spotsRemaining,
    childIds: const [],
  );
}

/// A populated week by default. Optional sections use explicit flags rather
/// than nullable overrides so a test can express "nothing here".
ParentBrowseViewData _data({
  List<ParentBrowseDay>? days,
  DateTime? selectedDay,
  bool canGoToPreviousWeek = false,
  bool canGoToNextWeek = true,
  String weekTitle = 'Week 1 · 13 – 19 Jul',
  String weekSubtitle = 'Term 3 · 2 classes available',
  bool withWeekDates = true,
  String? preTermNotice,
  String? errorMessage,
}) {
  return ParentBrowseViewData(
    weekTitle: weekTitle,
    weekSubtitle: weekSubtitle,
    weekDates: withWeekDates
        ? [for (var i = 13; i <= 19; i++) DateTime(2026, 7, i)]
        : const [],
    daysWithClasses: const {DateTime.wednesday, DateTime.saturday},
    selectedDay: selectedDay,
    days: days ??
        [
          ParentBrowseDay(
            date: DateTime(2026, 7, 15),
            isToday: true,
            classes: [_browseClass()],
          ),
          ParentBrowseDay(
            date: DateTime(2026, 7, 18),
            isToday: false,
            classes: [
              _browseClass(
                classId: 'c2',
                time: '10:00',
                title: 'Year 9 English',
                subtitle: 'Class is full · Jordan Lee',
                availability: ParentBrowseAvailability.waitlist,
                day: 18,
              ),
            ],
          ),
        ],
    canGoToPreviousWeek: canGoToPreviousWeek,
    canGoToNextWeek: canGoToNextWeek,
    preTermNotice: preTermNotice,
    errorMessage: errorMessage,
  );
}

class Taps {
  int refreshes = 0;
  int previous = 0;
  int next = 0;
  int back = 0;
  int retries = 0;
  final days = <DateTime?>[];
  final classes = <String>[];
}

Future<Taps> pumpBrowse(
  WidgetTester tester,
  ParentBrowseViewData data, {
  Size size = const Size(402, 874),
  double textScale = 1.0,
}) async {
  final taps = Taps();

  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: ParentBrowseView(
          data: data,
          onRefresh: () async => taps.refreshes++,
          onDaySelected: taps.days.add,
          onPreviousWeek: () => taps.previous++,
          onNextWeek: () => taps.next++,
          onBack: () => taps.back++,
          onRetry: () => taps.retries++,
          onClassTapped: (c) => taps.classes.add(c.classId),
        ),
      ),
    ),
  );
  await tester.pump();

  return taps;
}

void main() {
  group('hierarchy', () {
    testWidgets('renders the week, days and classes', (tester) async {
      await pumpBrowse(tester, _data());

      expect(find.text('Available classes'), findsOneWidget);
      expect(find.text('Week 1 · 13 – 19 Jul'), findsOneWidget);
      expect(find.text('Term 3 · 2 classes available'), findsOneWidget);

      expect(find.text('WEDNESDAY 15'), findsOneWidget);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('SATURDAY 18'), findsOneWidget);

      expect(find.text('Year 11 Standard Maths'), findsOneWidget);
      expect(find.text('Year 9 English'), findsOneWidget);
      expect(find.text('3 SPOTS'), findsOneWidget);
      expect(find.text('WAITLIST'), findsOneWidget);
    });

    testWidgets('renders every day of the week strip', (tester) async {
      await pumpBrowse(tester, _data());

      for (final label in const [
        'MON',
        'TUE',
        'WED',
        'THU',
        'FRI',
        'SAT',
        'SUN'
      ]) {
        expect(find.text(label), findsOneWidget, reason: '$label missing');
      }
    });

    testWidgets('marks only today with the Today label', (tester) async {
      await pumpBrowse(
        tester,
        _data(
          days: [
            ParentBrowseDay(
              date: DateTime(2026, 7, 18),
              isToday: false,
              classes: [_browseClass(day: 18)],
            ),
          ],
        ),
      );

      expect(find.text('Today'), findsNothing);
    });

    testWidgets('shows a class the family is already in as booked',
        (tester) async {
      await pumpBrowse(
        tester,
        _data(
          days: [
            ParentBrowseDay(
              date: DateTime(2026, 7, 15),
              isToday: true,
              classes: [
                _browseClass(
                  availability: ParentBrowseAvailability.booked,
                  subtitle: 'Ella · Jordan Lee',
                ),
              ],
            ),
          ],
        ),
      );

      expect(find.text('BOOKED'), findsOneWidget);
      expect(find.text('Ella · Jordan Lee'), findsOneWidget);
    });

    testWidgets('shows a cancelled session rather than hiding it',
        (tester) async {
      await pumpBrowse(
        tester,
        _data(
          days: [
            ParentBrowseDay(
              date: DateTime(2026, 7, 15),
              isToday: true,
              classes: [
                _browseClass(
                  availability: ParentBrowseAvailability.cancelled,
                  subtitle: 'This session is cancelled',
                ),
              ],
            ),
          ],
        ),
      );

      expect(find.text('CANCELLED'), findsOneWidget);
      expect(find.text('Year 11 Standard Maths'), findsOneWidget);
    });
  });

  group('notices', () {
    testWidgets('shows the pre-term notice when there is one', (tester) async {
      await pumpBrowse(
        tester,
        _data(
          preTermNotice: 'Term 3 starts on 13 July. Bookings are open now, '
              'but lessons begin then.',
        ),
      );

      expect(find.byKey(const Key('parent-browse-pre-term')), findsOneWidget);
      expect(find.textContaining('Term 3 starts on 13 July'), findsOneWidget);
    });

    testWidgets('omits the notice once the term is under way', (tester) async {
      await pumpBrowse(tester, _data());

      expect(find.byKey(const Key('parent-browse-pre-term')), findsNothing);
    });
  });

  group('empty and failed states', () {
    testWidgets('an empty week says so and keeps the pager', (tester) async {
      await pumpBrowse(tester, _data(days: const []));

      expect(
        find.byKey(const Key('parent-browse-empty-week')),
        findsOneWidget,
      );
      expect(find.text('Week 1 · 13 – 19 Jul'), findsOneWidget);
    });

    testWidgets('an empty day offers a way back to the whole week',
        (tester) async {
      final taps = await pumpBrowse(
        tester,
        _data(days: const [], selectedDay: DateTime(2026, 7, 16)),
      );

      expect(find.byKey(const Key('parent-browse-empty-day')), findsOneWidget);

      await tester.tap(find.text('Show the whole week'));
      expect(taps.days, [null]);
    });

    // A failure must not read as "nothing available this week".
    testWidgets('a load failure shows an error, not an empty week',
        (tester) async {
      final taps = await pumpBrowse(
        tester,
        _data(days: const [], errorMessage: 'We could not check the classes.'),
      );

      expect(find.byKey(const Key('parent-browse-error')), findsOneWidget);
      expect(find.byKey(const Key('parent-browse-empty-week')), findsNothing);

      await tester.tap(find.text('Try again'));
      expect(taps.retries, 1);
    });

    testWidgets('an error replaces the list rather than sitting beside it',
        (tester) async {
      await pumpBrowse(tester, _data(errorMessage: 'Offline'));

      expect(find.byKey(const Key('parent-browse-error')), findsOneWidget);
      expect(find.text('Year 11 Standard Maths'), findsNothing);
    });
  });

  group('interaction', () {
    testWidgets('tapping a class reports it', (tester) async {
      final taps = await pumpBrowse(tester, _data());

      await tester.tap(find.byKey(const Key('parent-browse-class-c2')));
      expect(taps.classes, ['c2']);
    });

    testWidgets('a cancelled class is still tappable, so the reason can be '
        'shown', (tester) async {
      final taps = await pumpBrowse(
        tester,
        _data(
          days: [
            ParentBrowseDay(
              date: DateTime(2026, 7, 15),
              isToday: true,
              classes: [
                _browseClass(
                  availability: ParentBrowseAvailability.cancelled,
                  subtitle: 'This session is cancelled',
                ),
              ],
            ),
          ],
        ),
      );

      await tester.tap(find.byKey(const Key('parent-browse-class-c1')));
      expect(taps.classes, ['c1']);
    });

    testWidgets('the back button pops the surface', (tester) async {
      final taps = await pumpBrowse(tester, _data());

      await tester.tap(find.byKey(const Key('parent-browse-back')));
      expect(taps.back, 1);
    });

    testWidgets('selecting a day reports it', (tester) async {
      final taps = await pumpBrowse(tester, _data());

      await tester.tap(find.text('16'));
      expect(taps.days, [DateTime(2026, 7, 16)]);
    });

    testWidgets('tapping the selected day again clears the filter',
        (tester) async {
      final taps = await pumpBrowse(
        tester,
        _data(selectedDay: DateTime(2026, 7, 16)),
      );

      await tester.tap(find.text('16'));
      expect(taps.days, [null]);
    });

    testWidgets('week arrows are disabled at the ends of the term',
        (tester) async {
      final taps = await pumpBrowse(tester, _data());

      await tester.tap(find.bySemanticsLabel('Previous week'));
      await tester.tap(find.bySemanticsLabel('Next week'));

      expect(taps.previous, 0, reason: 'week 1 cannot page back');
      expect(taps.next, 1);
    });
  });

  group('layout', () {
    for (final entry in _viewports.entries) {
      testWidgets('lays out without overflow at ${entry.key}', (tester) async {
        await pumpBrowse(tester, _data(), size: entry.value);

        expect(tester.takeException(), isNull);
        expect(find.text('Available classes'), findsOneWidget);
        expect(find.text('Year 11 Standard Maths'), findsOneWidget);
      });

      testWidgets('lays out at ${entry.key} with large text', (tester) async {
        await pumpBrowse(
          tester,
          _data(),
          size: entry.value,
          textScale: 1.3,
        );

        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('a long class name is truncated rather than overflowing',
        (tester) async {
      await pumpBrowse(
        tester,
        _data(
          days: [
            ParentBrowseDay(
              date: DateTime(2026, 7, 15),
              isToday: true,
              classes: [
                _browseClass(
                  title: 'Year 12 Mathematics Extension 2 Intensive Revision',
                  spotsRemaining: 12,
                ),
              ],
            ),
          ],
        ),
        size: const Size(320, 640),
      );

      expect(tester.takeException(), isNull);
      expect(find.text('12 SPOTS'), findsOneWidget);
    });
  });
}
