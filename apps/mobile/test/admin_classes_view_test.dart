import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_classes_data.dart';
import 'package:tenacity/src/ui/timetable/admin/admin_classes_view.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the week, the day, its groups and every session',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data())));
    await tester.pump();

    expect(find.text('Classes'), findsOneWidget);
    expect(find.text('Week 1 · 13 – 19 Jul'), findsOneWidget);
    expect(find.text('Term 3 · 14 classes'), findsOneWidget);
    expect(find.text('3 classes · 17 students'), findsOneWidget);

    expect(find.text('4:00 PM'), findsOneWidget);
    expect(find.text('Now'), findsOneWidget);
    expect(find.text('6:00 PM'), findsOneWidget);

    expect(find.text('Jordan Lee · 6/8 seats'), findsOneWidget);
    expect(find.text('RUNNING'), findsOneWidget);
    expect(find.text('NO ROLL'), findsOneWidget);
    expect(find.text('4 SEATS'), findsOneWidget);
  });

  testWidgets('the day strip runs the week and marks days with classes',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data())));
    await tester.pump();

    for (final day in ['13', '14', '15', '16', '17', '18', '19']) {
      expect(find.text(day), findsOneWidget, reason: 'missing $day');
    }
  });

  testWidgets('shows nothing the reference backs with no data', (tester) async {
    // Rooms (one room only) and the cover workflow are both excluded — see
    // §7/§11. Neither the Rooms toggle nor the red "no tutor … Assign" row
    // with its absence reason may appear.
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(_host(_view(data: _data(includeUnassigned: true))));
    await tester.pump();

    expect(find.text('Rooms'), findsNothing);
    expect(find.text('Assign'), findsNothing);
    expect(find.textContaining('Room'), findsNothing);
    expect(find.textContaining('sick'), findsNothing);
    expect(find.textContaining('no tutor'), findsNothing);

    // The unassigned class is still listed, with seats but no tutor name.
    expect(find.text('4/8 seats'), findsOneWidget);
  });

  testWidgets('the grouping toggle reports the chosen grouping',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final chosen = <AdminClassesGrouping>[];
    await tester.pumpWidget(
      _host(_view(data: _data(), onGroupingChanged: chosen.add)),
    );
    await tester.pump();

    await tester.tap(find.text('Tutors'));
    await tester.pump();

    expect(chosen, [AdminClassesGrouping.tutor]);
  });

  testWidgets('tapping a session raises it for the admin options dialog',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final tapped = <String>[];
    await tester.pumpWidget(
      _host(
        _view(
          data: _data(),
          onSessionTapped: (session) => tapped.add(session.classId),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('admin-classes-session-c1')));
    await tester.pump();

    expect(tapped, ['c1']);
  });

  testWidgets('week paging is disabled at the term edges', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    var previous = 0;
    var next = 0;
    await tester.pumpWidget(
      _host(
        _view(
          data: _data(canGoBack: false, canGoForward: true),
          onPreviousWeek: () => previous++,
          onNextWeek: () => next++,
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.bySemanticsLabel('Previous week'));
    await tester.tap(find.bySemanticsLabel('Next week'));
    await tester.pump();

    expect(previous, 0, reason: 'the first week of term cannot page back');
    expect(next, 1);
  });

  testWidgets('selecting a day reports it', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final days = <DateTime>[];
    await tester.pumpWidget(
      _host(_view(data: _data(), onDaySelected: days.add)),
    );
    await tester.pump();

    await tester.tap(find.text('16'));
    await tester.pump();

    expect(days, [DateTime(2026, 7, 16)]);
  });

  testWidgets('re-tapping the day on show does nothing', (tester) async {
    // The strip clears its selection when the selected day is tapped again,
    // which is how parents show a whole week. The admin list is always one
    // day, so there is nothing to clear.
    await _setViewport(tester, const Size(402, 874));

    final days = <DateTime>[];
    await tester.pumpWidget(
      _host(_view(data: _data(), onDaySelected: days.add)),
    );
    await tester.pump();

    await tester.tap(find.text('15'));
    await tester.pump();

    expect(days, isEmpty);
  });

  group('roster', () {
    testWidgets('a row expands to show who is in the session', (tester) async {
      await _setViewport(tester, const Size(402, 874));

      await tester.pumpWidget(_host(_view(data: _data())));
      await tester.pump();

      expect(find.text('Ella Nguyen'), findsNothing);

      await tester.tap(find.byKey(const Key('admin-classes-expand-c1')));
      await tester.pump();

      expect(find.byKey(const Key('admin-classes-roster-c1')), findsOneWidget);
      expect(find.text('Ella Nguyen'), findsOneWidget);
      expect(find.text('Marcus Webb'), findsOneWidget);
    });

    testWidgets('expanding a row does not open its class options',
        (tester) async {
      await _setViewport(tester, const Size(402, 874));

      final tapped = <String>[];
      await tester.pumpWidget(
        _host(
          _view(
            data: _data(),
            onSessionTapped: (session) => tapped.add(session.classId),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byKey(const Key('admin-classes-expand-c1')));
      await tester.pump();

      expect(tapped, isEmpty);
    });

    testWidgets('an expanded row collapses again', (tester) async {
      await _setViewport(tester, const Size(402, 874));

      await tester.pumpWidget(_host(_view(data: _data())));
      await tester.pump();

      await tester.tap(find.byKey(const Key('admin-classes-expand-c1')));
      await tester.pump();
      expect(find.text('Ella Nguyen'), findsOneWidget);

      await tester.tap(find.byKey(const Key('admin-classes-expand-c1')));
      await tester.pump();
      expect(find.text('Ella Nguyen'), findsNothing);
    });

    testWidgets('a session whose names have not loaded says so, and does not '
        'claim the session is empty', (tester) async {
      await _setViewport(tester, const Size(402, 874));

      await tester.pumpWidget(_host(_view(data: _data())));
      await tester.pump();

      // c2 has seven students on its roster but no names resolved.
      await tester.tap(find.byKey(const Key('admin-classes-expand-c2')));
      await tester.pump();

      expect(find.text('Student names are still loading.'), findsOneWidget);
      expect(find.text('Nobody is in this session yet.'), findsNothing);
    });

    testWidgets('an empty session says nobody is in it', (tester) async {
      await _setViewport(tester, const Size(402, 874));

      await tester.pumpWidget(
        _host(
          _view(
            data: _data(
              groups: [
                AdminClassesGroup(
                  label: '4:00 PM',
                  sessions: [
                    _session(
                      id: 'empty',
                      title: 'Year 7 English',
                      tutor: 'Jordan Lee',
                      roster: 0,
                      status: AdminSessionStatus.seats,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.byKey(const Key('admin-classes-expand-empty')));
      await tester.pump();

      expect(find.text('Nobody is in this session yet.'), findsOneWidget);
    });
  });

  testWidgets('an empty day still offers Add a class', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    var added = 0;
    await tester.pumpWidget(
      _host(
        _view(data: _data(groups: const []), onAddClass: () => added++),
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('admin-classes-empty')), findsOneWidget);

    await tester.tap(find.byKey(const Key('admin-classes-add')));
    await tester.pump();
    expect(added, 1);
  });

  testWidgets('an error offers a retry instead of an empty day',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    var retried = 0;
    await tester.pumpWidget(
      _host(
        _view(
          data: _data(groups: const [], error: 'Network unavailable'),
          onRetry: () => retried++,
        ),
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('admin-classes-error')), findsOneWidget);
    expect(find.byKey(const Key('admin-classes-empty')), findsNothing);
    expect(find.byKey(const Key('admin-classes-add')), findsNothing);
  });

  for (final size in const [Size(320, 720), Size(430, 932)]) {
    testWidgets('renders at ${size.width.toInt()} wide', (tester) async {
      await _setViewport(tester, size);

      await tester.pumpWidget(_host(_view(data: _data())));
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('Classes'), findsOneWidget);
    });
  }

  testWidgets('renders at text scale 1.3 on the narrowest width',
      (tester) async {
    await _setViewport(tester, const Size(320, 720));

    await tester.pumpWidget(_host(_view(data: _data()), textScale: 1.3));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Classes'), findsOneWidget);
  });

  testWidgets('an expanded roster of long names fits the narrowest width',
      (tester) async {
    // The roster wraps, so the risk is a single name wider than the row.
    await _setViewport(tester, const Size(320, 720));

    await tester.pumpWidget(
      _host(
        _view(
          data: _data(
            groups: [
              AdminClassesGroup(
                label: '4:00 PM',
                sessions: [
                  _session(
                    id: 'c1',
                    title: 'Year 9 Maths',
                    tutor: 'Jordan Lee',
                    roster: 3,
                    status: AdminSessionStatus.running,
                    students: const [
                      'Konstantinos Papadopoulos-Williamson',
                      'Ella Nguyen',
                      'Marcus Webb',
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
        textScale: 1.3,
      ),
    );
    await tester.pump();

    await tester.tap(find.byKey(const Key('admin-classes-expand-c1')));
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('admin-classes-roster-c1')), findsOneWidget);
  });
}

Future<void> _setViewport(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Widget _host(Widget child, {double textScale = 1.0}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light,
    home: MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
      child: child,
    ),
  );
}

Widget _view({
  required AdminClassesViewData data,
  ValueChanged<AdminClassesGrouping>? onGroupingChanged,
  ValueChanged<AdminSession>? onSessionTapped,
  ValueChanged<DateTime>? onDaySelected,
  VoidCallback? onAddClass,
  VoidCallback? onRetry,
  VoidCallback? onPreviousWeek,
  VoidCallback? onNextWeek,
}) {
  return AdminClassesView(
    data: data,
    onRefresh: () async {},
    onDaySelected: onDaySelected ?? (_) {},
    onGroupingChanged: onGroupingChanged ?? (_) {},
    onSessionTapped: onSessionTapped ?? (_) {},
    onAddClass: onAddClass ?? () {},
    onRetry: onRetry ?? () {},
    onPreviousWeek: onPreviousWeek ?? () {},
    onNextWeek: onNextWeek ?? () {},
  );
}

AdminClassesViewData _data({
  List<AdminClassesGroup>? groups,
  bool includeUnassigned = false,
  bool canGoBack = true,
  bool canGoForward = true,
  String? error,
}) {
  return AdminClassesViewData(
    weekTitle: 'Week 1 · 13 – 19 Jul',
    weekSubtitle: 'Term 3 · 14 classes',
    weekDates: [
      for (var i = 0; i < 7; i++) DateTime(2026, 7, 13).add(Duration(days: i)),
    ],
    daysWithSessions: const {DateTime.wednesday, DateTime.thursday},
    dayLabel: 'Wednesday 15 Jul',
    daySummary: '3 classes · 17 students',
    selectedDate: DateTime(2026, 7, 15),
    grouping: AdminClassesGrouping.time,
    groups: groups ??
        [
          AdminClassesGroup(
            label: '4:00 PM',
            isNow: true,
            sessions: [
              _session(
                id: 'c1',
                title: 'Year 9 Maths',
                tutor: 'Jordan Lee',
                roster: 6,
                status: AdminSessionStatus.running,
                students: const ['Ella Nguyen', 'Marcus Webb'],
              ),
              // Deliberately without names: a roster whose student documents
              // have not resolved must not read as an empty class.
              _session(
                id: 'c2',
                title: 'Year 12 Maths Extension 1',
                tutor: 'Sam Okafor',
                roster: 7,
                status: AdminSessionStatus.noRoll,
              ),
            ],
          ),
          AdminClassesGroup(
            label: '6:00 PM',
            sessions: [
              _session(
                id: 'c3',
                title: 'Year 11 Advanced Maths',
                tutor: includeUnassigned ? '' : 'Priya Shah',
                roster: 4,
                status: AdminSessionStatus.seats,
              ),
            ],
          ),
        ],
    canGoToPreviousWeek: canGoBack,
    canGoToNextWeek: canGoForward,
    errorMessage: error,
  );
}

AdminSession _session({
  required String id,
  required String title,
  required String tutor,
  required int roster,
  required AdminSessionStatus status,
  List<String> students = const [],
}) {
  return AdminSession(
    classId: id,
    sessionId: '${id}_W1',
    startsAt: DateTime(2026, 7, 15, 16),
    endsAt: DateTime(2026, 7, 15, 17),
    timeLabel: '4:00 PM',
    title: title,
    tutorLabel: tutor,
    rosterCount: roster,
    capacity: 8,
    status: status,
    studentNames: students,
  );
}
