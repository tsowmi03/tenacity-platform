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
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/messaging/inbox_data.dart';
import 'package:tenacity/src/ui/messaging/new_chat_data.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// MOB-54: group chats.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  group('Chat.groupLabel', () {
    // The same cases as groupChat.test.js in the functions package, which
    // titles the push. The two must name a group identically.
    test('names everyone but the viewer, by first name', () {
      expect(_group(['me', 'a']).groupLabel('me'), 'Sarah');
      expect(_group(['me', 'a', 'b']).groupLabel('me'), 'Sarah & Priya');
      expect(
        _group(['me', 'a', 'b', 'c']).groupLabel('me'),
        'Sarah, Priya & Ana',
      );
      expect(
        _group(['me', 'a', 'b', 'c', 'd']).groupLabel('me'),
        'Sarah, Priya & 2 others',
      );
    });

    test('reads differently for each member', () {
      expect(_group(['me', 'a', 'b']).groupLabel('a'), 'Tom & Priya');
    });

    test('falls back rather than showing a blank', () {
      expect(_group(['me', 'x', 'a']).groupLabel('me'), 'Unknown & Sarah');
      expect(_group(['me']).groupLabel('me'), 'Just you');
    });
  });

  group('Chat group fields', () {
    test('parses a group and its roster, ignoring malformed entries', () {
      final names = parseParticipantNames({
        'a': {'firstName': ' Sarah ', 'lastName': 'Jones'},
        'b': 'not a map',
        'c': {'firstName': 3, 'lastName': 'Lopez'},
      });

      expect(names.keys, ['a', 'c']);
      expect(names['a']!.fullName, 'Sarah Jones');
      expect(names['c']!.shortName, 'Lopez');
      expect(parseParticipantNames('nonsense'), isEmpty);
    });

    test('a one-to-one thread is written exactly as before', () {
      final direct = Chat(
        id: 'c',
        participants: const ['me', 'them'],
        lastMessage: '',
        updatedAt: Timestamp.fromDate(DateTime(2026, 10, 16)),
        unreadCounts: const {},
        deletedFor: const {},
        typingStatus: const {},
      ).toFirestore();

      expect(direct.containsKey('isGroup'), isFalse);
      expect(direct.containsKey('participantNames'), isFalse);
    });

    test('an empty group is hidden from everyone but its creator', () {
      final empty = _group(['me', 'a', 'b'], lastMessage: '', createdBy: 'me');
      expect(empty.isVisibleTo('me'), isTrue);
      expect(empty.isVisibleTo('a'), isFalse);

      final started = _group(['me', 'a', 'b'], lastMessage: 'Hello');
      expect(started.isVisibleTo('a'), isTrue);
    });

    test('reports everyone typing, in member order', () {
      final now = DateTime(2026, 10, 16, 12);
      final chat = _group(
        ['me', 'a', 'b', 'c'],
        typing: {'c': now, 'a': now, 'me': now},
      );

      expect(chat.typingParticipants('me', now), ['a', 'c']);
    });
  });

  group('groupTypingLabel', () {
    test('names one or two people, then stops naming', () {
      expect(groupTypingLabel(['Sarah']), 'Sarah is typing…');
      expect(
        groupTypingLabel(['Sarah', 'Priya']),
        'Sarah and Priya are typing…',
      );
      expect(
        groupTypingLabel(['Sarah', 'Priya', 'Ana']),
        'Several people are typing…',
      );
    });
  });

  group('canStartGroupChat', () {
    test('admins and tutors can start a group, parents cannot', () {
      expect(canStartGroupChat('admin'), isTrue);
      expect(canStartGroupChat('Tutor'), isTrue);
      expect(canStartGroupChat('parent'), isFalse);
      expect(canStartGroupChat(null), isFalse);
    });
  });

  group('buildInboxThreads', () {
    test('labels a group from its own roster, with no lookup', () {
      final threads = buildInboxThreads(
        chats: [
          _group(['me', 'a', 'b'], lastMessage: 'See you at 5')
        ],
        namesByChatId: const {},
        currentUserId: 'me',
        now: DateTime(2026, 10, 16),
      );

      expect(threads.single.name, 'Sarah & Priya');
      expect(threads.single.isGroup, isTrue);
      expect(threads.single.isTeam, isFalse);
    });
  });

  group('group thread', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    testWidgets('shows the live label and a group avatar in the header',
        (tester) async {
      final controller = _FakeChatController()
        ..emitChat(_group(['me', 'a', 'b'], lastMessage: 'Hi'));
      await _pump(tester, controller, initialTitle: 'Placeholder');
      await tester.pump();

      expect(find.text('Sarah & Priya'), findsOneWidget);
      expect(find.byKey(const Key('chat-group-avatar')), findsOneWidget);
    });

    testWidgets('names the sender once per run and never shows "Read"',
        (tester) async {
      final now = DateTime.now();
      final controller = _FakeChatController()
        ..emitChat(
          _group(
            ['me', 'a', 'b'],
            lastMessage: 'Thanks',
            // Everyone has read everything; a group still says Delivered.
            readAt: {'a': now, 'b': now},
          ),
        )
        ..messages = [
          // Newest first, the order the thread receives them in.
          _message('m4', 'me', 'Thanks', now),
          _message('m3', 'b', 'Same here', now.subtract(_minute)),
          _message('m2', 'a', 'And Thursday', now.subtract(_minute * 2)),
          _message('m1', 'a', 'Free Tuesday', now.subtract(_minute * 3)),
        ];
      await _pump(tester, controller);
      await tester.pump();
      await tester.pump();

      expect(find.text('Sarah'), findsOneWidget);
      expect(find.text('Priya'), findsOneWidget);
      // Initials beside the last bubble of each run only.
      expect(find.text('SJ'), findsOneWidget);
      expect(find.text('PS'), findsOneWidget);
      expect(find.text('Delivered'), findsOneWidget);
      expect(find.textContaining('Read'), findsNothing);
    });

    testWidgets('names who is typing', (tester) async {
      final now = DateTime.now();
      final controller = _FakeChatController()
        ..emitChat(
          _group(['me', 'a', 'b'],
              lastMessage: 'Hi',
              typing: {
                'a': now,
                'b': now,
              }),
        );
      await _pump(tester, controller);
      await tester.pump();

      expect(find.text('Sarah and Priya are typing…'), findsOneWidget);

      await tester.pump(typingHeartbeatTtl + const Duration(seconds: 1));
    });
  });
}

