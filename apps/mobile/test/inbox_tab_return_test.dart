import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/services/chat_service.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/ui/inbox_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// MOB-20, at the level the bug was reported: the inbox is loaded, something
/// elsewhere in the app notifies `AuthController`, and the messages disappear.
///
/// The tab shell keeps [InboxScreen] alive, so its `initState` — the only
/// caller of `loadChats` — does not run again. That makes the provider the only
/// thing standing between a loaded inbox and an empty one.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('pending send updates preview and order without a server event',
      (tester) async {
    final service = _FakeChatService();
    final outbox = ChatOutbox(send: (_) => Completer<void>().future)
      ..setUser('me');
    addTearDown(outbox.dispose);
    await _pumpInbox(tester,
        service: service, auth: _FakeAuthController(), outbox: outbox);
    service.emit([_chat('chat-1'), _chat('chat-2')]);
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.byKey(const Key('chat-1'))).dy,
        lessThan(tester.getTopLeft(find.byKey(const Key('chat-2'))).dy));

    await outbox.enqueueMessage(
        id: 'sent', chatId: 'chat-2', senderId: 'me', text: 'Just sent');
    await tester.pumpAndSettle();
    expect(find.text('Just sent'), findsOneWidget);
    expect(tester.getTopLeft(find.byKey(const Key('chat-2'))).dy,
        lessThan(tester.getTopLeft(find.byKey(const Key('chat-1'))).dy));

    // A message snapshot may confirm the send before the inbox stream updates.
    await outbox.confirm('sent');
    await tester.pumpAndSettle();
    expect(find.text('Just sent'), findsOneWidget);
    expect(tester.getTopLeft(find.byKey(const Key('chat-2'))).dy,
        lessThan(tester.getTopLeft(find.byKey(const Key('chat-1'))).dy));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('conversations survive an unrelated auth notification',
      (tester) async {
    final service = _FakeChatService();
    final auth = _FakeAuthController();

    await _pumpInbox(tester, service: service, auth: auth);
    service.emit([_chat('chat-1')]);
    await tester.pumpAndSettle();

    expect(find.text('Taylor Tutor'), findsOneWidget);
    expect(find.text('See you Monday'), findsOneWidget);

    // What `markAnnouncementAsRead` and `refreshCurrentUser` both do, with the
    // signed-in user unchanged.
    auth.notifyListeners();
    await tester.pumpAndSettle();

    expect(find.text('Taylor Tutor'), findsOneWidget);
    expect(find.text('See you Monday'), findsOneWidget);
    expect(find.text('No messages yet'), findsNothing);
  });

  testWidgets('a repeated auth notification does not restart the stream',
      (tester) async {
    final service = _FakeChatService();
    final auth = _FakeAuthController();

    await _pumpInbox(tester, service: service, auth: auth);
    service.emit([_chat('chat-1')]);
    await tester.pumpAndSettle();

    auth.notifyListeners();
    auth.notifyListeners();
    await tester.pumpAndSettle();

    // One subscription, not one per notification.
    expect(service.streamsRequested, 1);
    expect(service.liveListeners, 1);
  });
}

Future<void> _pumpInbox(
  WidgetTester tester, {
  required _FakeChatService service,
  required _FakeAuthController auth,
  ChatOutbox? outbox,
}) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        if (outbox != null)
          ChangeNotifierProvider<ChatOutbox>.value(value: outbox)
        else
          ChangeNotifierProvider(create: (_) => ChatOutbox()),
        ChangeNotifierProvider<AuthController>.value(value: auth),
        ChangeNotifierProvider<ConnectivityController>.value(
          value: _FakeConnectivityController(),
        ),
        // The wiring under test, matching `main.dart`.
        ChangeNotifierProxyProvider<AuthController, ChatController>(
          create: (_) => ChatController(chatService: service, userId: ''),
          update: (_, authController, previous) => ChatController.forUser(
            previous,
            authController.currentUser?.uid ?? '',
            createService: () => service,
          ),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: const InboxScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Chat _chat(String id) => Chat(
      id: id,
      participants: const ['me', 'other'],
      lastMessage: 'See you Monday',
      updatedAt: Timestamp.fromDate(DateTime(2026, 7, 29, 10)),
      unreadCounts: const {'me': 1},
      deletedFor: const {},
      typingStatus: const {},
    );

class _FakeChatService implements ChatService {
  final List<StreamController<List<Chat>>> _controllers = [];

  int get streamsRequested => _controllers.length;
  int get liveListeners =>
      _controllers.where((controller) => controller.hasListener).length;

  void emit(List<Chat> chats) => _controllers.last.add(chats);

  @override
  Stream<List<Chat>> getUserChats(String userId) {
    final controller = StreamController<List<Chat>>();
    _controllers.add(controller);
    addTearDown(controller.close);
    return controller.stream;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeAuthController extends ChangeNotifier implements AuthController {
  @override
  AppUser? get currentUser => Parent(
        uid: 'me',
        firstName: 'Pat',
        lastName: 'Parent',
        email: 'pat@example.com',
        fcmTokens: const [],
        students: const [],
        phone: '',
        unreadChats: const {},
        activeChats: const [],
      );

  @override
  Future<String> fetchUserNameById(String userId) async => 'Taylor Tutor';

  @override
  void notifyListeners() => super.notifyListeners();

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
  Future<bool> refreshAndCheckOnline() async => true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
