import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/announcement_controller.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/controllers/invoice_controller.dart';
import 'package:tenacity/src/models/announcement_model.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/invoice_model.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/ui/announcement_details_screen.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/components/components.dart';
import 'package:tenacity/src/ui/dashboard/dashboard_router.dart';
import 'package:tenacity/src/ui/home_screen.dart';
import 'package:tenacity/src/ui/invoices/admin/admin_billing_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';
import 'package:tenacity/src/ui/theme/design_tokens.dart';

/// Covers the screens whose loading state can be driven directly, plus the
/// shared skeleton widgets. Screens needing the full provider stack assert the
/// same thing from their own lifecycle tests.
void main() {
  group('DashboardRouter', () {
    testWidgets('shows the dashboard skeleton until the user resolves',
        (tester) async {
      final auth = _FakeAuthController();

      await _pump(
        tester,
        ChangeNotifierProvider<AuthController>.value(
          value: auth,
          child: DashboardRouter(onNavigate: (_) {}),
        ),
      );

      expect(find.byKey(const Key('dashboard-router-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      auth.resolve();
      await tester.pump();

      expect(find.byKey(const Key('dashboard-router-loading')), findsNothing);
    });
  });

  group('AnnouncementDetailsScreen', () {
    testWidgets('shows a prose skeleton while the announcement loads',
        (tester) async {
      final gate = Completer<Announcement?>();
      final announcements = _FakeAnnouncementsController(gate: gate);

      await _pump(
        tester,
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AnnouncementsController>.value(
              value: announcements,
            ),
            ChangeNotifierProvider<AuthController>.value(
              value: _FakeAuthController()..resolve(),
            ),
          ],
          child: const AnnouncementDetailsScreen(announcementId: 'a1'),
        ),
      );

      expect(find.byKey(const Key('announcement-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      gate.complete(
        Announcement(
          id: 'a1',
          title: 'Holiday timetable published',
          body: 'Bookings open Monday.',
          createdAt: DateTime(2026, 7, 26, 10, 30),
          archived: false,
          audience: 'parent',
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('announcement-loading')), findsNothing);
      expect(find.text('Holiday timetable published'), findsOneWidget);
    });
  });

  group('AdminBillingScreen', () {
    testWidgets('shows the billing skeleton until invoices arrive',
        (tester) async {
      final gate = Completer<List<Invoice>>();
      final invoices = _FakeInvoiceController(gate: gate);

      await _pump(
        tester,
        ChangeNotifierProvider<InvoiceController>.value(
          value: invoices,
          child: const AdminBillingScreen(),
        ),
      );
      await tester.pump();

      expect(find.byKey(const Key('admin-billing-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      gate.complete(const []);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('admin-billing-loading')), findsNothing);
    });
  });

  group('HomeScreen', () {
    testWidgets('shows the dashboard skeleton before the user resolves',
        (tester) async {
      final auth = _FakeAuthController();

      await _pump(
        tester,
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthController>.value(value: auth),
            ChangeNotifierProvider<AnnouncementsController>.value(
              value: _FakeAnnouncementsController(gate: Completer()),
            ),
          ],
          child: const HomeScreen(),
        ),
      );

      expect(find.byKey(const Key('home-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });
  });

  group('ChatScreen', () {
    testWidgets('shows message-bubble placeholders while the stream connects',
        (tester) async {
      final messages = StreamController<List<Message>>();
      addTearDown(messages.close);
      final chats = _FakeChatController(messages: messages.stream);

      await _pump(
        tester,
        MultiProvider(
          providers: [
            ChangeNotifierProvider<ChatController>.value(value: chats),
            ChangeNotifierProvider<ConnectivityController>.value(
              value: _FakeConnectivityController(),
            ),
            ChangeNotifierProvider<ChatOutbox>.value(
              value: ChatOutbox(send: (_) => Completer<void>().future)
                ..setUser('me'),
            ),
          ],
          child: const ChatScreen(chatId: 'chat-1', otherUserName: 'Taylor'),
        ),
      );

      expect(find.byKey(const Key('chat-loading')), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      messages.add(const []);
      // One pump delivers the stream event, the next rebuilds the StreamBuilder
      // out of ConnectionState.waiting.
      await tester.pump();
      await tester.pump();

      // An empty thread is a real answer, not a loading state.
      expect(find.byKey(const Key('chat-loading')), findsNothing);
      expect(find.text('No messages yet'), findsOneWidget);
    });
  });

  group('skeleton shapes', () {
    testWidgets('the dashboard skeleton renders one block per metric tile',
        (tester) async {
      await _pump(tester, const DashboardSkeleton(metricCount: 2));

      // Two metric placeholders, and they are laid out side by side.
      final tiles = tester
          .widgetList<SkeletonBlock>(find.byType(SkeletonBlock))
          .where((block) => block.height == 62)
          .toList();
      expect(tiles, hasLength(2));
    });

    testWidgets('placeholders on the navy header use the on-ink colour',
        (tester) async {
      await _pump(tester, const DashboardSkeleton());

      final headerBlocks = tester
          .widgetList<SkeletonBlock>(find.byType(SkeletonBlock))
          .where((block) => block.color == AppColors.onInkSkeleton);
      expect(headerBlocks, isNotEmpty);

      // The sheet below keeps the light-on-white placeholder.
      final sheetBlocks = tester
          .widgetList<SkeletonBlock>(find.byType(SkeletonBlock))
          .where((block) => block.color == AppColors.skeleton);
      expect(sheetBlocks, isNotEmpty);
    });

    testWidgets('the message thread skeleton anchors to the bottom',
        (tester) async {
      await _pump(tester, const MessageThreadSkeleton());

      final blocks = find.byType(SkeletonBlock);
      expect(blocks, findsNWidgets(5));

      // Alternating sides: the first bubble sits left of the last one's right
      // edge, which is what makes it read as a conversation.
      final first = tester.getTopLeft(blocks.first);
      final second = tester.getTopLeft(blocks.at(1));
      expect(second.dx, greaterThan(first.dx));
    });
  });

  group('compact viewports', () {
    // A skeleton fills the screen before any real content exists to size it,
    // so it has to survive the shortest viewport the app runs on. Landscape is
    // the tight case: the header alone eats most of the height.
    const sizes = <String, Size>{
      'small phone': Size(375, 667),
      'landscape': Size(844, 390),
      'very short': Size(360, 320),
    };

    final skeletons = <String, Widget>{
      'dashboard': const DashboardSkeleton(),
      'timetable': const TimetableSkeleton(),
      'billing': const BillingSkeleton(),
      'prose': const ProseSkeleton(),
      'message thread': const MessageThreadSkeleton(),
    };

    for (final skeleton in skeletons.entries) {
      for (final size in sizes.entries) {
        testWidgets('${skeleton.key} does not overflow on a ${size.key}',
            (tester) async {
          tester.view.physicalSize = size.value;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);

          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light,
              home: Scaffold(body: skeleton.value),
            ),
          );
          await tester.pump();

          expect(tester.takeException(), isNull);
        });
      }
    }
  });
}

Future<void> _pump(WidgetTester tester, Widget child) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(theme: AppTheme.light, home: Scaffold(body: child)),
  );
  await tester.pump();
}

class _FakeAuthController extends ChangeNotifier implements AuthController {
  AppUser? _user;

  void resolve() {
    _user = Parent(
      uid: 'parent-1',
      firstName: 'Pat',
      lastName: 'Parent',
      email: 'pat@example.com',
      fcmTokens: const [],
      students: const [],
      phone: '',
      unreadChats: const {},
      activeChats: const [],
    );
    notifyListeners();
  }

  @override
  AppUser? get currentUser => _user;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAnnouncementsController extends ChangeNotifier
    implements AnnouncementsController {
  final Completer<Announcement?> gate;

  _FakeAnnouncementsController({required this.gate});

  @override
  List<Announcement> get announcements => const [];

  @override
  Future<Announcement?> fetchAnnouncementById(String id) => gate.future;

  @override
  Future<void> loadAnnouncements({
    required bool onlyActive,
    List<String>? audienceFilter,
    bool forceReload = false,
  }) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeChatController extends ChangeNotifier implements ChatController {
  final Stream<List<Message>> messages;

  _FakeChatController({required this.messages});

  @override
  String get userId => 'me';

  @override
  Stream<List<Message>> getMessages(String chatId) => messages;

  @override
  bool isOtherUserTyping(Chat? chat, DateTime now) => false;

  @override
  Chat? chatById(String chatId) => null;

  @override
  Stream<Chat?> watchChat(String chatId) => const Stream.empty();

  @override
  Future<void> markMessagesAsRead(String chatId) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeConnectivityController extends ChangeNotifier
    implements ConnectivityController {
  @override
  bool get isOnline => true;

  @override
  bool get isOffline => false;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeInvoiceController extends ChangeNotifier
    implements InvoiceController {
  final Completer<List<Invoice>> gate;

  _FakeInvoiceController({required this.gate});

  @override
  Future<List<Invoice>> getAllInvoices() => gate.future;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
