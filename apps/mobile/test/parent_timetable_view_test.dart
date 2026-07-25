import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_timetable_data.dart';
import 'package:tenacity/src/ui/timetable/parent/parent_timetable_view.dart';

const _viewports = <String, Size>{
  'reference 402x874': Size(402, 874),
  'narrow 320x640': Size(320, 640),
  'large 430x932': Size(430, 932),
};

ParentTimetableSession _session({
  String classId = 'c1',
  String time = '4:30',
  String title = 'Year 9 Maths',
  String subtitle = 'Ella · Jordan Lee',
  ParentSessionKind kind = ParentSessionKind.confirmed,
  int day = 15,
}) {
  return ParentTimetableSession(
    classId: classId,
    startsAt: DateTime(2026, 7, day, 16, 30),
    time: time,
    durationLabel: '1 hr',
    title: title,
    subtitle: subtitle,
    kind: kind,
    childIds: const ['ella'],
  );
}

/// A populated week by default. Optional sections use explicit flags rather
/// than nullable overrides so a test can express "nothing here".
ParentTimetableViewData _data({
  List<String> filterLabels = const ['All', 'Ella', 'Max'],
  int selectedFilterIndex = 0,
  List<ParentTimetableDay>? days,
  DateTime? selectedDay,
  bool canGoToPreviousWeek = false,
  bool canGoToNextWeek = true,
  String weekTitle = 'Week 1 · 13 – 19 Jul',
  String weekSubtitle = 'Term 3 · 3 classes',
  bool withWeekDates = true,
}) {
  return ParentTimetableViewData(
    filterLabels: filterLabels,
    selectedFilterIndex: selectedFilterIndex,
    weekTitle: weekTitle,
    weekSubtitle: weekSubtitle,
    weekDates: withWeekDates
        ? [for (var i = 13; i <= 19; i++) DateTime(2026, 7, i)]
        : const [],
    daysWithSessions: const {DateTime.wednesday, DateTime.saturday},
    selectedDay: selectedDay,
    days: days ??
        [
          ParentTimetableDay(
            date: DateTime(2026, 7, 15),
            isToday: true,
            sessions: [_session()],
          ),
          ParentTimetableDay(
            date: DateTime(2026, 7, 18),
            isToday: false,
            sessions: [
              _session(
                classId: 'c2',
                time: '10:00',
                kind: ParentSessionKind.oneOff,
                day: 18,
              ),
            ],
          ),
        ],
    canGoToPreviousWeek: canGoToPreviousWeek,
    canGoToNextWeek: canGoToNextWeek,
  );
}

class Taps {
  int refreshes = 0;
  int previous = 0;
  int next = 0;
  int bookOneOff = 0;
  final filters = <int>[];
  final days = <DateTime?>[];
  final sessions = <String>[];
}

Future<Taps> pumpTimetable(
  WidgetTester tester,
  ParentTimetableViewData data, {
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
        child: ParentTimetableView(
          data: data,
          onRefresh: () async => taps.refreshes++,
          onFilterSelected: taps.filters.add,
          onDaySelected: taps.days.add,
          onPreviousWeek: () => taps.previous++,
          onNextWeek: () => taps.next++,
          onSessionTapped: (s) => taps.sessions.add(s.classId),
          onBookOneOff: () => taps.bookOneOff++,
        ),
      ),
    ),
  );
  await tester.pump();

  return taps;
}

