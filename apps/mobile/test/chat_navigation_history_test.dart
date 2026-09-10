import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_linkify/flutter_linkify.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/services/active_chat.dart';
import 'package:tenacity/src/services/chat_outbox.dart';
import 'package:tenacity/src/services/chat_service.dart';
import 'package:tenacity/src/ui/chat_screen.dart';
import 'package:tenacity/src/ui/inbox_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    GoogleFonts.config.allowRuntimeFetching = false;
    ActiveChat.reset();
  });
  tearDown(ActiveChat.reset);

  for (final finishSend in [false, true]) {
    testWidgets(
        'swipe back and reopen preserves received history '
        '(send complete: $finishSend)', (tester) async {
      final service = _Service();
      addTearDown(service.close);
      final chats = ChatController(userId: 'me', chatService: service);
      final gate = Completer<void>();
      final sent = <OutboxEntry>[];
      final outbox = ChatOutbox(send: (entry) {
        sent.add(entry);
        return gate.future;
      })
        ..setUser('me');
      await _pumpInbox(tester, chats, outbox);
      await tester.tap(find.text('Taylor Tutor'));
      await tester.pump();
      service.latest.add(_history);
      await tester.pumpAndSettle();
      expect(_bubble('Earlier from Taylor'), findsOneWidget);
      expect(_bubble('My earlier reply'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'Still sending');
      await tester.tap(find.widgetWithIcon(IconButton, Icons.send));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(_bubble('Still sending'), findsOneWidget);

      // Use the actual iOS back gesture and the actual inbox route.
      await tester.timedDragFrom(const Offset(1, 300), const Offset(380, 0),
          const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(find.byType(ChatScreen), findsNothing);
      expect(find.text('Still sending'), findsOneWidget);
      if (finishSend) {
        gate.complete();
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('Taylor Tutor'));
      await tester.pumpAndSettle();

      // The reopened subscription deliberately has emitted NOTHING. Earlier
      // tests only asserted the outgoing bubble, and missed losing all history.
      expect(service.streams, hasLength(2));
      expect(_bubble('Earlier from Taylor'), findsOneWidget);
      expect(_bubble('My earlier reply'), findsOneWidget);
      expect(_bubble('Still sending'), findsOneWidget);
      expect(sent, hasLength(1));

      // A slow or failed refresh must keep the same conversation on screen.
      service.latest.addError(StateError('network temporarily unavailable'));
      await tester.pumpAndSettle();
      expect(_bubble('Earlier from Taylor'), findsOneWidget);
      expect(_bubble('My earlier reply'), findsOneWidget);
      expect(_bubble('Still sending'), findsOneWidget);

      await tester.tap(find.text('Retry loading'));
      await tester.pumpAndSettle();
      expect(service.streams, hasLength(3));
      expect(_bubble('Earlier from Taylor'), findsOneWidget);
      expect(_bubble('My earlier reply'), findsOneWidget);
      expect(_bubble('Still sending'), findsOneWidget);

      service.latest.add([
        _message(sent.single.id, 'Still sending', sender: 'me'),
        ..._history,
      ]);
      await tester.pumpAndSettle();
      expect(_bubble('Still sending'), findsOneWidget);
      expect(_bubble('Earlier from Taylor'), findsOneWidget);
      if (!finishSend) gate.complete();
      await tester.pumpAndSettle();
      await tester.timedDragFrom(const Offset(1, 300), const Offset(380, 0),
          const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Taylor Tutor'));
      await tester.pumpAndSettle();
      expect(_bubble('Still sending'), findsOneWidget);
      expect(_bubble('Earlier from Taylor'), findsOneWidget);
      expect(_bubble('My earlier reply'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      chats.dispose();
      outbox.dispose();
    });
  }

  testWidgets(
      'pending-only threads show history loading and never page '
      'from the outgoing message', (tester) async {
    final service = _Service();
    addTearDown(service.close);
    final chats = ChatController(userId: 'me', chatService: service);
    final outbox = ChatOutbox(send: (_) => Completer<void>().future)
      ..setUser('me');
    await outbox.enqueueMessage(
        id: 'pending', chatId: 'chat-1', senderId: 'me', text: 'Waiting');
    await _pumpInbox(tester, chats, outbox);
    await tester.tap(find.text('Taylor Tutor'));
    await tester.pumpAndSettle();
    expect(_bubble('Waiting'), findsOneWidget);
    expect(find.text('Loading earlier messages…'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, 500));
    await tester.pumpAndSettle();
    expect(service.pageCalls, 0);
    service.latest.add(_history);
    await tester.pumpAndSettle();
    expect(find.text('Loading earlier messages…'), findsNothing);
    expect(_bubble('Earlier from Taylor'), findsOneWidget);
    expect(_bubble('Waiting'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    chats.dispose();
    outbox.dispose();
  });

  testWidgets('a late older page cannot resurrect cleared history',
      (tester) async {
    final gate = Completer<List<Message>>();
    final service = _Service()..pageResult = gate.future;
    addTearDown(service.close);
    final chats = ChatController(userId: 'me', chatService: service);
    final outbox = ChatOutbox();
    await _pumpInbox(tester, chats, outbox);
    await tester.tap(find.text('Taylor Tutor'));
    await tester.pump();
    service.latest.add([
      for (var i = 0; i < 40; i++) _message('m-$i', 'Earlier message $i'),
    ]);
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, 2000));
    await tester.pumpAndSettle();
    expect(service.pageCalls, 1);

    service.latest.add([]);
    await tester.pumpAndSettle();
    gate.complete([_message('private-old', 'Cleared message')]);
    await tester.pumpAndSettle();
    expect(_bubble('Cleared message'), findsNothing);
    expect(chats.historyFor('chat-1').older, isEmpty);
    expect(chats.historyFor('chat-1').latest, isEmpty);
    await tester.pumpWidget(const SizedBox());
    chats.dispose();
    outbox.dispose();
  });
}

Finder _bubble(String text) => find
    .byWidgetPredicate((widget) => widget is Linkify && widget.text == text);

final _history = [
  _message('old-2', 'My earlier reply', sender: 'me'),
  _message('old-1', 'Earlier from Taylor'),
];

Message _message(String id, String text, {String sender = 'them'}) => Message(
      id: id,
      senderId: sender,
      text: text,
      type: 'text',
      timestamp: Timestamp.fromDate(DateTime(2026, 9, 10, 9)),
      readBy: const {},
    );

final _chat = Chat(
  id: 'chat-1',
  participants: const ['me', 'them'],
  lastMessage: 'My earlier reply',
  updatedAt: Timestamp.fromDate(DateTime(2026, 9, 10, 9)),
  unreadCounts: const {},
  deletedFor: const {},
  typingStatus: const {},
);

Future<void> _pumpInbox(
    WidgetTester tester, ChatController chats, ChatOutbox outbox) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MultiProvider(
    providers: [
      ChangeNotifierProvider<ChatController>.value(value: chats),
      ChangeNotifierProvider<ChatOutbox>.value(value: outbox),
      ChangeNotifierProvider<AuthController>(create: (_) => _Auth()),
      ChangeNotifierProvider<ConnectivityController>(
          create: (_) => _Connectivity()),
    ],
    child: MaterialApp(
      theme: AppTheme.light.copyWith(platform: TargetPlatform.iOS),
      navigatorObservers: [chatRouteObserver],
      home: const InboxScreen(),
    ),
  ));
  await tester.pumpAndSettle();
}

class _Service implements ChatService {
  final streams = <StreamController<List<Message>>>[];
  int pageCalls = 0;
  Future<List<Message>>? pageResult;
  StreamController<List<Message>> get latest => streams.last;

  @override
  Stream<List<Message>> getMessages(String chatId, String userId,
      {int limit = ChatService.messagePageSize}) {
    final stream = StreamController<List<Message>>();
    streams.add(stream);
    return stream.stream;
  }

  @override
  Stream<List<Chat>> getUserChats(String userId) => Stream.value([_chat]);
  @override
  Stream<Chat?> watchChat(String chatId) => Stream.value(_chat);
  @override
  Future<void> markMessagesAsRead(String chatId, String userId,
      {List<String> legacyReadByIds = const []}) async {}
  @override
  Future<void> updateTypingStatus(
      String chatId, String userId, bool value) async {}
  @override
  Future<List<Message>> fetchMessagesBefore(
      {required String chatId,
      required String userId,
      required Timestamp before,
      required String beforeId,
      int limit = ChatService.messagePageSize}) async {
    pageCalls++;
    return pageResult ?? [];
  }

  Future<void> close() async {
    for (final stream in streams) {
      await stream.close();
    }
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Auth extends ChangeNotifier implements AuthController {
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
      activeChats: const []);
  @override
  Future<String> fetchUserNameById(String userId) async => 'Taylor Tutor';
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Connectivity extends ChangeNotifier implements ConnectivityController {
  @override
  bool get isOnline => true;
  @override
  bool get isOffline => false;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
