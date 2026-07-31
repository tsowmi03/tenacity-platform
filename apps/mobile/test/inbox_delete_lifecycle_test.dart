import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:tenacity/src/controllers/auth_controller.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/controllers/connectivity_controller.dart';
import 'package:tenacity/src/models/app_user_model.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/ui/inbox_screen.dart';
import 'package:tenacity/src/ui/theme/app_theme.dart';

void main() {
  testWidgets('dismiss waits for a successful delete', (tester) async {
    final gate = Completer<void>();
    final chats = _FakeChatController(deleteGate: gate);
    await _pumpInbox(tester, chats);

    await _startDelete(tester);
    await tester.tap(find.byKey(const Key('app-confirmation-confirm')));
    await tester.pump();

    expect(chats.deleteCalls, 1);
    expect(find.byKey(const Key('chat-1')), findsOneWidget);

    gate.complete();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('chat-1')), findsNothing);
  });

  testWidgets('rejected delete keeps the conversation visible', (tester) async {
    final chats = _FakeChatController(deleteError: StateError('denied'));
    await _pumpInbox(tester, chats);

    await _startDelete(tester);
    await tester.tap(find.byKey(const Key('app-confirmation-confirm')));
    await tester.pumpAndSettle();

    expect(chats.deleteCalls, 1);
    expect(find.byKey(const Key('chat-1')), findsOneWidget);
    expect(
      find.text('The conversation could not be deleted. Please try again.'),
      findsOneWidget,
    );
  });
}

Future<void> _pumpInbox(
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
        ChangeNotifierProvider<AuthController>.value(
          value: _FakeAuthController(),
        ),
        ChangeNotifierProvider<ConnectivityController>.value(
          value: _FakeConnectivityController(),
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

Future<void> _startDelete(WidgetTester tester) async {
  await tester.drag(find.byType(Dismissible), const Offset(-360, 0));
  await tester.pumpAndSettle();
  expect(find.text('Delete this conversation?'), findsOneWidget);
}

class _FakeChatController extends ChangeNotifier implements ChatController {
  _FakeChatController({this.deleteGate, this.deleteError});

  final Completer<void>? deleteGate;
  final Object? deleteError;
  int deleteCalls = 0;
  List<Chat> _chats = [
    Chat(
      id: 'chat-1',
      participants: const ['me', 'other'],
      lastMessage: 'See you Monday',
      updatedAt: Timestamp.fromDate(DateTime(2026, 7, 29, 10)),
      unreadCounts: const {'me': 1},
      deletedFor: const {},
      typingStatus: const {},
    ),
  ];

  @override
  List<Chat> get chats => _chats;

  @override
  void loadChats() {}

  @override
  Future<void> deleteChatForUser(String chatId) async {
    deleteCalls++;
    await deleteGate?.future;
    if (deleteError case final error?) throw error;
    _chats = [];
    notifyListeners();
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
