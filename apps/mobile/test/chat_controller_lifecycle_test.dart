import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/models/chat_model.dart';
import 'package:tenacity/src/services/chat_service.dart';

void main() {
  group('ChatController.forUser', () {
    test('keeps the loaded inbox when the signed-in user has not changed',
        () async {
      // MOB-20: the provider ran this on every `AuthController` notification —
      // a refreshed user document, an announcement marked read — and each one
      // used to hand back an empty controller. The inbox screen stays alive in
      // the tab shell, so nothing reloaded it and the messages simply vanished.
      final service = _FakeChatService();
      final controller = ChatController(chatService: service, userId: 'me');
      controller.loadChats();
      service.emit([_chat('chat-1')]);
      await Future<void>.delayed(Duration.zero);

      final resolved = ChatController.forUser(controller, 'me');

      expect(identical(resolved, controller), isTrue);
      expect(resolved.chats.map((chat) => chat.id), ['chat-1']);
      expect(service.hasListener, isTrue);
    });

    test('clears the inbox when a different user signs in', () async {
      final service = _FakeChatService();
      final controller = ChatController(chatService: service, userId: 'me');
      controller.loadChats();
      service.emit([_chat('chat-1')]);
      await Future<void>.delayed(Duration.zero);
      expect(controller.chats, isNotEmpty);

      final resolved = ChatController.forUser(controller, 'someone-else');

      expect(identical(resolved, controller), isTrue);
      expect(resolved.userId, 'someone-else');
      expect(resolved.chats, isEmpty);
      // The previous user's chats are no longer readable, so the subscription
      // must not outlive them.
      expect(service.hasListener, isFalse);
    });

    test('signing out drops the subscription', () {
      final service = _FakeChatService();
      final controller = ChatController(chatService: service, userId: 'me');
      controller.loadChats();

      ChatController.forUser(controller, '');

      expect(controller.userId, '');
      expect(service.hasListener, isFalse);
    });

    test('builds a controller when there is nothing to reuse', () {
      final service = _FakeChatService();

      final resolved = ChatController.forUser(
        null,
        'me',
        createService: () => service,
      );

      expect(resolved.userId, 'me');
      expect(resolved.chats, isEmpty);
    });
  });

  group('ChatController subscriptions', () {
    test('reloading replaces the previous listener rather than adding one', () {
      final service = _FakeChatService();
      final controller = ChatController(chatService: service, userId: 'me');

      controller.loadChats();
      controller.loadChats();
      controller.loadChats();

      expect(service.streamsRequested, 3);
      expect(service.liveListeners, 1);
    });

    test('disposing cancels the listener', () {
      final service = _FakeChatService();
      final controller = ChatController(chatService: service, userId: 'me');
      controller.loadChats();

      controller.dispose();

      expect(service.hasListener, isFalse);
    });

    test('a failed stream stops the loading state', () async {
      final service = _FakeChatService();
      final controller = ChatController(chatService: service, userId: 'me');
      controller.loadChats();
      expect(controller.isLoading, isTrue);

      service.emitError(StateError('permission denied'));
      await Future<void>.delayed(Duration.zero);

      expect(controller.isLoading, isFalse);
    });
  });
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

/// Hands out a fresh broadcast stream per call, so the controller's handling of
/// repeated [ChatController.loadChats] calls is observable.
class _FakeChatService implements ChatService {
  final List<StreamController<List<Chat>>> _controllers = [];

  int get streamsRequested => _controllers.length;
  int get liveListeners =>
      _controllers.where((controller) => controller.hasListener).length;
  bool get hasListener => liveListeners > 0;

  void emit(List<Chat> chats) => _controllers.last.add(chats);
  void emitError(Object error) => _controllers.last.addError(error);

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
