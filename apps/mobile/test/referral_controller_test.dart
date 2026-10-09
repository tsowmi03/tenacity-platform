import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/controllers/referral_controller.dart';
import 'package:tenacity/src/helpers/referral_prompt_policy.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/services/referral_service.dart';

class _FakeReferralService extends ReferralService {
  _FakeReferralService({this.fail = false});

  final bool fail;
  int calls = 0;

  @override
  Future<String> linkFor(String uid) async {
    calls++;
    if (fail) throw Exception('functions unavailable');
    return 'https://tenacitytutoring.com/r/ABC234';
  }
}

AppUser _user({String uid = 'p1', String role = 'parent'}) => Parent(
      uid: uid,
      firstName: 'Pat',
      lastName: 'Parent',
      role: role,
      email: '$uid@example.com',
      fcmTokens: const [],
      students: const [],
      phone: '0400',
      unreadChats: const {},
      activeChats: const [],
    );

StudentFeedback _note(String id, DateTime createdAt) => StudentFeedback(
      id: id,
      studentId: 's1',
      tutorId: 't1',
      parentIds: const ['p1'],
      feedback: 'Good work',
      subject: 'Maths',
      createdAt: createdAt,
      isUnread: true,
      progress: StudentProgress.onTrack,
    );

class _Harness {
  _Harness({
    bool overdue = false,
    bool enabled = true,
    bool failLink = false,
    String role = 'parent',
  }) : service = _FakeReferralService(fail: failLink) {
    controller = ReferralController(
      service: service,
      store: ReferralPromptStore(),
      navigatorKey: navigatorKey,
      isEnabled: () => enabled,
      hasOverdueInvoice: (_) async => overdue,
      clock: () => now,
      shareSheet: (text, origin) async => shared.add(text),
    )..update(user: _user(role: role), isOnline: true);
  }

