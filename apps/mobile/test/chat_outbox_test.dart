import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tenacity/src/services/chat_outbox.dart';

/// MOB-36: a send used to live in widget state, so leaving the thread lost the
/// record of it while the draft still held the text — and sending again minted
/// a new id, which the server had no way to recognise as the same message.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('durability', () {
    test('a message is on disk before the send is even attempted', () async {
      List<String>? storedWhenSendRan;
      final outbox = ChatOutbox(send: (entry) async {
        final prefs = await SharedPreferences.getInstance();
        storedWhenSendRan = prefs.getStringList('chat_outbox_v1');
      });

      await outbox.enqueueMessage(
        id: 'm-1',
        chatId: 'c-1',
        text: 'Are you free Thursday?',
      );
      await pumpEventQueue();

      // The whole point: by the time anything touches the network, losing the
      // process cannot lose the message.
      expect(storedWhenSendRan, isNotNull);
      expect(storedWhenSendRan, hasLength(1));
      expect(storedWhenSendRan!.single, contains('m-1'));

      outbox.dispose();
    });

    test('a queue restored from disk sends what the last session did not',
        () async {
      // Session one: the send never answers, so the entry outlives it.
      final firstSession = ChatOutbox(send: (_) => Completer<void>().future);
      await firstSession.enqueueMessage(
        id: 'm-1',
        chatId: 'c-1',
        text: 'Still unsent',
      );
      firstSession.dispose();

      // Session two: a new queue over the same storage, as after a restart.
      final sent = <OutboxEntry>[];
      final secondSession = ChatOutbox(send: (entry) async => sent.add(entry));
      await secondSession.load();
      await pumpEventQueue();

      expect(sent.map((entry) => entry.id), ['m-1']);
      expect(sent.single.text, 'Still unsent');
      // Replayed under its original id, so a send that did commit last session
      // lands on the same document instead of posting a second message.
      expect(secondSession.entries, isEmpty);

      secondSession.dispose();
    });
  });

  group('ordering', () {
    test('one chat sends in the order the messages were composed', () async {
      final attempted = <String>[];
      final gates = <Completer<void>>[];
      final outbox = ChatOutbox(send: (entry) {
        attempted.add(entry.id);
        final gate = Completer<void>();
        gates.add(gate);
        return gate.future;
      });

      await outbox.enqueueMessage(id: 'a', chatId: 'c-1', text: 'first');
      await outbox.enqueueMessage(id: 'b', chatId: 'c-1', text: 'second');
      await outbox.enqueueMessage(id: 'c', chatId: 'c-1', text: 'third');
      await pumpEventQueue();

      // Only one in flight. Sending them together would be faster and wrong:
      // the server stamps messages as they arrive, so parallel sends land in a
      // different order from the one they were typed in.
      expect(attempted, ['a']);

      gates[0].complete();
      await pumpEventQueue();
      expect(attempted, ['a', 'b']);

      gates[1].complete();
      await pumpEventQueue();
      expect(attempted, ['a', 'b', 'c']);

      gates[2].complete();
      await pumpEventQueue();
      expect(outbox.entries, isEmpty);

      outbox.dispose();
    });

    test('a chat that cannot send does not hold up a different chat', () async {
      final sent = <String>[];
      final outbox = ChatOutbox(
        send: (entry) async {
          if (entry.chatId == 'stuck-chat') throw StateError('no route');
          sent.add(entry.id);
        },
        backoff: (_) => const Duration(hours: 1),
      );

      await outbox.enqueueMessage(id: 'stuck', chatId: 'stuck-chat', text: 'x');
      await outbox.enqueueMessage(id: 'fine', chatId: 'other-chat', text: 'y');
      await pumpEventQueue();

      expect(sent, ['fine']);
      expect(outbox.pendingFor('stuck-chat'), hasLength(1));
      expect(outbox.pendingFor('other-chat'), isEmpty);

      outbox.dispose();
    });
  });

  group('connectivity', () {
    test('an offline queue accepts messages and flushes on reconnect',
        () async {
      final sent = <String>[];
      final outbox = ChatOutbox(send: (entry) async => sent.add(entry.id));
      outbox.setOnline(false);

      await outbox.enqueueMessage(
        id: 'm-1',
        chatId: 'c-1',
        text: 'Composed on the train',
      );
      await pumpEventQueue();

      // Accepted, not refused. Blocking the send offline is what the queue
      // exists to stop.
      expect(sent, isEmpty);
      expect(outbox.pendingFor('c-1'), hasLength(1));

      outbox.setOnline(true);
      await pumpEventQueue();

      expect(sent, ['m-1']);
      expect(outbox.entries, isEmpty);

      outbox.dispose();
    });
  });

  group('retries', () {
    test('a failing message is marked undelivered only after several attempts',
        () async {
      var failures = 0;
      final outbox = ChatOutbox(
        send: (_) async {
          failures++;
          throw StateError('still failing');
        },
        backoff: (_) => const Duration(milliseconds: 1),
      );

      await outbox.enqueueMessage(id: 'm-1', chatId: 'c-1', text: 'Hello');
      await pumpEventQueue();

      // One failure is a hiccup, not an outcome.
      expect(outbox.entries.single.isUndelivered, isFalse);

      for (var i = 0; i < 6 && !outbox.entries.single.isUndelivered; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
        await pumpEventQueue();
      }

      expect(outbox.entries.single.isUndelivered, isTrue);
      expect(failures, greaterThanOrEqualTo(3));
      // Still queued, and still under its original id: undelivered is what the
      // user is told, not a decision to stop trying.
      expect(outbox.entries.single.id, 'm-1');

      outbox.dispose();
    });

    test('retrying by hand clears the undelivered state and sends again',
        () async {
      var shouldFail = true;
      final attempts = <String>[];
      final outbox = ChatOutbox(
        send: (entry) async {
          attempts.add(entry.id);
          if (shouldFail) throw StateError('nope');
        },
        backoff: (_) => const Duration(hours: 1),
      );

      await outbox.enqueueMessage(id: 'm-1', chatId: 'c-1', text: 'Hello');
      await pumpEventQueue();
      expect(outbox.entries, hasLength(1));

      shouldFail = false;
      await outbox.retryNow('m-1');
      await pumpEventQueue();

      expect(attempts, ['m-1', 'm-1']);
      expect(outbox.entries, isEmpty);

      outbox.dispose();
    });
  });

  group('reconciliation', () {
    test('confirming a message the thread already shows removes it', () async {
      final outbox = ChatOutbox(send: (_) => Completer<void>().future);
      await outbox.enqueueMessage(id: 'm-1', chatId: 'c-1', text: 'Hello');
      expect(outbox.pendingFor('c-1'), hasLength(1));

      // The server's copy comes down the thread's snapshot about a second
      // before the send call answers, so this is normally what retires an
      // entry rather than the send itself.
      await outbox.confirm('m-1');

      expect(outbox.pendingFor('c-1'), isEmpty);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getStringList('chat_outbox_v1'), isEmpty);

      outbox.dispose();
    });

    test('discarding drops the message without sending it', () async {
      final sent = <String>[];
      final outbox = ChatOutbox(
        send: (entry) async => sent.add(entry.id),
        backoff: (_) => const Duration(hours: 1),
      );
      outbox.setOnline(false);

      await outbox.enqueueMessage(id: 'm-1', chatId: 'c-1', text: 'Hello');
      await outbox.discard('m-1');
      outbox.setOnline(true);
      await pumpEventQueue();

      expect(sent, isEmpty);
      expect(outbox.entries, isEmpty);

      outbox.dispose();
    });
  });

  group('stored rows', () {
    test('a row survives a round trip', () {
      final entry = OutboxEntry(
        id: 'm-1',
        chatId: 'c-1',
        createdAt: DateTime(2026, 9, 1, 10, 30),
        text: 'Are you free Thursday?',
        recipientId: 'them',
        attempts: 2,
      );

      final restored = OutboxEntry.tryDecode(entry.encode())!;

      expect(restored.id, entry.id);
      expect(restored.chatId, entry.chatId);
      expect(restored.text, entry.text);
      expect(restored.recipientId, entry.recipientId);
      expect(restored.attempts, entry.attempts);
      expect(restored.createdAt, entry.createdAt);
    });

    test('an unreadable row is discarded rather than thrown', () {
      // One bad row must cost the user that message, not the rest of the queue
      // behind it — so decoding answers null instead of throwing.
      expect(OutboxEntry.tryDecode('{ not json at all'), isNull);
      expect(OutboxEntry.tryDecode(jsonEncode({'id': 'm-1'})), isNull);
      expect(
        OutboxEntry.tryDecode(jsonEncode({
          'id': 'm-1',
          'chatId': 'c-1',
          'createdAt': 'not a date',
        })),
        isNull,
      );
    });

    test('a kind this build does not understand is skipped', () {
      // Forward compatibility for MOB-41, which puts read watermarks through
      // the same queue: an older build must skip them, not fall over.
      expect(
        OutboxEntry.tryDecode(jsonEncode({
          'id': 'w-1',
          'chatId': 'c-1',
          'kind': 'read-watermark',
          'createdAt': DateTime(2026, 9, 1).toIso8601String(),
        })),
        isNull,
      );
    });
  });
}