const _minute = Duration(minutes: 1);

const _names = {
  'me': ChatMemberName(firstName: 'Tom', lastName: 'Sowmi'),
  'a': ChatMemberName(firstName: 'Sarah', lastName: 'Jones'),
  'b': ChatMemberName(firstName: 'Priya', lastName: 'Shah'),
  'c': ChatMemberName(firstName: 'Ana', lastName: 'Lopez'),
  'd': ChatMemberName(firstName: 'Ben', lastName: 'Wu'),
};

Chat _group(
  List<String> participants, {
  String lastMessage = 'Hello',
  String createdBy = 'me',
  Map<String, DateTime> typing = const {},
  Map<String, DateTime> readAt = const {},
}) {
  Map<String, Timestamp?> stamps(Map<String, DateTime> times) =>
      times.map((key, value) => MapEntry(key, Timestamp.fromDate(value)));

  return Chat(
    id: 'group-1',
    participants: participants,
    lastMessage: lastMessage,
    updatedAt: Timestamp.fromDate(DateTime(2026, 10, 16)),
    unreadCounts: const {},
    deletedFor: const {},
    typingStatus: const {},
    typingHeartbeats: stamps(typing),
    lastReadAt: stamps(readAt),
    isGroup: true,
    participantNames: _names,
    createdBy: createdBy,
  );
}

Message _message(String id, String senderId, String text, DateTime at) {
  return Message(
    id: id,
    senderId: senderId,
    text: text,
    type: 'text',
    timestamp: Timestamp.fromDate(at),
    readBy: const {},
  );
}

Future<void> _pump(
  WidgetTester tester,
  _FakeChatController controller, {
  String initialTitle = 'Sarah & Priya',
}) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<ChatController>.value(value: controller),
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
        home: ChatScreen(
          chatId: 'group-1',
          otherUserName: initialTitle,
          isGroup: true,
        ),
      ),
    ),
  );
  await tester.pump();
}

class _FakeChatController extends ChangeNotifier implements ChatController {
  final _histories = <String, ChatHistory>{};
  @override
  ChatHistory historyFor(String chatId) =>
      _histories.putIfAbsent(chatId, ChatHistory.new);

  final StreamController<Chat?> _chats = StreamController<Chat?>.broadcast();
  Chat? _latest;
  List<Message> messages = const [];

  void emitChat(Chat chat) {
    _latest = chat;
    if (_chats.hasListener) _chats.add(chat);
  }

  @override
  String get userId => 'me';

  @override
  List<Chat> get chats => const [];

  @override
  Stream<Chat?> watchChat(String chatId) async* {
    if (_latest != null) yield _latest;
    yield* _chats.stream;
  }

  @override
  Chat? chatById(String chatId) => null;

  @override
  bool isOtherUserTyping(Chat? chat, DateTime now) => false;

  @override
  List<String> typingParticipants(Chat? chat, DateTime now) =>
      chat?.typingParticipants(userId, now) ?? const [];

  @override
  Future<void> updateTypingStatus(String chatId, bool isTyping) async {}

  @override
  Stream<List<Message>> getMessages(String chatId, {int? limit}) =>
      Stream.value(messages);

  @override
  Future<void> markMessagesAsRead(String chatId,
      {List<String> legacyReadByIds = const []}) async {}

  @override
  void dispose() {
    _chats.close();
    super.dispose();
  }

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