void main() {
  group('hierarchy', () {
    testWidgets('renders the week, days and sessions', (tester) async {
      await pumpTimetable(tester, _data());

      expect(find.text('Timetable'), findsOneWidget);
      expect(find.text('Week 1 · 13 – 19 Jul'), findsOneWidget);
      expect(find.text('Term 3 · 3 classes'), findsOneWidget);

      expect(find.text('WEDNESDAY 15'), findsOneWidget);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('SATURDAY 18'), findsOneWidget);

      expect(find.text('Year 9 Maths'), findsNWidgets(2));
      expect(find.text('CONFIRMED'), findsOneWidget);
      expect(find.text('ONE-OFF'), findsOneWidget);

      expect(find.text('Book a one-off class'), findsOneWidget);
    });

    testWidgets('renders every day of the week strip', (tester) async {
      await pumpTimetable(tester, _data());

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
      await pumpTimetable(
        tester,
        _data(
          days: [
            ParentTimetableDay(
              date: DateTime(2026, 7, 18),
              isToday: false,
              sessions: [_session(day: 18)],
            ),
          ],
        ),
      );

      expect(find.text('Today'), findsNothing);
    });

    testWidgets('shows a cancelled session rather than hiding it',
        (tester) async {
      await pumpTimetable(
        tester,
        _data(
          days: [
            ParentTimetableDay(
              date: DateTime(2026, 7, 15),
              isToday: true,
              sessions: [_session(kind: ParentSessionKind.cancelled)],
            ),
          ],
        ),
      );

      expect(find.text('CANCELLED'), findsOneWidget);
      expect(find.text('Year 9 Maths'), findsOneWidget);
    });
  });

  group('filter visibility', () {
    testWidgets('a family with two or more children gets the filter',
        (tester) async {
      await pumpTimetable(tester, _data());
      expect(find.byKey(const Key('parent-timetable-filter')), findsOneWidget);
    });

    testWidgets('a one-child family does not', (tester) async {
      // "All / Ella" is a choice with no meaning.
      await pumpTimetable(
        tester,
        _data(filterLabels: const ['All', 'Ella']),
      );
      expect(find.byKey(const Key('parent-timetable-filter')), findsNothing);
    });
  });

  group('actions', () {
    testWidgets('tapping a session reports which one', (tester) async {
      final taps = await pumpTimetable(tester, _data());

      await tester.tap(find.byKey(const Key('parent-timetable-session-c2')));
      await tester.pump();

      expect(taps.sessions, ['c2']);
    });

    testWidgets('week arrows page, and are disabled at the term edge',
        (tester) async {
      final taps = await pumpTimetable(tester, _data());

      await tester.tap(find.bySemanticsLabel('Next week'));
      await tester.pump();
      expect(taps.next, 1);

      // Week 1 cannot go back, so the arrow does nothing.
      await tester.tap(find.bySemanticsLabel('Previous week'));
      await tester.pump();
      expect(taps.previous, 0);
    });

    testWidgets('selecting a day reports it, and reselecting clears it',
        (tester) async {
      final taps = await pumpTimetable(tester, _data());

      await tester.tap(find.text('15'));
      await tester.pump();
      expect(taps.days.single, DateTime(2026, 7, 15));

      await pumpTimetable(tester, _data(selectedDay: DateTime(2026, 7, 15)));
      final second = await pumpTimetable(
        tester,
        _data(selectedDay: DateTime(2026, 7, 15)),
      );
      await tester.tap(find.text('15'));
      await tester.pump();
      expect(second.days.single, isNull);
    });

    testWidgets('the filter reports the chosen segment', (tester) async {
      final taps = await pumpTimetable(tester, _data());

      await tester.tap(find.text('Max'));
      await tester.pump();

      expect(taps.filters, [2]);
    });

    testWidgets('the dashed button books a one-off', (tester) async {
      final taps = await pumpTimetable(tester, _data());

      await tester.ensureVisible(
        find.byKey(const Key('parent-timetable-book-one-off')),
      );
      await tester.tap(find.byKey(const Key('parent-timetable-book-one-off')));
      await tester.pump();

      expect(taps.bookOneOff, 1);
    });
  });

  group('empty states', () {
    testWidgets('an empty week explains itself and still offers booking',
        (tester) async {
      await pumpTimetable(tester, _data(days: const []));

      expect(find.text('No classes this week'), findsOneWidget);
      expect(find.text('Book a one-off class'), findsOneWidget);
    });

    testWidgets('an empty day offers a way back to the whole week',
        (tester) async {
      final taps = await pumpTimetable(
        tester,
        _data(days: const [], selectedDay: DateTime(2026, 7, 14)),
      );

      expect(find.text('Nothing on this day'), findsOneWidget);
      await tester.tap(find.text('Show the whole week'));
      await tester.pump();
      expect(taps.days.single, isNull);
    });

    testWidgets('between terms it hides the week strip', (tester) async {
      await pumpTimetable(
        tester,
        _data(
          days: const [],
          withWeekDates: false,
          weekTitle: 'No active term',
          weekSubtitle: 'Classes appear here once a term starts',
        ),
      );

      expect(find.text('No active term'), findsOneWidget);
      expect(find.text('MON'), findsNothing);
    });
  });

  group('responsiveness', () {
    for (final entry in _viewports.entries) {
      testWidgets('renders without overflow at ${entry.key}', (tester) async {
        await pumpTimetable(tester, _data(), size: entry.value);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('survives accessibility text scaling', (tester) async {
      await pumpTimetable(tester, _data(), textScale: 1.3);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a large family does not overflow the filter', (tester) async {
      await pumpTimetable(
        tester,
        _data(
          filterLabels: const [
            'All',
            'Ella',
            'Max',
            'Sofia',
            'Marcus',
            'Aisha',
          ],
        ),
        size: const Size(320, 640),
      );

      expect(tester.takeException(), isNull);
    });
  });
}
