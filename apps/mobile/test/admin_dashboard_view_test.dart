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
          onOpenClass: (_) => count('open-class'),
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
          onOpenClass: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.textContaining('Cover needed'), findsNothing);
    expect(find.text('Assign'), findsNothing);
    expect(find.text('Approve'), findsNothing);

    // The one-off row is present, but purely as information.
    expect(find.text('2 one-off bookings this week'), findsOneWidget);
    expect(find.text('Already booked · no action needed'), findsOneWidget);
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
          onOpenClass: (_) {},
        ),
      ),
    );
    await tester.pump();

    expect(find.text('ROLL 5/6'), findsOneWidget);
    expect(find.text('NO ROLL'), findsOneWidget);
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
            oneOffBookings: 0,
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
          onOpenClass: (_) {},
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
            onOpenClass: (_) {},
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
          onOpenClass: (_) {},
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
  int oneOffBookings = 2,
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
          title: 'Year 9 Maths',
          tutorLabel: 'Jordan',
          startsAt: DateTime(2026, 7, 15, 16, 0),
          endsAt: DateTime(2026, 7, 15, 17, 0),
          presentCount: 5,
          rosterCount: 6,
          rollComplete: true,
        ),
        AdminDashboardSession(
          classId: 'c2',
          title: 'Year 12 Maths Extension 1',
          tutorLabel: 'Sam',
          startsAt: DateTime(2026, 7, 15, 16, 0),
          endsAt: DateTime(2026, 7, 15, 17, 0),
          presentCount: 0,
          rosterCount: 7,
          rollComplete: false,
        ),
      ];

  return AdminDashboardViewData(
    adminName: 'Tom',
    greeting: 'Good afternoon',
    subtitle: subtitle,
    classesToday: classesToday,
    needsActionCount: 3,
    outstandingAmount: 1860,
    outstandingLabel: r'$1,860',
    happeningNow: sessions,
    happeningNowLabel: sessions.isEmpty ? 'TODAY' : 'HAPPENING NOW · 4:30',
    todaysSessions: todaysSessions ?? sessions,
    outstandingRolls: outstandingRolls ??
        const [
          AdminDashboardRollAlert(
            classId: 'c3',
            title: 'Roll not marked — Year 7 Maths',
            subtitle: 'Yesterday · 4:00 · Priya',
          ),
        ],
    oneOffBookingsThisWeek: oneOffBookings,
    overdueInvoices: overdue,
  );
}
