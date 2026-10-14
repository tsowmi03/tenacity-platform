import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/services/analytics_service.dart';

const _channel = MethodChannel('posthog_flutter');

Parent _parent({String uid = 'parent-1', String email = 'pat@example.com'}) =>
    Parent(
      uid: uid,
      firstName: 'Pat',
      lastName: 'Parent',
      email: email,
      fcmTokens: const [],
      students: const [],
      phone: '0400 000 000',
      unreadChats: const {},
      activeChats: const [],
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late List<MethodCall> calls;

  void recordNativeCalls() {
    calls = [];
    messenger.setMockMethodCallHandler(_channel, (call) async {
      calls.add(call);
      return null;
    });
  }

  setUp(Analytics.resetForTest);
  tearDown(() => messenger.setMockMethodCallHandler(_channel, null));

  group('without a project token (staging builds)', () {
    test('stays off and never reaches PostHog', () async {
      recordNativeCalls();

      await Analytics.init(projectToken: null);
      await Analytics.syncUser(_parent(), isRestoringSession: false);
      await Analytics.screen('dashboard');

      expect(Analytics.isEnabled, isFalse);
      expect(calls, isEmpty);
    });
  });

  test('a PostHog failure at startup leaves analytics off instead of throwing',
      () async {
    // No native handler: every channel call fails, as on an unsupported
    // platform or a broken install.
    await Analytics.init(projectToken: 'phc_test');

    expect(Analytics.isEnabled, isFalse);
    await Analytics.screen('dashboard');
  });

  group('with a project token', () {
    setUp(() async {
      recordNativeCalls();
      await Analytics.init(projectToken: 'phc_test');
      calls.clear();
    });

    test('starts with replay, surveys and push handling off', () async {
      Analytics.resetForTest();
      recordNativeCalls();
      await Analytics.init(projectToken: 'phc_test');

      final setup = calls.firstWhere((c) => c.method == 'setup');
      final args = Map<String, Object?>.from(setup.arguments as Map);
      expect(args['sessionReplay'], isFalse);
      expect(args['surveys'], isFalse);
      expect(args['capturePushNotificationSubscriptions'], isFalse);
      expect(args['capturePushNotificationOpened'], isFalse);
      expect(Analytics.isEnabled, isTrue);
    });

    test('identifies by UID with email and role, once per user', () async {
      await Analytics.syncUser(_parent(), isRestoringSession: false);
      await Analytics.syncUser(_parent(), isRestoringSession: false);

      final identifies = calls.where((c) => c.method == 'identify').toList();
      expect(identifies, hasLength(1));
      final args =
          Map<String, Object?>.from(identifies.single.arguments as Map);
      expect(args['userId'], 'parent-1');
      expect(args['userProperties'], {
        'email': 'pat@example.com',
        'role': 'parent',
      });
    });

    test('does not treat session restore as a sign-out', () async {
      await Analytics.syncUser(_parent(), isRestoringSession: false);
      await Analytics.syncUser(null, isRestoringSession: true);

      expect(calls.where((c) => c.method == 'reset'), isEmpty);
    });

    test('resets on sign-out and identifies the next user', () async {
      await Analytics.syncUser(_parent(), isRestoringSession: false);
      await Analytics.syncUser(null, isRestoringSession: false);
      await Analytics.syncUser(
        _parent(uid: 'parent-2', email: 'sam@example.com'),
        isRestoringSession: false,
      );

      expect(
        calls.map((c) => c.method).where((m) => m != 'register'),
        ['identify', 'reset', 'identify'],
      );
    });

    test('a signed-out launch never calls reset', () async {
      await Analytics.syncUser(null, isRestoringSession: false);

      expect(calls, isEmpty);
    });

    test('sends a screen view by name', () async {
      await Analytics.screen('invoices');

      final screen = calls.singleWhere((c) => c.method == 'screen');
      expect(
        Map<String, Object?>.from(screen.arguments as Map)['screenName'],
        'invoices',
      );
    });
  });
}
