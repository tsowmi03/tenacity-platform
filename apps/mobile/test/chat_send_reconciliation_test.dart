import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
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
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// MOB-31: a sent message was on screen twice — once as the optimistic copy and
/// once as the document the thread's snapshot had already delivered — for as
/// long as `sendChatMessage` took to finish its notification work and return.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() => SharedPreferences.setMockInitialValues({}));

  /// One bubble carrying [text], counted by the widget that renders message
  /// bodies rather than by a text match, which would also see the composer.
  Finder bubblesSaying(String text) => find.byWidgetPredicate(
        (widget) => widget is Linkify && widget.text == text,
      );

  Future<void> pumpChatScreen(
    WidgetTester tester, {
    required _FakeChatController chatController,
  }) async {
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

  Future<void> sendText(WidgetTester tester, String text) async {
    await tester.enterText(
      find.widgetWithText(TextField, 'Type a message…'),
      text,
    );
    await tester.pumpAndSettle();
    tester
        .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.send))
        .onPressed!();
    await tester.pumpAndSettle();
  }

  testWidgets(
      'the server copy of a message arriving before the send returns replaces '
      'the optimistic copy instead of joining it (MOB-31)', (tester) async {
    final chatController = _FakeChatController();
    await pumpChatScreen(tester, chatController: chatController);

    await sendText(tester, 'Are you free Thursday?');

    // The optimistic copy, alone, while the send is in flight.
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
    expect(chatController.sentMessageIds, hasLength(1));

    // The thread delivers the committed message while the callable is still
    // doing its notification fan-out. This is the whole window the bug lived
    // in, and it is the send's own id that comes back.
    chatController.emitMessages([
      _serverMessage(
          id: chatController.sentMessageIds.single,
          text: 'Are you free Thursday?'),
    ]);
    await tester.pumpAndSettle();

    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);

    // ...and still one once the call finally returns.
    chatController.completePendingSends();
    await tester.pumpAndSettle();

    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
  });

  testWidgets('a repeated snapshot does not bring the duplicate back',
      (tester) async {
    final chatController = _FakeChatController();
    await pumpChatScreen(tester, chatController: chatController);

    await sendText(tester, 'Are you free Thursday?');
    final messageId = chatController.sentMessageIds.single;

    chatController.emitMessages(
        [_serverMessage(id: messageId, text: 'Are you free Thursday?')]);
    await tester.pumpAndSettle();
    chatController.completePendingSends();
    await tester.pumpAndSettle();

    // The thread re-emits constantly: the callable clears `notificationAction`
    // just after committing, and opening a thread rewrites `readBy` on every
    // message in it. Reconciling has to survive that.
    chatController.emitMessages([
      _serverMessage(
        id: messageId,
        text: 'Are you free Thursday?',
        readBy: {'them': Timestamp.fromDate(DateTime(2026, 8, 27, 9, 30))},
      ),
    ]);
    await tester.pumpAndSettle();

    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
  });

  testWidgets('the thread keeps one subscription across rebuilds',
      (tester) async {
    final chatController = _FakeChatController();
    await pumpChatScreen(tester, chatController: chatController);

    chatController.emitMessages(
        [_serverMessage(id: 'existing', text: 'Earlier message')]);
    await tester.pumpAndSettle();

    // Typing, sending, and a controller notification each rebuild the screen.
    // Opening the stream in build() made every one of them tear the
    // subscription down and start again, blanking the thread for a frame.
    await tester.enterText(
      find.widgetWithText(TextField, 'Type a message…'),
      'Still here?',
    );
    await tester.pumpAndSettle();
    chatController.notifyListeners();
    await tester.pumpAndSettle();

    expect(chatController.getMessagesCalls, 1);
    expect(bubblesSaying('Earlier message'), findsOneWidget);
  });

  testWidgets(
      'a failed send still takes the message back to the composer (MOB-21)',
      (tester) async {
    final chatController = _FakeChatController(failSends: true);
    await pumpChatScreen(tester, chatController: chatController);

    await sendText(tester, 'Are you free Thursday?');

    expect(bubblesSaying('Are you free Thursday?'), findsNothing);
    expect(
      tester
          .widget<TextField>(
              find.widgetWithText(TextField, 'Are you free Thursday?'))
          .controller
          ?.text,
      'Are you free Thursday?',
    );
  });

  testWidgets(
      'a definite failure reports itself without the exception behind it '
      '(MOB-32)', (tester) async {
    // The exact shape that put frames on screen: a FirebaseException whose
    // toString() appends its stack trace.
    final chatController = _FakeChatController(
      failSends: true,
      sendError: FirebaseException(
        plugin: 'firebase_functions',
        code: 'unknown',
        message: 'internal',
        stackTrace: StackTrace.fromString(
          '#0      StandardMethodCodec.decodeEnvelope '
          '(package:flutter/src/services/message_codecs.dart:653:7)',
        ),
      ),
    );
    await pumpChatScreen(tester, chatController: chatController);

    await sendText(tester, 'Are you free Thursday?');

    expect(
      find.text("We couldn't send your message right now. Please try again."),
      findsOneWidget,
    );
    expect(find.textContaining('StandardMethodCodec'), findsNothing);
    expect(find.textContaining('package:'), findsNothing);
    expect(find.textContaining('firebase_functions/'), findsNothing);
  });

  testWidgets(
      'an ambiguous code says nothing and leaves the message pending (MOB-32)',
      (tester) async {
    // 'cancelled' means we stopped waiting, not that the write failed — the
    // send may well have committed, so there is nothing true to report.
    final chatController = _FakeChatController(
      failSends: true,
      sendError: FirebaseFunctionsException(
        message: 'cancelled',
        code: 'cancelled',
      ),
    );
    await pumpChatScreen(tester, chatController: chatController);

    await sendText(tester, 'Are you free Thursday?');

    expect(find.byType(SnackBar), findsNothing);

    // The optimistic copy stays put, so its indicator can settle once
    // reconciliation runs, and the composer is not re-primed for a resend.
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.widgetWithText(TextField, 'Type a message…'))
          .controller
          ?.text,
      isEmpty,
    );

    // Nothing is left running when the screen goes.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'an ambiguous send whose copy never arrives ends as undelivered, not as '
      'a message that waits forever (MOB-32)', (tester) async {
    final chatController = _FakeChatController(
      failSends: true,
      sendError: FirebaseFunctionsException(
        message: 'cancelled',
        code: 'cancelled',
      ),
    );
    await pumpChatScreen(tester, chatController: chatController);

    await sendText(tester, 'Are you free Thursday?');

    // Still open, so still nothing claimed either way.
    expect(find.text('Not delivered'), findsNothing);

    // The server copy never comes. Before this, nothing retired a copy whose
    // id never arrives, so it sat there looking sent indefinitely.
    await tester.pump(const Duration(seconds: 16));

    expect(find.text('Not delivered'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('retrying an undelivered message reuses its id (MOB-32)',
      (tester) async {
    final chatController = _FakeChatController(
      failSends: true,
      sendError: FirebaseFunctionsException(
        message: 'cancelled',
        code: 'cancelled',
      ),
    );
    await pumpChatScreen(tester, chatController: chatController);

    await sendText(tester, 'Are you free Thursday?');
    await tester.pump(const Duration(seconds: 16));
    final originalId = chatController.sentMessageIds.single;

    chatController.failSends = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    // Same id, so a send that did commit the first time lands on the one
    // document instead of posting the message twice (MOB-31).
    expect(chatController.sentMessageIds, [originalId, originalId]);
    expect(find.text('Not delivered'), findsNothing);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'a timeout before the callable is reached is a definite failure, not an '
      'ambiguous send (MOB-32)', (tester) async {
    // Creating the chat runs before sendMessage, in the same try. A timeout
    // there means the callable was never invoked, whatever code came back.
    final chatController = _FakeChatController(
      createChatError: FirebaseFunctionsException(
        message: 'deadline-exceeded',
        code: 'deadline-exceeded',
      ),
    );
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<ChatController>.value(value: chatController),
          ChangeNotifierProvider<ConnectivityController>.value(
            value: _FakeConnectivityController(),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const ChatScreen(
            chatId: null,
            otherUserName: 'Taylor Tutor',
            receipientId: 'them',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await sendText(tester, 'Are you free Thursday?');

    // Reported as the failure it is, and the text comes back, rather than
    // waiting on a document that was never going to be written.
    expect(find.byType(SnackBar), findsOneWidget);
    expect(bubblesSaying('Are you free Thursday?'), findsNothing);
    expect(
      tester
          .widget<TextField>(
              find.widgetWithText(TextField, 'Are you free Thursday?'))
          .controller
          ?.text,
      'Are you free Thursday?',
    );

    await tester.pumpWidget(const SizedBox());
  });
}

Message _serverMessage({
  required String id,
  required String text,
  Map<String, Timestamp> readBy = const {},
}) {
  return Message(
    id: id,
    senderId: 'me',
    text: text,
    type: 'text',
    timestamp: Timestamp.fromDate(DateTime(2026, 8, 27, 9, 15)),
    readBy: readBy,
    isPending: false,
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
  _FakeChatController({
    this.failSends = false,
    this.sendError,
    this.createChatError,
  });

  bool failSends;

  /// What a failing send throws. Defaults to a plain error, which reads as a
  /// definite failure; MOB-32's ambiguous codes are passed in explicitly.
  final Object? sendError;

  /// Thrown by [createChatWithUser], which runs before the send callable is
  /// ever invoked.
  final Object? createChatError;

  /// Deliberately single-subscription: a second listen throws, so a screen that
  /// went back to rebuilding its stream would fail here rather than quietly.
  final StreamController<List<Message>> _messages =
      StreamController<List<Message>>();

  int getMessagesCalls = 0;
  final List<String> sentMessageIds = [];
  final List<Completer<void>> _pendingSends = [];

  void emitMessages(List<Message> messages) => _messages.add(messages);

  void completePendingSends() {
    for (final completer in _pendingSends) {
      if (!completer.isCompleted) completer.complete();
    }
    _pendingSends.clear();
  }

  @override
  void notifyListeners() => super.notifyListeners();

  @override
  String get userId => 'me';

  @override
  List<Chat> get chats => const [];

  @override
  Stream<List<Message>> getMessages(String chatId) {
    getMessagesCalls++;
    return _messages.stream;
  }

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
    sentMessageIds.add(messageId);
    if (failSends) {
      return Future.error(sendError ?? StateError('send failed'));
    }

    final completer = Completer<void>();
    _pendingSends.add(completer);
    return completer.future;
  }

  @override
  Future<String> createChatWithUser(String recipientId) async {
    if (createChatError != null) throw createChatError!;
    return 'chat-1';
  }

  @override
  Future<void> markMessagesAsRead(String chatId) async {}

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
