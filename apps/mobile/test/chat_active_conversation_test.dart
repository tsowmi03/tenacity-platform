import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/services/active_chat.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// MOB-40: the app had no notion of which conversation was on screen, so a
/// message arriving in the thread the user was reading raised a banner, stayed
/// counted by the inbox badge, and never showed its sender a read receipt.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ActiveChat.reset();
  });
  tearDown(ActiveChat.reset);

  group('ActiveChat', () {
    test('only the chat that claimed it is active', () {
      ActiveChat.enter('chat-1');

      expect(ActiveChat.isActive('chat-1'), isTrue);
      expect(ActiveChat.isActive('chat-2'), isFalse);
    });

    test('a null candidate is never active, even with no claim', () {
      expect(ActiveChat.isActive(null), isFalse);

      ActiveChat.enter('chat-1');
      expect(ActiveChat.isActive(null), isFalse);
    });

    test('leaving releases the claim', () {
      ActiveChat.enter('chat-1');
      ActiveChat.leave('chat-1');

      expect(ActiveChat.chatId, isNull);
    });

    test('a departing screen cannot clear the claim of the one replacing it',
        () {
      // Routes overlap: the second thread's initState runs before the first
      // thread's dispose. An unguarded clear would leave nothing active while a
      // thread is plainly on screen, and banners would keep firing for it.
      ActiveChat.enter('chat-1');
      ActiveChat.enter('chat-2');
      ActiveChat.leave('chat-1');

      expect(ActiveChat.chatId, 'chat-2');
      expect(ActiveChat.isActive('chat-2'), isTrue);
    });
  });

  group('ChatScreen', () {
    Future<void> pumpChatScreen(
      WidgetTester tester,
      _FakeChatController chatController,
    ) async {
      tester.view.physicalSize = const Size(402, 874);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<ChatController>.value(value: chatController),
            ChangeNotifierProvider<ConnectivityController>.value(
              value: _FakeConnectivityController(),
            ),
            ChangeNotifierProvider<ChatOutbox>.value(
              value: ChatOutbox(send: (_) => Completer<void>().future),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            home: const ChatScreen(
              chatId: 'chat-1',
              otherUserName: 'Taylor Tutor',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('an open thread is the active conversation', (tester) async {
      final chatController = _FakeChatController();

      await pumpChatScreen(tester, chatController);

      expect(ActiveChat.chatId, 'chat-1');

      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();

      // Leaving hands the claim back, so banners resume for this thread.
      expect(ActiveChat.chatId, isNull);
    });

    testWidgets('a message arriving in an open thread is read on arrival',
        (tester) async {
      final chatController = _FakeChatController();
      await pumpChatScreen(tester, chatController);

      final onOpen = chatController.markReadCalls;

      chatController.emitMessages([_theirMessage(id: 'm-1', text: 'Hi Tom')]);
      await tester.pumpAndSettle();

      expect(
        chatController.markReadCalls,
        greaterThan(onOpen),
        reason: 'a message read on screen must not stay counted as unread',
      );
    });

    testWidgets('a repeated snapshot does not re-issue the read',
        (tester) async {
      final chatController = _FakeChatController();
      await pumpChatScreen(tester, chatController);

      final message = _theirMessage(id: 'm-1', text: 'Hi Tom');
      chatController.emitMessages([message]);
      await tester.pumpAndSettle();

      final afterArrival = chatController.markReadCalls;

      // Marking a thread read rewrites readBy on every message in it, which
      // comes straight back down this same stream. The answer has to be the
      // same however many times one message arrives.
      chatController.emitMessages([message]);
      await tester.pumpAndSettle();
      chatController.emitMessages([message]);
      await tester.pumpAndSettle();

      expect(chatController.markReadCalls, afterArrival);
    });

    testWidgets('the user\'s own message does not mark the thread read',
        (tester) async {
      final chatController = _FakeChatController();
      await pumpChatScreen(tester, chatController);

      final onOpen = chatController.markReadCalls;

      chatController.emitMessages([
        Message(
          id: 'mine-1',
          senderId: 'me',
          text: 'Sent from here',
          type: 'text',
          timestamp: Timestamp.fromDate(DateTime(2026, 9, 1, 9)),
          readBy: const {},
        ),
      ]);
      await tester.pumpAndSettle();

      expect(chatController.markReadCalls, onOpen);
    });

    /// Walks the lifecycle through every intermediate state, because the
    /// framework asserts on transitions that skip one.
    Future<void> driveLifecycle(
      WidgetTester tester,
      List<AppLifecycleState> states,
    ) async {
      for (final state in states) {
        tester.binding.handleAppLifecycleStateChanged(state);
        await tester.pump();
      }
      await tester.pumpAndSettle();
    }

    const toBackground = [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
    ];
    const toForeground = [
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ];

    testWidgets('a backgrounded thread is not the active conversation',
        (tester) async {
      final chatController = _FakeChatController();
      await pumpChatScreen(tester, chatController);

      await driveLifecycle(tester, toBackground);

      // The screen is still mounted, but the user cannot see it — so a message
      // arriving now should notify and stay unread.
      expect(ActiveChat.chatId, isNull);

      final whileAway = chatController.markReadCalls;
      chatController.emitMessages([_theirMessage(id: 'm-1', text: 'Hi Tom')]);
      await tester.pumpAndSettle();

      expect(chatController.markReadCalls, whileAway);
    });

    testWidgets('returning to the app reads what arrived while it was away',
        (tester) async {
      final chatController = _FakeChatController();
      await pumpChatScreen(tester, chatController);

      await driveLifecycle(tester, toBackground);
      chatController.emitMessages([_theirMessage(id: 'm-1', text: 'Hi Tom')]);
      await tester.pumpAndSettle();

      final whileAway = chatController.markReadCalls;

      await driveLifecycle(tester, toForeground);

      expect(ActiveChat.chatId, 'chat-1');
      expect(
        chatController.markReadCalls,
        greaterThan(whileAway),
        reason: 'the message is on screen the moment the app comes back',
      );
    });
  });
}

Message _theirMessage({required String id, required String text}) {
  return Message(
    id: id,
    senderId: 'them',
    text: text,
    type: 'text',
    timestamp: Timestamp.fromDate(DateTime(2026, 9, 1, 9, 30)),
    readBy: const {},
  );
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

class _FakeChatController extends ChangeNotifier implements ChatController {
  /// Deliberately single-subscription, matching the real screen's contract: a
  /// second listen throws rather than quietly doubling the reads.
  final StreamController<List<Message>> _messages =
      StreamController<List<Message>>();

  int markReadCalls = 0;

  void emitMessages(List<Message> messages) => _messages.add(messages);

  @override
  String get userId => 'me';

  @override
  List<Chat> get chats => const [];

  @override
  Stream<List<Message>> getMessages(String chatId) => _messages.stream;

  @override
  Future<void> markMessagesAsRead(String chatId) async {
    markReadCalls++;
  }

  @override
  Future<void> updateTypingStatus(String chatId, bool isTyping) async {}

  @override
  bool isOtherUserTyping(Chat? chat, DateTime now) => false;

  @override
  Chat? chatById(String chatId) => null;

  @override
  Stream<Chat?> watchChat(String chatId) => const Stream.empty();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
