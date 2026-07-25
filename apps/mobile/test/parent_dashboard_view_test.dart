import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/parent/parent_dashboard_view.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// The reference viewport the designs were drawn at, plus a narrow phone and a
/// larger one, so overflow shows up in tests rather than on a user's device.
const _viewports = <String, Size>{
  'reference 402x874': Size(402, 874),
  'narrow 320x640': Size(320, 640),
  'large 430x932': Size(430, 932),
};

/// Builds a fully populated dashboard by default.
///
/// The optional sections use explicit `has…` flags rather than nullable
/// overrides, because `override ?? default` would silently restore the default
/// when a test deliberately passes null — which is exactly what the empty-state
/// tests need to express.
ParentDashboardViewData _data({
  int classesThisWeek = 3,
  int unreadMessages = 2,
  double amountDue = 180,
  String amountDueLabel = r'$180',
  String amountDueCaption = 'due Friday',
  List<ParentDashboardSession>? todaysSessions,
  ParentDashboardSession? nextSession,
  bool hasInvoice = true,
  ParentDashboardInvoice? invoice,
  bool hasAnnouncement = true,
  bool hasFeedback = true,
  ParentDashboardFeedback? feedback,
  String parentName = 'Sarah',
}) {
  return ParentDashboardViewData(
    parentName: parentName,
    greeting: 'Good afternoon',
    subtitle: "One class today — here's the detail.",
    classesThisWeek: classesThisWeek,
    unreadMessages: unreadMessages,
    amountDue: amountDue,
    amountDueLabel: amountDueLabel,
    amountDueCaption: amountDueCaption,
    todaysSessions: todaysSessions ??
        [
          ParentDashboardSession(
            classId: 'c1',
            title: 'Year 9 Maths',
            studentsLabel: 'Ella',
            startsAt: DateTime(2026, 7, 15, 16, 30),
            durationLabel: '1 hr',
          ),
        ],
    nextSession: nextSession,
    unpaidInvoice: !hasInvoice
        ? null
        : invoice ??
            ParentDashboardInvoice(
              invoiceId: 'i1',
              reference: 'INV-0231',
              amountDue: 180,
              dueDate: DateTime(2026, 7, 17),
              isOverdue: false,
              studentsLabel: 'Ella & Max',
            ),
    unreadAnnouncement: !hasAnnouncement
        ? null
        : const ParentDashboardAnnouncement(
            id: 'a1',
            title: 'Holiday timetable published',
            ageLabel: 'yesterday',
          ),
    latestFeedback: !hasFeedback
        ? null
        : feedback ??
            const ParentDashboardFeedback(
              studentId: 'ella',
              quote: 'Ella showed great progress with quadratics this week.',
              attribution: 'Jordan Lee · Year 9 Maths',
            ),
  );
}

Future<Taps> pumpDashboard(
  WidgetTester tester,
  ParentDashboardViewData data, {
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
        child: ParentDashboardView(
          data: data,
          onRefresh: () async => taps.refreshes++,
          onOpenClasses: () => taps.classes++,
          onOpenMessages: () => taps.messages++,
          onOpenAnnouncements: () => taps.announcements++,
          onOpenInvoices: () => taps.invoices++,
          onOpenProfile: () => taps.profile++,
          onOpenFeedback: () => taps.feedback++,
        ),
      ),
    ),
  );
  await tester.pump();

  return taps;
}

class Taps {
  int refreshes = 0;
  int classes = 0;
  int messages = 0;
  int announcements = 0;
  int invoices = 0;
  int profile = 0;
  int feedback = 0;
}

