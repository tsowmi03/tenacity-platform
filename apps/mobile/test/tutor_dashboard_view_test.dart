import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_data.dart';
import 'package:tenacity/src/ui/dashboard/tutor_dashboard_view.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  testWidgets('renders the proposed tutor dashboard hierarchy and actions',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var classesTaps = 0;
    var messagesTaps = 0;
    var announcementsTaps = 0;
    var profileTaps = 0;

    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        home: TutorDashboardView(
          data: TutorDashboardViewData(
            tutorName: 'Jordan',
            greeting: 'Good afternoon',
            classesToday: 3,
            rollsToMark: 2,
            unreadMessages: 4,
            nextClass: TutorDashboardSession(
              classId: 'class-1',
              title: 'Year 9 Maths',
              startsAt: DateTime(2026, 7, 15, 16, 30),
              durationLabel: '1 hr',
              studentCount: 6,
            ),
            attentionItems: const [
              TutorDashboardAttentionItem(
                classId: 'class-2',
                title: 'Roll not marked — Tue Year 7 Maths',
                subtitle: 'Yesterday · 5 students',
              ),
            ],
            latestAnnouncement: const TutorDashboardAnnouncement(
              title: 'Term 3 pupil-free day — Fri 25 Jul',
              body: 'No classes Friday. Timesheets are due Thursday.',
              ageLabel: 'yesterday',
              audienceLabel: 'STAFF',
            ),
          ),
          onRefresh: () async {},
          onOpenClasses: () => classesTaps++,
          onOpenMessages: () => messagesTaps++,
          onOpenAnnouncements: () => announcementsTaps++,
          onOpenProfile: () => profileTaps++,
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Good afternoon, Jordan'), findsOneWidget);
    expect(find.text('3 classes today.'), findsOneWidget);
    expect(find.text('NEXT CLASS'), findsOneWidget);
    expect(find.text('Year 9 Maths'), findsOneWidget);
    expect(find.text('NEEDS ATTENTION'), findsOneWidget);
    expect(find.text('Term 3 pupil-free day — Fri 25 Jul'), findsOneWidget);

    await tester.tap(find.byKey(const Key('tutor-dashboard-classes-stat')));
    await tester.tap(find.byKey(const Key('tutor-dashboard-messages-stat')));
    await tester.tap(find.byKey(const Key('tutor-dashboard-profile')));
    await tester.tap(find.byKey(const Key('tutor-dashboard-announcement')));
    await tester.pump();

    expect(classesTaps, 1);
    expect(messagesTaps, 1);
    expect(profileTaps, 1);
    expect(announcementsTaps, 1);

    await tester.scrollUntilVisible(
      find.byKey(const Key('tutor-dashboard-mark-attendance')),
      120,
      scrollable: find.byType(Scrollable),
    );
    await tester.tap(
      find.byKey(const Key('tutor-dashboard-mark-attendance')),
    );
    expect(classesTaps, 2);
  });

  testWidgets('renders useful empty dashboard states', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: TutorDashboardView(
          data: const TutorDashboardViewData(
            tutorName: 'Jordan',
            greeting: 'Good morning',
            classesToday: 0,
            rollsToMark: 0,
            unreadMessages: 0,
            nextClass: null,
            attentionItems: [],
            latestAnnouncement: null,
          ),
          onRefresh: () async {},
          onOpenClasses: () {},
          onOpenMessages: () {},
          onOpenAnnouncements: () {},
          onOpenProfile: () {},
        ),
      ),
    );
    await tester.pump();

    expect(find.text('No upcoming classes'), findsOneWidget);
    expect(find.text('No current announcements'), findsOneWidget);
    expect(find.text('NEEDS ATTENTION'), findsNothing);
  });
}
