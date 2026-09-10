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
import 'package:tenacity/src/services/active_chat.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

/// MOB-31: a sent message was on screen twice — once as the optimistic copy and
/// once as the document the thread's snapshot had already delivered — for as
/// long as `sendChatMessage` took to finish its notification work and return.
///
/// MOB-36 moved the pending copy out of this screen and into [ChatOutbox], so
/// the reconciliation these tests cover now runs against the queue rather than
/// against a list that died with the widget.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ActiveChat.reset();
  });
  tearDown(ActiveChat.reset);

  /// One bubble carrying [text], counted by the widget that renders message
  /// bodies rather than by a text match, which would also see the composer.
  Finder bubblesSaying(String text) => find.byWidgetPredicate(
        (widget) => widget is Linkify && widget.text == text,
      );

  Future<void> pumpChatScreen(
    WidgetTester tester, {
    required _FakeChatController chatController,
    required ChatOutbox outbox,
    String? chatId = 'chat-1',
    String? recipientId,
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
          ChangeNotifierProvider<ChatOutbox>.value(value: outbox),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: ChatScreen(
            chatId: chatId,
            otherUserName: 'Taylor Tutor',
            receipientId: recipientId,
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
    // Bounded rather than settled: a send that keeps failing keeps rescheduling
    // itself, and pumpAndSettle would never return. This is long enough for the
    // queue to persist and make its first attempt, and short enough not to
    // reach the retry backoff.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// Lets the queue work through its retries, whose backoff the tests shorten
  /// to almost nothing.
  Future<void> settleRetries(WidgetTester tester) async {
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 1100));
    }
  }

  String composerText(WidgetTester tester) =>
      tester.widget<TextField>(find.byType(TextField)).controller?.text ?? '';

  testWidgets(
      'the server copy of a message arriving before the send returns replaces '
      'the optimistic copy instead of joining it (MOB-31)', (tester) async {
    final sends = _SendRecorder()..holdOpen = true;
    final outbox = _outbox(sends);
    final chatController = _FakeChatController();
    await pumpChatScreen(tester,
        chatController: chatController, outbox: outbox);

    await sendText(tester, 'Are you free Thursday?');

    // The queued copy, alone, while the send is in flight.
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
    expect(sends.sentIds, hasLength(1));

    // The thread delivers the committed message while the callable is still
    // doing its notification fan-out. This is the whole window the bug lived
    // in, and it is the send's own id that comes back.
    chatController.emitMessages([
      _serverMessage(id: sends.sentIds.single, text: 'Are you free Thursday?'),
    ]);
    await tester.pumpAndSettle();

    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);

    // ...and still one once the call finally returns.
    sends.completeAll();
    await tester.pumpAndSettle();

    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
  });

  testWidgets('a repeated snapshot does not bring the duplicate back',
      (tester) async {
    final sends = _SendRecorder()..holdOpen = true;
    final outbox = _outbox(sends);
    final chatController = _FakeChatController();
    await pumpChatScreen(tester,
        chatController: chatController, outbox: outbox);

    await sendText(tester, 'Are you free Thursday?');
    final messageId = sends.sentIds.single;

    chatController.emitMessages(
        [_serverMessage(id: messageId, text: 'Are you free Thursday?')]);
    await tester.pumpAndSettle();
    sends.completeAll();
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
    expect(outbox.entries, isEmpty);
  });

  testWidgets('send success before a snapshot survives reopening (MOB-49)',
      (tester) async {
    final sends = _SendRecorder()..holdOpen = true;
    final outbox = _outbox(sends);
    await pumpChatScreen(tester,
        chatController: _FakeChatController(), outbox: outbox);
    await sendText(tester, 'Still visible');
    final id = sends.sentIds.single;

    sends.completeAll();
    await tester.pumpAndSettle();
    expect(outbox.entries, isEmpty);
    expect(bubblesSaying('Still visible'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    final reopened = _FakeChatController();
    await pumpChatScreen(tester, chatController: reopened, outbox: outbox);
    expect(bubblesSaying('Still visible'), findsOneWidget);
    expect(composerText(tester), isEmpty);

    // Even an initial stale cache snapshot must not hide the local message.
    reopened.emitMessages([]);
    await tester.pumpAndSettle();
    expect(bubblesSaying('Still visible'), findsOneWidget);
    reopened.emitMessages([_serverMessage(id: id, text: 'Still visible')]);
    await tester.pumpAndSettle();
    expect(bubblesSaying('Still visible'), findsOneWidget);
    expect(outbox.visibleFor('chat-1'), isEmpty);
    expect(sends.sentIds, [id]);
    await tester.pumpWidget(const SizedBox());
    outbox.dispose();
  });

  testWidgets('the thread keeps one subscription across rebuilds',
      (tester) async {
    final outbox = _outbox(_SendRecorder()..holdOpen = true);
    final chatController = _FakeChatController();
    await pumpChatScreen(tester,
        chatController: chatController, outbox: outbox);

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
      'a failed send keeps the message queued instead of handing the text back '
      '(MOB-36)', (tester) async {
    final sends = _SendRecorder()..error = StateError('send failed');
    final outbox = _outbox(sends);
    await pumpChatScreen(tester,
        chatController: _FakeChatController(), outbox: outbox);

    await sendText(tester, 'Are you free Thursday?');
    await settleRetries(tester);

    // The queue owns it now. Putting the text back in the composer would be
    // inviting a second copy of a message that may well have committed.
    expect(outbox.entries, hasLength(1));
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
    expect(composerText(tester), isEmpty);
    // Retried under one id throughout, so nothing can be posted twice.
    expect(sends.sentIds.toSet(), hasLength(1));

    await tester.pumpWidget(const SizedBox());
    outbox.dispose();
  });

  testWidgets('a failing send says nothing while it is still retrying (MOB-36)',
      (tester) async {
    // 'cancelled' means we stopped waiting, not that the write failed — the
    // send may well have committed, so there is nothing true to report. Under
    // the queue that is no longer a special case: every failure is retried, so
    // none of them is announced.
    final sends = _SendRecorder()
      ..error = FirebaseFunctionsException(
        message: 'cancelled',
        code: 'cancelled',
      );
    final outbox = _outbox(sends);
    await pumpChatScreen(tester,
        chatController: _FakeChatController(), outbox: outbox);

    await sendText(tester, 'Are you free Thursday?');

    expect(find.byType(SnackBar), findsNothing);
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
    expect(composerText(tester), isEmpty);

    await tester.pumpWidget(const SizedBox());
    outbox.dispose();
  });

  testWidgets(
      'a message that keeps failing ends as undelivered, not as one that waits '
      'forever (MOB-32)', (tester) async {
    final sends = _SendRecorder()
      ..error = FirebaseFunctionsException(
        message: 'cancelled',
        code: 'cancelled',
      );
    final outbox = _outbox(sends);
    await pumpChatScreen(tester,
        chatController: _FakeChatController(), outbox: outbox);

    await sendText(tester, 'Are you free Thursday?');

    // One failure is not an outcome, so nothing is claimed yet.
    expect(find.text('Not delivered'), findsNothing);

    await settleRetries(tester);

    expect(find.text('Not delivered'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    outbox.dispose();
  });

  testWidgets('retrying an undelivered message reuses its id (MOB-32)',
      (tester) async {
    final sends = _SendRecorder()
      ..error = FirebaseFunctionsException(
        message: 'cancelled',
        code: 'cancelled',
      );
    final outbox = _outbox(sends);
    await pumpChatScreen(tester,
        chatController: _FakeChatController(), outbox: outbox);

    await sendText(tester, 'Are you free Thursday?');
    await settleRetries(tester);
    final originalId = sends.sentIds.first;

    sends.error = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    // Same id throughout, so a send that did commit the first time lands on
    // the one document instead of posting the message twice (MOB-31).
    expect(sends.sentIds.toSet(), {originalId});
    expect(find.text('Not delivered'), findsNothing);
    expect(outbox.entries, isEmpty);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'leaving mid-send and coming back neither restores the text nor sends it '
      'twice (MOB-36)', (tester) async {
    final sends = _SendRecorder()..holdOpen = true;
    final outbox = _outbox(sends);
    await pumpChatScreen(tester,
        chatController: _FakeChatController(), outbox: outbox);

    await sendText(tester, 'Are you free Thursday?');
    expect(sends.sentIds, hasLength(1));

    // Swipe out of the thread while the send is still in flight, then come
    // back to it. This is the exact sequence MOB-36 was reported from.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await pumpChatScreen(tester,
        chatController: _FakeChatController(), outbox: outbox);

    // The composer is empty: the text lives in the queue, not in a draft that
    // outlived the send and re-primed the composer for a duplicate.
    expect(composerText(tester), isEmpty);
    // And the message is still on screen, because the queue outlived the
    // screen that started it.
    expect(bubblesSaying('Are you free Thursday?'), findsOneWidget);
    expect(outbox.entries, hasLength(1));
    expect(sends.sentIds, hasLength(1));
  });

  testWidgets(
      'a failure before anything is queued reports itself without the '
      'exception behind it (MOB-32)', (tester) async {
    // The exact shape that put frames on screen: a FirebaseException whose
    // toString() appends its stack trace. Creating the chat runs before
    // anything is queued, so this is the one path that still reports.
    final chatController = _FakeChatController(
      createChatError: FirebaseException(
        plugin: 'firebase_functions',
        code: 'unknown',
        message: 'internal',
        stackTrace: StackTrace.fromString(
          '#0      StandardMethodCodec.decodeEnvelope '
          '(package:flutter/src/services/message_codecs.dart:653:7)',
        ),
      ),
    );
    await pumpChatScreen(
      tester,
      chatController: chatController,
      outbox: _outbox(_SendRecorder()),
      chatId: null,
      recipientId: 'them',
    );

    await sendText(tester, 'Are you free Thursday?');

    expect(
      find.text("We couldn't send your message right now. Please try again."),
      findsOneWidget,
    );
    expect(find.textContaining('StandardMethodCodec'), findsNothing);
    expect(find.textContaining('package:'), findsNothing);

    // Nothing was queued, so the text is still the user's to resend.
    expect(composerText(tester), 'Are you free Thursday?');

    await tester.pumpWidget(const SizedBox());
  });
}

/// A queue wired to [sends], with its backoff shortened so retries can be
/// pumped through in a test rather than waited out.
ChatOutbox _outbox(_SendRecorder sends) {
  final outbox = ChatOutbox(
    send: sends.call,
    // Slow enough that a single pump does not trip a retry, fast enough to
    // drive several by hand. A test that leaves the queue still retrying has
    // to dispose it before it ends, or the pending retry timer fails the
    // framework's own end-of-test check.
    backoff: (_) => const Duration(seconds: 1),
  );
  // The screen's own user. A queue that does not know who is signed in sends
  // nothing and shows nothing, because entries are bound to their sender.
  outbox.setUser('me');
  return outbox;
}

/// Stands in for the callable, recording what the queue asked it to send.
class _SendRecorder {
  final List<String> sentIds = [];

  /// What every send throws, or null to let them succeed.
  Object? error;

  /// Whether sends hang until [completeAll], standing in for a callable that
  /// has committed but not yet finished its notification fan-out.
  bool holdOpen = false;

  final List<Completer<void>> _pending = [];

  Future<void> call(OutboxEntry entry) {
    sentIds.add(entry.id);
    final failure = error;
    if (failure != null) return Future.error(failure);
    if (!holdOpen) return Future.value();

    final completer = Completer<void>();
    _pending.add(completer);
    return completer.future;
  }

  void completeAll() {
    for (final completer in _pending) {
      if (!completer.isCompleted) completer.complete();
    }
    _pending.clear();
  }
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
  final _histories = <String, ChatHistory>{};
  @override
  ChatHistory historyFor(String chatId) =>
      _histories.putIfAbsent(chatId, ChatHistory.new);

  _FakeChatController({this.createChatError});

  /// Thrown by [createChatWithUser], which runs before anything is queued.
  final Object? createChatError;

  /// Deliberately single-subscription: a second listen throws, so a screen that
  /// went back to rebuilding its stream would fail here rather than quietly.
  final StreamController<List<Message>> _messages =
      StreamController<List<Message>>();

  int getMessagesCalls = 0;

  void emitMessages(List<Message> messages) => _messages.add(messages);

  @override
  void notifyListeners() => super.notifyListeners();

  @override
  String get userId => 'me';

  @override
  List<Chat> get chats => const [];

  @override
  Stream<List<Message>> getMessages(String chatId, {int? limit}) {
    getMessagesCalls++;
    return _messages.stream;
  }

  @override
  Future<String> createChatWithUser(String recipientId) async {
    if (createChatError != null) throw createChatError!;
    return 'chat-1';
  }

  @override
  Future<void> markMessagesAsRead(String chatId,
      {List<String> legacyReadByIds = const []}) async {}

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
