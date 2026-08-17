import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/admin/admin_dashboard_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the admin console hierarchy and actions',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final taps = <String, int>{};
    void count(String name) => taps[name] = (taps[name] ?? 0) + 1;

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(),
          onRefresh: () async {},
          onOpenClasses: () => count('classes'),
          onOpenInvoices: () => count('invoices'),
          onOpenUsers: () => count('users'),
          onOpenProfile: () => count('profile'),
          onAddClass: () => count('add-class'),
          onCreateInvoice: () => count('create-invoice'),
          onNewEnrol: () => count('new-enrol'),
          onOpenRoll: (_, __) => count('open-roll'),
          onOpenDay: (_) => count('open-day'),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Good afternoon, Tom'), findsOneWidget);
    expect(
      find.text('Wednesday — 4 classes, 22 students expected.'),
      findsOneWidget,
    );
    expect(find.text('NEEDS ACTION'), findsOneWidget);
    expect(find.text('HAPPENING NOW · 4:30'), findsOneWidget);
    expect(find.text('QUICK ACTIONS'), findsOneWidget);

    expect(find.text('2 invoices overdue'), findsOneWidget);
    expect(find.text('Oldest 12 days · \$200.00 total'), findsOneWidget);

    await tester.tap(find.byKey(const Key('admin-dashboard-create-invoice')));
    await tester.tap(find.byKey(const Key('admin-dashboard-add-class')));
    await tester.tap(find.byKey(const Key('admin-dashboard-new-enrol')));
    await tester.tap(find.byKey(const Key('admin-dashboard-profile')));
    await tester.pump();

    expect(taps['create-invoice'], 1);
    expect(taps['add-class'], 1);
    expect(taps['new-enrol'], 1);
    expect(taps['profile'], 1);
  });

  testWidgets('shows no cover row and no approve action', (tester) async {
    // Both appear in the reference design and are deliberately excluded: no
    // cover workflow exists, and a one-off booking has nothing to approve.
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.textContaining('Cover needed'), findsNothing);
    expect(find.text('Assign'), findsNothing);
    expect(find.text('Approve'), findsNothing);

    // The one-off row is present, but under its own heading rather than
    // beneath NEEDS ACTION carrying the subtitle `no action needed`.
    expect(find.text('FOR INFORMATION'), findsOneWidget);
    expect(find.text('2 one-off bookings this week'), findsOneWidget);
    expect(find.text('Already booked · no action needed'), findsNothing);
  });

  testWidgets('the one-off row names who booked and into what', (tester) async {
    // It used to open the Classes tab, leaving the admin to work out who had
    // booked and where from the timetable.
    await _setViewport(tester, const Size(402, 874));

    var classesTaps = 0;
    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(
            oneOffBookings: const [
              _booking,
              AdminDashboardOneOffBooking(
                studentId: 's4',
                studentName: 'Max Turner',
                classId: 'c2',
                className: 'Year 12 Maths Extension 1',
                dayLabel: 'Tomorrow',
                timeLabel: '5:00',
              ),
            ],
          ),
          onRefresh: () async {},
          onOpenClasses: () => classesTaps++,
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.text('2 one-off bookings this week'));
    await tester.pumpAndSettle();

    expect(find.text('Ella Nguyen'), findsOneWidget);
    expect(find.text('Max Turner'), findsOneWidget);
    expect(find.text('Year 9 Maths · Today'), findsOneWidget);
    expect(find.text('Year 12 Maths Extension 1 · Tomorrow'), findsOneWidget);
    // It opens the detail rather than dumping the admin on the timetable.
    expect(classesTaps, 0);
  });

  testWidgets('an outstanding roll opens the day it ran, not the timetable',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    final days = <DateTime>[];
    var classesTaps = 0;
    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(
            outstandingRolls: [
              AdminDashboardRollAlert(
                classId: 'c7',
                startsAt: DateTime(2026, 7, 14, 16),
                title: 'Roll not marked — Year 7 Maths',
                subtitle: 'Yesterday · 4:00 · Priya',
              ),
            ],
          ),
          onRefresh: () async {},
          onOpenClasses: () => classesTaps++,
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: days.add,
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.text('Open'));
    await tester.pump();

    expect(days, [DateTime(2026, 7, 14, 16)]);
    // Not a bare switch to the Classes tab.
    expect(classesTaps, 0);
  });

  testWidgets('a failed check is shown rather than read as an all-clear',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    var refreshes = 0;
    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(
            outstandingRolls: const [],
            rollTotal: 0,
            oneOffBookings: const [],
            overdue: null,
            needsActionCount: 2,
            billingUnavailable: true,
            rollsUnavailable: true,
          ),
          onRefresh: () async => refreshes++,
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.text("Couldn't check rolls"), findsOneWidget);
    expect(find.text("Couldn't check billing"), findsOneWidget);

    await tester.tap(find.text("Couldn't check billing"));
    await tester.pump();
    expect(refreshes, 1);
  });

  testWidgets('an unconfirmed roll shows NO ROLL rather than a fraction',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.text('ROLL 5/6'), findsOneWidget);
    expect(find.text('NO ROLL'), findsOneWidget);
  });

  testWidgets('the assigned tutor stays visible on a long class name',
      (tester) async {
    // Found on device: the tutor was appended to the title as
    // "<class> · <tutor>", but a real class name plus the roll pill already
    // fills a 402pt row, so the tutor fell past the ellipsis and was never
    // visible. It belongs on the subtitle, which room would have occupied had
    // room not been excluded.
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Jordan · 6 students'), findsOneWidget);
    expect(find.text('Sam · 7 students'), findsOneWidget);
  });

  testWidgets('a session with nobody assigned still reads correctly',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(
            happeningNow: [
              AdminDashboardSession(
                classId: 'c1',
                attendanceDocId: '2026_T3_W1',
                title: 'Year 9 Maths',
                tutorLabel: '',
                startsAt: DateTime(2026, 7, 15, 16, 0),
                endsAt: DateTime(2026, 7, 15, 17, 0),
                presentCount: 0,
                rosterCount: 1,
                rollStarted: false,
                rollComplete: false,
                rollOutstanding: false,
              ),
            ],
          ),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    // No leading separator where the tutor name would have been.
    expect(find.text('1 student'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('says how many outstanding rolls are not listed', (tester) async {
    // Found on real admin data: the metric read "8 need action" while the list
    // showed three rows, with the other five unreachable from the dashboard.
    await _setViewport(tester, const Size(402, 874));

    var classesTaps = 0;
    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(rollTotal: 8),
          onRefresh: () async {},
          onOpenClasses: () => classesTaps++,
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.text('7 more rolls outstanding'), findsOneWidget);

    await tester.tap(find.text('7 more rolls outstanding'));
    await tester.pump();
    expect(classesTaps, 1);
  });

  testWidgets('says nothing about overflow when everything is listed',
      (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(rollTotal: 1),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.textContaining('more rolls outstanding'), findsNothing);
  });

  testWidgets('an empty day still renders', (tester) async {
    await _setViewport(tester, const Size(402, 874));

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(
            classesToday: 0,
            subtitle: 'Wednesday — no classes scheduled.',
            happeningNow: const [],
            todaysSessions: const [],
            outstandingRolls: const [],
            oneOffBookings: const [],
            needsActionCount: 0,
            overdue: null,
          ),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.text('NEEDS ACTION'), findsNothing);
    expect(find.byKey(const Key('admin-dashboard-no-classes')), findsOneWidget);
    expect(find.text('QUICK ACTIONS'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final size in const [Size(320, 720), Size(430, 932)]) {
    testWidgets('renders at ${size.width.toInt()} wide', (tester) async {
      await _setViewport(tester, size);

      await tester.pumpWidget(
        _host(
          AdminDashboardView(
            data: _data(),
            onRefresh: () async {},
            onOpenClasses: () {},
            onOpenInvoices: () {},
            onOpenUsers: () {},
            onOpenProfile: () {},
            onAddClass: () {},
            onCreateInvoice: () {},
            onNewEnrol: () {},
            onOpenRoll: (_, __) {},
            onOpenDay: (_) {},
          ),
        ),
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.text('QUICK ACTIONS'), findsOneWidget);
    });
  }

  testWidgets('renders the three quick actions at text scale 1.3',
      (tester) async {
    await _setViewport(tester, const Size(320, 720));

    await tester.pumpWidget(
      _host(
        AdminDashboardView(
          data: _data(),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenInvoices: () {},
          onOpenUsers: () {},
          onOpenProfile: () {},
          onAddClass: () {},
          onCreateInvoice: () {},
          onNewEnrol: () {},
          onOpenRoll: (_, __) {},
          onOpenDay: (_) {},
        ),
        textScale: 1.3,
      ),
    );
    await tester.pump();

    // The narrowest supported width at the largest tested scale pushes the
    // grid below the fold, so scroll to it rather than asserting on a widget
    // the lazy scroll view has not built.
    await tester.dragUntilVisible(
      find.byKey(const Key('admin-dashboard-add-class')),
      find.byKey(const Key('admin-dashboard-scroll')),
      const Offset(0, -120),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('admin-dashboard-add-class')), findsOneWidget);
    expect(
      find.byKey(const Key('admin-dashboard-create-invoice')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('admin-dashboard-new-enrol')), findsOneWidget);
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

AdminDashboardViewData _data({
  int classesToday = 4,
  String subtitle = 'Wednesday — 4 classes, 22 students expected.',
  List<AdminDashboardSession>? happeningNow,
  List<AdminDashboardSession>? todaysSessions,
  List<AdminDashboardRollAlert>? outstandingRolls,
  List<AdminDashboardOneOffBooking>? oneOffBookings,
  int rollTotal = 1,
  int needsActionCount = 3,
  bool billingUnavailable = false,
  bool rollsUnavailable = false,
  AdminDashboardOverdue? overdue = const AdminDashboardOverdue(
    count: 2,
    totalAmount: 200,
    oldestDays: 12,
  ),
}) {
  final sessions = happeningNow ??
      [
        AdminDashboardSession(
          classId: 'c1',
          attendanceDocId: '2026_T3_W1',
          title: 'Year 9 Maths',
          tutorLabel: 'Jordan',
          startsAt: DateTime(2026, 7, 15, 16, 0),
          endsAt: DateTime(2026, 7, 15, 17, 0),
          presentCount: 5,
          rosterCount: 6,
          rollStarted: true,
          rollComplete: true,
          rollOutstanding: false,
        ),
        AdminDashboardSession(
          classId: 'c2',
          attendanceDocId: '2026_T3_W1',
          title: 'Year 12 Maths Extension 1',
          tutorLabel: 'Sam',
          startsAt: DateTime(2026, 7, 15, 16, 0),
          endsAt: DateTime(2026, 7, 15, 17, 0),
          presentCount: 0,
          rosterCount: 7,
          rollStarted: false,
          rollComplete: false,
          rollOutstanding: false,
        ),
      ];

  return AdminDashboardViewData(
    adminName: 'Tom',
    greeting: 'Good afternoon',
    subtitle: subtitle,
    classesToday: classesToday,
    needsActionCount: needsActionCount,
    outstandingAmount: 1860,
    outstandingLabel: r'$1,860',
    happeningNow: sessions,
    happeningNowLabel: sessions.isEmpty ? 'TODAY' : 'HAPPENING NOW · 4:30',
    todaysSessions: todaysSessions ?? sessions,
    outstandingRollTotal: rollTotal,
    outstandingRolls: outstandingRolls ??
        [
          AdminDashboardRollAlert(
            classId: 'c3',
            startsAt: DateTime(2026, 7, 14, 16),
            title: 'Roll not marked — Year 7 Maths',
            subtitle: 'Yesterday · 4:00 · Priya',
          ),
        ],
    oneOffBookings: oneOffBookings ?? const [_booking, _booking],
    overdueInvoices: overdue,
    billingUnavailable: billingUnavailable,
    rollsUnavailable: rollsUnavailable,
  );
}

const _booking = AdminDashboardOneOffBooking(
  studentId: 's9',
  studentName: 'Ella Nguyen',
  classId: 'c1',
  className: 'Year 9 Maths',
  dayLabel: 'Today',
  timeLabel: '4:00',
);