  final navigatorKey = GlobalKey<NavigatorState>();
  final _FakeReferralService service;
  late final ReferralController controller;
  final shared = <String>[];
  DateTime now = DateTime(2026, 10, 9, 18);

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: navigatorKey,
        home: const Scaffold(body: SizedBox.shrink()),
      ),
    );
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('a trigger shows the sheet, and Share shares the parent\'s link',
      (tester) async {
    final h = _Harness();
    await h.pump(tester);

    final pending = h.controller.trigger(ReferralTrigger.invoicePaid);
    await tester.pumpAndSettle();
    expect(find.text("Know a family who'd love Tenacity?"), findsOneWidget);

    await tester.tap(find.byKey(const Key('referral-sheet-share')));
    await tester.pumpAndSettle();
    expect(await pending, ReferralGateResult.show);

    expect(h.shared, hasLength(1));
    expect(h.shared.single, contains('https://tenacitytutoring.com/r/ABC234'));
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('referral.p1.lastShownDay'), '2026-10-09');
  });

  testWidgets('Not now closes the sheet without fetching the link',
      (tester) async {
    final h = _Harness();
    await h.pump(tester);

    final pending = h.controller.trigger(ReferralTrigger.oneOffPaid);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('referral-sheet-not-now')));
    await tester.pumpAndSettle();
    await pending;

    expect(find.text("Know a family who'd love Tenacity?"), findsNothing);
    expect(h.service.calls, 0);
    expect(h.shared, isEmpty);
  });

  testWidgets('only one prompt a session, and none again the same day',
      (tester) async {
    final h = _Harness();
    await h.pump(tester);

    final first = h.controller.trigger(ReferralTrigger.invoicePaid);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('referral-sheet-not-now')));
    await tester.pumpAndSettle();
    await first;

    expect(
      await h.controller.trigger(ReferralTrigger.oneOffTokens),
      ReferralGateResult.alreadyShownThisSession,
    );

    // A new session the same day is still blocked by the daily limit.
    h.controller.didChangeAppLifecycleState(AppLifecycleState.paused);
    h.now = h.now.add(const Duration(minutes: 45));
    h.controller.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(
      await h.controller.trigger(ReferralTrigger.oneOffTokens),
      ReferralGateResult.alreadyShownToday,
    );

    // The next day, in a new session, it may show again.
    h.controller.didChangeAppLifecycleState(AppLifecycleState.paused);
    h.now = DateTime(2026, 10, 10, 17);
    h.controller.didChangeAppLifecycleState(AppLifecycleState.resumed);
    final next = h.controller.trigger(ReferralTrigger.oneOffTokens);
    await tester.pumpAndSettle();
    expect(find.text("Know a family who'd love Tenacity?"), findsOneWidget);
    await tester.tap(find.byKey(const Key('referral-sheet-not-now')));
    await tester.pumpAndSettle();
    expect(await next, ReferralGateResult.show);
  });

  testWidgets('an overdue invoice pauses prompts', (tester) async {
    final h = _Harness(overdue: true);
    await h.pump(tester);

    expect(
      await h.controller.trigger(ReferralTrigger.invoicePaid),
      ReferralGateResult.overdueInvoice,
    );
    await tester.pumpAndSettle();
    expect(find.text("Know a family who'd love Tenacity?"), findsNothing);
  });

  testWidgets('tutors and admins are never prompted', (tester) async {
    final h = _Harness(role: 'tutor');
    await h.pump(tester);

    expect(
      await h.controller.trigger(ReferralTrigger.invoicePaid),
      ReferralGateResult.notParent,
    );
  });

  testWidgets('the Remote Config switch turns prompts off', (tester) async {
    final h = _Harness(enabled: false);
    await h.pump(tester);

    expect(
      await h.controller.trigger(ReferralTrigger.invoicePaid),
      ReferralGateResult.disabled,
    );
  });

  testWidgets('a positive note prompts once the parent leaves the screen',
      (tester) async {
    final h = _Harness();
    await h.pump(tester);

    // Counting starts now; the old note never counts.
    await h.controller.noteFeedbackShown([_note('old', DateTime(2026, 9, 1))]);
    h.controller.feedbackScreenClosed();
    await tester.pumpAndSettle();
    expect(find.text("Know a family who'd love Tenacity?"), findsNothing);

    await h.controller.noteFeedbackShown(
      [_note('new', h.now.add(const Duration(minutes: 1)))],
    );
    await tester.pumpAndSettle();
    expect(
      find.text("Know a family who'd love Tenacity?"),
      findsNothing,
      reason: 'never over the note being read',
    );

    h.controller.feedbackScreenClosed();
    await tester.pumpAndSettle();
    expect(find.text("Know a family who'd love Tenacity?"), findsOneWidget);
  });

  testWidgets(
      'counting starts at sign-in, so the first note written after it counts',
      (tester) async {
    final h = _Harness();
    await h.pump(tester);
    await tester.pumpAndSettle();

    // Written after sign-in but before the parent first opens feedback.
    final note = _note('first', h.now.add(const Duration(hours: 2)));
    h.now = h.now.add(const Duration(days: 1));
    await h.controller.noteFeedbackShown([note]);
    h.controller.feedbackScreenClosed();
    await tester.pumpAndSettle();

    expect(find.text("Know a family who'd love Tenacity?"), findsOneWidget);
  });

  testWidgets('a failed link fetch tells the parent instead of sharing',
      (tester) async {
    final h = _Harness(failLink: true);
    await tester.pumpWidget(
      MaterialApp(
        navigatorKey: h.navigatorKey,
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => h.controller.share(context),
              child: const Text('Share'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Share'));
    await tester.pumpAndSettle();

    expect(h.shared, isEmpty);
    expect(
      find.text("Couldn't get your referral link. Please try again."),
      findsOneWidget,
    );
    expect(h.controller.isSharing, isFalse);
  });
}