void main() {
  group('hierarchy', () {
    testWidgets('renders every section of the reference design',
        (tester) async {
      await pumpDashboard(tester, _data());

      expect(find.text('Good afternoon, Sarah'), findsOneWidget);
      expect(find.text("One class today — here's the detail."), findsOneWidget);

      expect(find.text('classes this week'), findsOneWidget);
      expect(find.text('unread messages'), findsOneWidget);
      expect(find.text(r'$180'), findsOneWidget);
      expect(find.text('due Friday'), findsOneWidget);

      expect(find.text('TODAY'), findsOneWidget);
      expect(find.text('Year 9 Maths'), findsOneWidget);
      expect(find.text('Ella'), findsOneWidget);

      expect(find.text('NEEDS ATTENTION'), findsOneWidget);
      expect(find.text('Invoice INV-0231 due 17 Jul'), findsOneWidget);
      expect(find.text(r'$180.00 · Ella & Max'), findsOneWidget);
      expect(find.text('Holiday timetable published'), findsOneWidget);

      expect(find.text('LATEST FEEDBACK'), findsOneWidget);
      expect(
        find.text('“Ella showed great progress with quadratics this week.”'),
        findsOneWidget,
      );
      expect(find.text('Jordan Lee · Year 9 Maths'), findsOneWidget);

      expect(find.text('QUICK ACTIONS'), findsOneWidget);
      expect(find.text('Book one-off class'), findsOneWidget);
      expect(find.text('Message a tutor'), findsOneWidget);
    });

    testWidgets('lists every one of today\'s classes', (tester) async {
      await pumpDashboard(
        tester,
        _data(
          todaysSessions: [
            ParentDashboardSession(
              classId: 'c1',
              title: 'Year 9 Maths',
              studentsLabel: 'Ella',
              startsAt: DateTime(2026, 7, 15, 16, 30),
              durationLabel: '1 hr',
            ),
            ParentDashboardSession(
              classId: 'c2',
              title: 'Year 5 English',
              studentsLabel: 'Max',
              startsAt: DateTime(2026, 7, 15, 18),
              durationLabel: '1 hr',
            ),
          ],
        ),
      );

      expect(find.text('Year 9 Maths'), findsOneWidget);
      expect(find.text('Year 5 English'), findsOneWidget);
      expect(
          find.byKey(const Key('parent-dashboard-session-1')), findsOneWidget);
    });

    testWidgets('shows an overdue invoice differently', (tester) async {
      await pumpDashboard(
        tester,
        _data(
          invoice: ParentDashboardInvoice(
            invoiceId: 'i1',
            reference: 'INV-0219',
            amountDue: 320,
            dueDate: DateTime(2026, 7, 3),
            isOverdue: true,
            studentsLabel: 'Ella',
          ),
        ),
      );

      expect(find.text('Invoice INV-0219 is overdue'), findsOneWidget);
    });
  });

  group('actions', () {
    testWidgets('each metric and control reaches its destination',
        (tester) async {
      final taps = await pumpDashboard(tester, _data());

      await tester.tap(find.byKey(const Key('parent-dashboard-classes-stat')));
      await tester.tap(find.byKey(const Key('parent-dashboard-messages-stat')));
      await tester.tap(find.byKey(const Key('parent-dashboard-due-stat')));
      await tester.tap(find.byKey(const Key('parent-dashboard-profile')));
      await tester.pump();

      expect(taps.classes, 1);
      expect(taps.messages, 1);
      expect(taps.invoices, 1);
      expect(taps.profile, 1);
    });

    testWidgets('the Pay action opens invoices', (tester) async {
      final taps = await pumpDashboard(tester, _data());

      await tester.tap(find.text('Pay'));
      await tester.pump();

      expect(taps.invoices, 1);
    });

    testWidgets('the announcement row opens announcements', (tester) async {
      final taps = await pumpDashboard(tester, _data());

      await tester.tap(find.text('Holiday timetable published'));
      await tester.pump();

      expect(taps.announcements, 1);
    });

    testWidgets('the feedback quote opens that student\'s feedback',
        (tester) async {
      final taps = await pumpDashboard(tester, _data());

      await tester.tap(find.byKey(const Key('parent-dashboard-feedback')));
      await tester.pump();

      expect(taps.feedback, 1);
    });

    testWidgets('quick actions are wired', (tester) async {
      final taps = await pumpDashboard(tester, _data());

      await tester.ensureVisible(
        find.byKey(const Key('parent-dashboard-book-one-off')),
      );
      await tester.tap(find.byKey(const Key('parent-dashboard-book-one-off')));
      await tester.tap(find.byKey(const Key('parent-dashboard-message-tutor')));
      await tester.pump();

      expect(taps.classes, 1);
      expect(taps.messages, 1);
    });
  });

  group('empty states', () {
    testWidgets('a family with nothing on still gets a usable screen',
        (tester) async {
      await pumpDashboard(
        tester,
        _data(
          classesThisWeek: 0,
          unreadMessages: 0,
          amountDue: 0,
          amountDueLabel: r'$0',
          amountDueCaption: 'nothing due',
          todaysSessions: const [],
          hasInvoice: false,
          hasAnnouncement: false,
          hasFeedback: false,
        ),
      );

      expect(find.text('NEXT CLASS'), findsOneWidget);
      expect(find.text('No upcoming classes'), findsOneWidget);
      expect(find.text('nothing due'), findsOneWidget);

      // Sections with nothing to show are omitted, not rendered empty.
      expect(find.text('NEEDS ATTENTION'), findsNothing);
      expect(find.text('LATEST FEEDBACK'), findsNothing);

      // Quick actions always remain.
      expect(find.text('QUICK ACTIONS'), findsOneWidget);
    });

    testWidgets('with nothing today it leads with the next class',
        (tester) async {
      await pumpDashboard(
        tester,
        _data(
          todaysSessions: const [],
          nextSession: ParentDashboardSession(
            classId: 'c9',
            title: 'Year 9 Maths',
            studentsLabel: 'Ella',
            startsAt: DateTime(2026, 7, 18, 10),
            durationLabel: '1 hr',
          ),
        ),
      );

      expect(find.text('NEXT CLASS'), findsOneWidget);
      expect(find.text('TODAY'), findsNothing);
      expect(find.text('Year 9 Maths'), findsOneWidget);
    });

    testWidgets('an invoice with no attributable students still renders',
        (tester) async {
      await pumpDashboard(
        tester,
        _data(
          invoice: ParentDashboardInvoice(
            invoiceId: 'i1',
            reference: 'INV-0231',
            amountDue: 180,
            dueDate: DateTime(2026, 7, 17),
            isOverdue: false,
            studentsLabel: '',
          ),
        ),
      );

      expect(find.text(r'$180.00'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('responsiveness', () {
    for (final entry in _viewports.entries) {
      testWidgets('renders without overflow at ${entry.key}', (tester) async {
        await pumpDashboard(tester, _data(), size: entry.value);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('survives a long name and a long feedback quote',
        (tester) async {
      await pumpDashboard(
        tester,
        _data(
          parentName: 'Bartholomew Fitzgerald-Montgomery',
          feedback: const ParentDashboardFeedback(
            studentId: 'ella',
            quote: 'Ella has made really substantial progress with quadratic '
                'factorising this term and is now confident enough to attempt '
                'the extension sheet without help, which is a big step.',
            attribution: 'Jordan Lee · Year 9 Mathematics Advanced',
          ),
        ),
        size: const Size(320, 640),
      );

      expect(tester.takeException(), isNull);
    });

    testWidgets('survives accessibility text scaling', (tester) async {
      await pumpDashboard(tester, _data(), textScale: 1.3);
      expect(tester.takeException(), isNull);
    });
  });

  group('refresh', () {
    testWidgets('pulling down reloads', (tester) async {
      final taps = await pumpDashboard(tester, _data());

      await tester.fling(
        find.byKey(const Key('parent-dashboard-scroll')),
        const Offset(0, 300),
        1000,
      );
      await tester.pumpAndSettle();

      expect(taps.refreshes, 1);
    });
  });
}
