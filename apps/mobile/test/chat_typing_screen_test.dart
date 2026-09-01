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
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// MOB-27. These cover the screen's side of the fix — that the composer's
/// lifecycle actually reaches Firestore. The rules about when somebody counts
/// as typing live in `typing_reporter_test.dart`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('typing into the composer announces it once', (tester) async {
    final controller = _FakeChatController();
    await _pump(tester, controller);

    await tester.enterText(_composer, 'hello');
    await tester.pump();

    expect(controller.typingReports, [true]);

    await _settle(tester);
  });

  testWidgets('leaving the screen stops the announcement', (tester) async {
    final controller = _FakeChatController();
    await _pump(tester, controller);

    await tester.enterText(_composer, 'half a thought');
    await tester.pump();
    expect(controller.typingReports, [true]);

    // Replacing the route disposes the screen. Before MOB-27 there was no
    // dispose() at all, so this left `typing` set for good and the other
    // participant saw the indicator forever.
    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pump();

    expect(controller.typingReports, [true, false]);
  });

  testWidgets('backgrounding the app stops the announcement', (tester) async {
    final controller = _FakeChatController();
    await _pump(tester, controller);

    await tester.enterText(_composer, 'half a thought');
    await tester.pump();

    // dispose() never runs for a suspended app, so this is the last chance to
    // write the stop before the process may be killed outright.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();

    expect(controller.typingReports, [true, false]);

    await _settle(tester);
  });

  testWidgets('a restored draft does not announce typing', (tester) async {
    SharedPreferences.setMockInitialValues({
      'draft_chat-1': 'something I started yesterday',
    });
    final controller = _FakeChatController();
    await _pump(tester, controller);
    await tester.pumpAndSettle();

    expect(find.text('something I started yesterday'), findsOneWidget);
    // The draft comes back; the claim does not.
    expect(controller.typingReports, isEmpty);

    await _settle(tester);
  });

  testWidgets('typing on top of a restored draft still announces',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'draft_chat-1': 'started',
    });
    final controller = _FakeChatController();
    await _pump(tester, controller);
    await tester.pumpAndSettle();

    await tester.enterText(_composer, 'started and continued');
    await tester.pump();

    // The old edge-triggered write compared against a local flag the draft had
    // already set, so this keystroke looked like "no change" and the other
    // participant was never told anything at all.
    expect(controller.typingReports, [true]);

    await _settle(tester);
  });

  testWidgets('clearing the composer stops the announcement', (tester) async {
    final controller = _FakeChatController();
    await _pump(tester, controller);

    await tester.enterText(_composer, 'hello');
    await tester.pump();
    await tester.enterText(_composer, '');
    await tester.pump();

    expect(controller.typingReports, [true, false]);

    await _settle(tester);
  });

  testWidgets('the indicator shows a live heartbeat and hides a stale one',
      (tester) async {
    final controller = _FakeChatController();
    final now = DateTime.now();

    controller.emitChat(_chat({'them': now}));
    await _pump(tester, controller);
    await tester.pump();

    expect(find.text('Taylor is typing…'), findsOneWidget);

    controller.emitChat(
      _chat({'them': now.subtract(typingHeartbeatTtl * 2)}),
    );
    // One pump delivers the stream event, the next rebuilds on it.
    await tester.pump();
    await tester.pump();

    expect(find.text('Taylor is typing…'), findsNothing);

    await _settle(tester);
  });

  testWidgets('the indicator expires on its own, with no new snapshot',
      (tester) async {
    final controller = _FakeChatController();
    controller.emitChat(_chat({'them': DateTime.now()}));

    await _pump(tester, controller);
    await tester.pump();
    expect(find.text('Taylor is typing…'), findsOneWidget);

    // Nothing is written and no snapshot arrives — the heartbeat simply ages
    // out. This is the property the whole redesign rests on: the sender no
    // longer has to survive long enough to retract its own claim.
    await tester.pump(typingHeartbeatTtl + const Duration(seconds: 1));

    expect(find.text('Taylor is typing…'), findsNothing);
  });

  testWidgets('the indicator works without the inbox having loaded',
      (tester) async {
    // A chat opened from a push notification. `chats` is empty because only
    // the inbox screen loads it; the old code looked the id up there, threw,
    // swallowed it, and silently never showed the indicator.
    final controller = _FakeChatController();
    controller.emitChat(_chat({'them': DateTime.now()}));

    await _pump(tester, controller);
    await tester.pump();

    expect(controller.chats, isEmpty);
    expect(find.text('Taylor is typing…'), findsOneWidget);

    await _settle(tester);
  });
}

final _composer = find.widgetWithText(TextField, 'Type a message…');

Chat _chat(Map<String, DateTime> typing) {
  return Chat(
    id: 'chat-1',
    participants: const ['me', 'them'],
    lastMessage: '',
    updatedAt: Timestamp.fromDate(DateTime(2026, 8, 25)),
    unreadCounts: const {},
    deletedFor: const {},
    typingStatus: const {},
    typingHeartbeats: typing.map(
      (key, value) => MapEntry(key, Timestamp.fromDate(value)),
    ),
  );
}

Future<void> _pump(WidgetTester tester, _FakeChatController controller) async {
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
        home: const ChatScreen(
          chatId: 'chat-1',
          otherUserName: 'Taylor Tutor',
        ),
      ),
    ),
  );
  await tester.pump();
}

/// Drains the reporter's idle timer so the test does not end with one pending.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump(typingIdleTimeout + const Duration(seconds: 1));
}

class _FakeChatController extends ChangeNotifier implements ChatController {
  final List<bool> typingReports = [];
  final StreamController<Chat?> _chats = StreamController<Chat?>.broadcast();
  Chat? _latest;

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
  bool isOtherUserTyping(Chat? chat, DateTime now) {
    if (chat == null) return false;
    final otherUserId = chat.otherParticipant(userId);
    if (otherUserId == null) return false;
    return chat.isTypingNow(otherUserId, now);
  }

  @override
  Future<void> updateTypingStatus(String chatId, bool isTyping) async {
    typingReports.add(isTyping);
  }

  @override
  Stream<List<Message>> getMessages(String chatId) => const Stream.empty();

  @override
  Future<void> markMessagesAsRead(String chatId) async {}

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
