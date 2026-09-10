import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
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

/// MOB-41: read state was a `readBy` map on every message, so marking a thread
/// read meant downloading the whole conversation and writing to each unread
/// message — against a 500-operation batch ceiling. It is now one watermark on
/// the chat document.
///
/// MOB-42: the thread had no limit at all, so opening it subscribed to every
/// message it had ever carried.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ActiveChat.reset();
  });
  tearDown(ActiveChat.reset);

  group('the watermark itself', () {
    test('covers everything sent up to when it was stamped', () {
      final chat = _chat(lastReadAt: {'them': _at(10, 30)});

      expect(chat.hasReadUpTo('them', _at(10, 29)), isTrue);
      expect(chat.hasReadUpTo('them', _at(10, 30)), isTrue);
      expect(chat.hasReadUpTo('them', _at(10, 31)), isFalse);
    });

    test('no watermark means nothing has been read', () {
      // The safe direction: a thread last opened by a client from before this
      // field existed must under-claim rather than mark somebody's unread
      // messages as seen.
      final chat = _chat(lastReadAt: const {});

      expect(chat.hasReadUpTo('them', _at(10, 30)), isFalse);
    });

    test('a malformed entry costs an indicator, not the inbox', () {
      // Parsed inside the mapping of the whole inbox snapshot, so one bad value
      // must not throw — the mistake the legacy typingStatus cast made.
      expect(parseReadWatermarks({'them': 'not a timestamp'}), isEmpty);
      expect(parseReadWatermarks('not a map'), isEmpty);
      expect(parseReadWatermarks(null), isEmpty);
      expect(
        parseReadWatermarks({'them': _at(10, 30), 'other': 42}),
        {'them': _at(10, 30)},
      );
    });
  });

  group('ChatScreen', () {
    Future<void> pump(
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
              value: ChatOutbox(send: (_) => Completer<void>().future)
                ..setUser('me'),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            navigatorObservers: [chatRouteObserver],
            home: const ChatScreen(
              chatId: 'chat-1',
              otherUserName: 'Taylor Tutor',
              receipientId: 'them',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('the sender sees Read from the watermark, not from readBy',
        (tester) async {
      final chatController = _FakeChatController();
      await pump(tester, chatController);

      // Sent by me, and carrying no readBy entry at all — which under the old
      // model was the only way to know it had been read.
      chatController.emitMessages([_mine(id: 'm-1', at: _at(10, 0))]);
      await tester.pumpAndSettle();
      expect(find.text('Delivered'), findsOneWidget);

      chatController.emitChat(_chat(lastReadAt: {'them': _at(10, 30)}));
      await tester.pumpAndSettle();

      expect(find.text('Delivered'), findsNothing);
      expect(find.textContaining('Read'), findsOneWidget);
    });

    testWidgets('a message sent after the watermark is still only delivered',
        (tester) async {
      final chatController = _FakeChatController();
      await pump(tester, chatController);

      chatController.emitChat(_chat(lastReadAt: {'them': _at(10, 30)}));
      chatController.emitMessages([_mine(id: 'm-1', at: _at(11, 0))]);
      await tester.pumpAndSettle();

      expect(find.text('Delivered'), findsOneWidget);
    });

    testWidgets('a watermark behind the message still defers to readBy',
        (tester) async {
      // Mixed rollout: the other participant is on a client that records a read
      // by writing readBy alone, but still has a watermark, because the backend
      // stamps one whenever they send whatever version they are on. Trusting
      // the watermark alone would call this unread when it plainly is not.
      final chatController = _FakeChatController();
      await pump(tester, chatController);

      chatController.emitChat(_chat(lastReadAt: {'them': _at(10, 0)}));
      chatController.emitMessages([
        _mine(id: 'm-1', at: _at(11, 0), readBy: {'them': _at(11, 5)}),
      ]);
      await tester.pumpAndSettle();

      expect(find.textContaining('Read'), findsOneWidget);
      expect(find.text('Delivered'), findsNothing);
    });

    testWidgets('a thread with no watermark falls back to readBy',
        (tester) async {
      // A conversation last opened by a client from before MOB-41. Losing its
      // receipts for the length of the rollout would be a visible regression.
      final chatController = _FakeChatController();
      await pump(tester, chatController);

      chatController.emitChat(_chat(lastReadAt: const {}));
      chatController.emitMessages([
        _mine(id: 'm-1', at: _at(10, 0), readBy: {'them': _at(10, 5)}),
      ]);
      await tester.pumpAndSettle();

      expect(find.textContaining('Read'), findsOneWidget);
    });

    testWidgets('only the messages on screen get a legacy readBy write',
        (tester) async {
      final chatController = _FakeChatController();
      await pump(tester, chatController);

      chatController.emitMessages([
        _theirs(id: 't-1', at: _at(10, 0)),
        _theirs(id: 't-2', at: _at(10, 1)),
      ]);
      await tester.pumpAndSettle();

      // Bounded by the page, not by the conversation. Writing one per message
      // in the whole thread is what MOB-41 removed.
      expect(chatController.legacyReadByWrites.last, {'t-1', 't-2'});
    });

    testWidgets('scrolling back loads older pages until the thread starts',
        (tester) async {
      final chatController = _FakeChatController(
        olderPages: [
          [_theirs(id: 'old-1', at: _at(9, 0), text: 'Earlier message')],
          const [],
        ],
      );
      await pump(tester, chatController);

      // Newest first, as the query returns them, and enough to overflow the
      // viewport — a thread that fits on screen has nothing to scroll.
      chatController.emitMessages([
        for (var i = 39; i >= 0; i--)
          _theirs(id: 'live-$i', at: _at(10, i), text: 'Message $i'),
      ]);
      await tester.pumpAndSettle();

      expect(chatController.olderPageRequests, isEmpty);

      await tester.drag(find.byType(ListView), const Offset(0, 2000));
      await tester.pumpAndSettle();

      // Keeps fetching while the viewport is not full — a page smaller than
      // the screen should not leave a gap the user has to scroll into again —
      // and stops as soon as a page comes back empty.
      expect(chatController.olderPageRequests, isNotEmpty);
      // Cursored on the oldest loaded message itself, id included, so a page
      // boundary landing inside a group of messages written in the same
      // millisecond cannot skip past the whole group.
      expect(chatController.olderPageCursorIds.first, 'live-0');
      expect(bubblesSaying('Earlier message'), findsOneWidget);

      final afterScrolling = chatController.olderPageRequests.length;
      for (var attempt = 0; attempt < 3; attempt++) {
        await tester.drag(find.byType(ListView), const Offset(0, 2000));
        await tester.pumpAndSettle();
      }
      expect(chatController.olderPageRequests, hasLength(afterScrolling));
    });

    testWidgets('an empty older page stops it asking again', (tester) async {
      final chatController = _FakeChatController(olderPages: [const []]);
      await pump(tester, chatController);

      // Newest first, as the query returns them, and enough to overflow the
      // viewport — a thread that fits on screen has nothing to scroll.
      chatController.emitMessages([
        for (var i = 39; i >= 0; i--)
          _theirs(id: 'live-$i', at: _at(10, i), text: 'Message $i'),
      ]);
      await tester.pumpAndSettle();

      for (var attempt = 0; attempt < 3; attempt++) {
        await tester.drag(find.byType(ListView), const Offset(0, 2000));
        await tester.pumpAndSettle();
      }

      // The start of a conversation is an answer, not a question to keep
      // asking every time the user scrolls.
      expect(chatController.olderPageRequests, hasLength(1));
    });
  });
}

Finder bubblesSaying(String text) => find.byWidgetPredicate(
      (widget) => widget is Linkify && widget.text == text,
    );

Timestamp _at(int hour, int minute) =>
    Timestamp.fromDate(DateTime(2026, 9, 1, hour, minute));

Chat _chat({Map<String, Timestamp?> lastReadAt = const {}}) => Chat(
      id: 'chat-1',
      participants: const ['me', 'them'],
      lastMessage: 'Hello',
      updatedAt: _at(10, 0),
      unreadCounts: const {},
      deletedFor: const {},
      typingStatus: const {},
      lastReadAt: lastReadAt,
    );

Message _mine({
  required String id,
  required Timestamp at,
  Map<String, Timestamp> readBy = const {},
}) =>
    Message(
      id: id,
      senderId: 'me',
      text: 'From me',
      type: 'text',
      timestamp: at,
      readBy: readBy,
    );

Message _theirs({
  required String id,
  required Timestamp at,
  String text = 'From them',
}) =>
    Message(
      id: id,
      senderId: 'them',
      text: text,
      type: 'text',
      timestamp: at,
      readBy: const {},
    );

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
  final _histories = <String, ChatHistory>{};
  @override
  ChatHistory historyFor(String chatId) =>
      _histories.putIfAbsent(chatId, ChatHistory.new);

  _FakeChatController({List<List<Message>> olderPages = const []})
      : _olderPages = List.of(olderPages);

  final List<List<Message>> _olderPages;
  final StreamController<List<Message>> _messages =
      StreamController<List<Message>>();
  final StreamController<Chat?> _chats = StreamController<Chat?>.broadcast();

  /// The id sets handed to each legacy `readBy` write, in order.
  final List<Set<String>> legacyReadByWrites = [];

  /// The timestamps older pages were requested before.
  final List<Timestamp> olderPageRequests = [];

  /// The document ids that went with them. Paging on a timestamp alone would
  /// skip every message sharing it at a page boundary (MOB-43).
  final List<String> olderPageCursorIds = [];

  void emitMessages(List<Message> messages) => _messages.add(messages);
  void emitChat(Chat chat) => _chats.add(chat);

  @override
  String get userId => 'me';

  @override
  List<Chat> get chats => const [];

  @override
  Stream<List<Message>> getMessages(String chatId, {int? limit}) =>
      _messages.stream;

  @override
  Future<List<Message>> fetchMessagesBefore({
    required String chatId,
    required Timestamp before,
    required String beforeId,
  }) async {
    olderPageRequests.add(before);
    olderPageCursorIds.add(beforeId);
    if (_olderPages.isEmpty) return const [];
    return _olderPages.removeAt(0);
  }

  @override
  Future<void> markMessagesAsRead(
    String chatId, {
    List<String> legacyReadByIds = const [],
  }) async {
    legacyReadByWrites.add(legacyReadByIds.toSet());
  }

  @override
  Stream<Chat?> watchChat(String chatId) => _chats.stream;

  @override
  Future<void> updateTypingStatus(String chatId, bool isTyping) async {}

  @override
  bool isOtherUserTyping(Chat? chat, DateTime now) => false;

  @override
  Chat? chatById(String chatId) => null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
