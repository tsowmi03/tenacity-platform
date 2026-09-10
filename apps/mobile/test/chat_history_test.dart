import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tenacity/src/controllers/chat_controller.dart';
import 'package:tenacity/src/models/message_model.dart';
import 'package:tenacity/src/services/chat_service.dart';

void main() {
  test('reopening retains the live window and previously loaded pages',
      () async {
    final service = _Service();
    final controller = ChatController(userId: 'me', chatService: service);
    final first = controller.getMessages('chat').listen((_) {});
    service.streams.last.add([_message(4), _message(3)]);
    await pumpEventQueue();
    final history = controller.historyFor('chat');
    history.addOlderPage([_message(2), _message(1)]);
    history.addOlderPage([]);
    await first.cancel();

    final reopened = controller.getMessages('chat').listen((_) {});
    expect(controller.historyFor('chat'), same(history));
    expect(history.latest!.map((m) => m.id), ['4', '3']);
    expect(history.older.map((m) => m.id), ['2', '1']);
    expect(history.reachedStart, isTrue);
    service.streams.last.add([_message(4), _message(3)]);
    await pumpEventQueue();
    expect(history.older.map((m) => m.id), ['2', '1']);
    await reopened.cancel();
    controller.dispose();
  });

  test('a full live window shifts into history without losing boundary rows',
      () {
    final history = ChatHistory();
    history.receiveLatest([_message(3), _message(2)], pageSize: 2);
    history.addOlderPage([_message(2), _message(1)]);
    history.receiveLatest([_message(4), _message(3)], pageSize: 2);
    expect(history.latest!.map((m) => m.id), ['4', '3']);
    expect(history.older.map((m) => m.id), ['2', '1']);
    history.receiveLatest([_message(4), _message(2)], pageSize: 2);
    expect(history.latest!.map((m) => m.id), ['4', '2']);
    expect(history.older.map((m) => m.id), ['1']);
  });

  test('timestamp ties use the same descending ID order as pagination', () {
    final history = ChatHistory();
    final a = _message(1, id: 'a');
    final b = _message(1, id: 'b');
    final c = _message(1, id: 'c');
    history.receiveLatest([a, b], pageSize: 2);
    history.receiveLatest([b, c], pageSize: 2);
    expect(history.latest!.map((m) => m.id), ['c', 'b']);
    expect(history.older.map((m) => m.id), ['a']);
  });

  test('a fresh empty result removes both live and paged history', () {
    final history = ChatHistory();
    history.receiveLatest([_message(2)], pageSize: 50);
    history.addOlderPage([_message(1)]);
    history.receiveLatest([], pageSize: 50);
    expect(history.latest, isEmpty);
    expect(history.older, isEmpty);
  });

  test('late callbacks cannot restore another account or a previous session',
      () async {
    final service = _Service();
    final controller = ChatController(userId: 'me', chatService: service);
    final events = <List<Message>>[];
    final subscription = controller.getMessages('chat').listen(events.add);
    final oldStream = service.streams.last;
    oldStream.add([_message(1)]);
    await pumpEventQueue();
    controller.updateUser('other');
    expect(controller.historyFor('chat').latest, isNull);
    oldStream.add([_message(2)]);
    await pumpEventQueue();
    expect(events, hasLength(1));
    expect(controller.historyFor('chat').latest, isNull);
    controller.updateUser('me');
    oldStream.add([_message(3)]);
    await pumpEventQueue();
    expect(events, hasLength(1));
    expect(controller.historyFor('chat').latest, isNull);
    await subscription.cancel();
    controller.dispose();
  });

  test('transient errors preserve history but revoked access clears it',
      () async {
    final service = _Service();
    final controller = ChatController(userId: 'me', chatService: service);
    final errors = <Object>[];
    final subscription =
        controller.getMessages('chat').listen((_) {}, onError: errors.add);
    service.streams.last.add([_message(2)]);
    await pumpEventQueue();
    final history = controller.historyFor('chat');
    history.addOlderPage([_message(1)]);
    service.streams.last.addError(
        FirebaseException(plugin: 'cloud_firestore', code: 'unavailable'));
    await pumpEventQueue();
    expect(history.latest, hasLength(1));
    expect(history.older, hasLength(1));
    service.streams.last.addError(FirebaseException(
        plugin: 'cloud_firestore', code: 'permission-denied'));
    await pumpEventQueue();
    expect(history.latest, isEmpty);
    expect(history.older, isEmpty);
    expect(errors, hasLength(2));
    await subscription.cancel();
    controller.dispose();
  });

  test('deletion invalidates history and ignores the old subscription',
      () async {
    final service = _Service();
    final controller = ChatController(userId: 'me', chatService: service);
    final subscription = controller.getMessages('chat').listen((_) {});
    service.streams.last.add([_message(1)]);
    await pumpEventQueue();
    final previous = controller.historyFor('chat');
    await controller.deleteChatForUser('chat');
    service.streams.last.add([_message(2)]);
    await pumpEventQueue();
    final current = controller.historyFor('chat');
    expect(current, isNot(same(previous)));
    expect(current.latest, isNull);
    await subscription.cancel();
    controller.dispose();
  });

  test('the least recently visited history is evicted when the cache fills',
      () {
    final controller = ChatController(userId: 'me', chatService: _Service());
    final retained = controller.historyFor('keep');
    final evicted = controller.historyFor('evict');
    for (var i = 0; i < 18; i++) {
      controller.historyFor('$i');
    }
    controller.historyFor('keep');
    controller.historyFor('new');
    expect(controller.historyFor('keep'), same(retained));
    expect(controller.historyFor('evict'), isNot(same(evicted)));
    controller.dispose();
  });
}

Message _message(int second, {String? id}) => Message(
      id: id ?? '$second',
      senderId: 'them',
      text: 'Message $second',
      type: 'text',
      timestamp: Timestamp.fromDate(DateTime(2026, 9, 10, 9, 0, second)),
      readBy: const {},
    );

class _Service implements ChatService {
  final streams = <StreamController<List<Message>>>[];
  @override
  Stream<List<Message>> getMessages(String chatId, String userId,
      {int limit = ChatService.messagePageSize}) {
    final stream = StreamController<List<Message>>();
    streams.add(stream);
    addTearDown(stream.close);
    return stream.stream;
  }

  @override
  Future<void> deleteChatForUser(String chatId, String userId) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
