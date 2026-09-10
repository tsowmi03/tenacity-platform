import 'dart:async';

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
import 'package:tenacity/src/ui/theme/design_tokens.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
      'compose box clips a multi-line message to its rounded background',
      (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<ChatController>.value(
            value: _FakeChatController(),
          ),
          ChangeNotifierProvider<ChatOutbox>.value(
            value: ChatOutbox(send: (_) => Completer<void>().future)
              ..setUser('me'),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const ChatScreen(
            chatId: null,
            otherUserName: 'Taylor Tutor',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Type a message…'),
      'This is a deliberately long test message meant to wrap across '
      'several lines so the compose box grows well past a single line '
      'of text and exercises the pill-shaped background.',
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);

    final container = tester.widget<Container>(
      find
          .ancestor(
            of: find.widgetWithText(TextField, 'Type a message…'),
            matching: find.byType(Container),
          )
          .first,
    );
    expect(container.clipBehavior, Clip.antiAlias);

    // A fixed, modest radius (not AppRadii.pill) so the corners hold their
    // curve instead of scaling into a deep stadium as the box grows tall.
    final decoration = container.decoration as BoxDecoration;
    expect(decoration.borderRadius, BorderRadius.circular(AppRadii.md));
  });

  testWidgets(
      'one tap queues exactly one message and empties the composer, so a '
      'second tap cannot repeat it (MOB-21)', (tester) async {
    tester.view.physicalSize = const Size(402, 874);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final chatController = _FakeChatController();
    final connectivity = _FakeConnectivityController();
    // Never answers, so the queued message stays in flight while the test looks
    // at whether the button went back to being tappable.
    final outbox = ChatOutbox(send: (_) => Completer<void>().future)
      ..setUser('me');

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<ChatController>.value(value: chatController),
          ChangeNotifierProvider<ConnectivityController>.value(
              value: connectivity),
          ChangeNotifierProvider<ChatOutbox>.value(value: outbox),
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

    await tester.enterText(
      find.widgetWithText(TextField, 'Type a message…'),
      'Hey, are you still free Thursday?',
    );
    await tester.pumpAndSettle();

    final sendButtonFinder = find.widgetWithIcon(IconButton, Icons.send);

    tester.widget<IconButton>(sendButtonFinder).onPressed!();
    await tester.pumpAndSettle();

    // Since MOB-36 the send is over as soon as the text is on disk, so the
    // button does not stay disabled waiting on a network call. What stops a
    // double tap is that the queue took the text and the composer is empty.
    expect(outbox.entries, hasLength(1));
    expect(outbox.entries.single.text, 'Hey, are you still free Thursday?');
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      isEmpty,
    );

    // A second tap finds nothing to send, and the button's own guard returns
    // before _sendMessages is reached.
    await tester.tap(sendButtonFinder, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(outbox.entries, hasLength(1));

    // Text never touches the controller directly any more — the queue owns it,
    // and is the only thing that calls the send through.
    expect(chatController.sendMessageCalls, 0);
  });
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
  final _histories = <String, ChatHistory>{};
  @override
  ChatHistory historyFor(String chatId) =>
      _histories.putIfAbsent(chatId, ChatHistory.new);

  int sendMessageCalls = 0;
  final List<Completer<void>> _pendingSends = [];

  @override
  String get userId => 'me';

  @override
  List<Chat> get chats => const [];

  @override
  Stream<List<Message>> getMessages(String chatId, {int? limit}) =>
      const Stream.empty();

  @override
  bool isOtherUserTyping(Chat? chat, DateTime now) => false;

  @override
  Chat? chatById(String chatId) => null;

  @override
  Stream<Chat?> watchChat(String chatId) => const Stream.empty();

  @override
  Future<void> markMessagesAsRead(String chatId,
      {List<String> legacyReadByIds = const []}) async {}

  /// Records what the composer announced, so a test can assert the heartbeat
  /// without reaching into Firestore.
  final List<bool> typingReports = [];

  @override
  Future<void> updateTypingStatus(String chatId, bool isTyping) async {
    typingReports.add(isTyping);
  }

  /// The ids the screen chose for the messages it sent, in order.
  final List<String> sentMessageIds = [];

  @override
  Future<void> sendMessage({
    required String chatId,
    required String messageId,
    required String text,
    String? mediaUrl,
    String? thumbnailUrl,
    String messageType = "text",
    String? fileName,
    int? fileSize,
    String? recipientId,
  }) {
    sendMessageCalls++;
    sentMessageIds.add(messageId);
    final completer = Completer<void>();
    _pendingSends.add(completer);
    return completer.future;
  }

  void completePendingSend() {
    for (final completer in _pendingSends) {
      if (!completer.isCompleted) completer.complete();
    }
    _pendingSends.clear();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
