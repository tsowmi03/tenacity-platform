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

  group('local visibility (MOB-49)', () {
    test('successful sends remain visible but are never retried', () async {
      final sent = <String>[];
      final outbox = _outbox(send: (entry) async => sent.add(entry.id));
      await outbox.enqueueMessage(
          id: 'm', chatId: 'c', senderId: 'me', text: 'Hello');
      await pumpEventQueue();
      expect(outbox.entries, isEmpty);
      expect(outbox.visibleFor('c').single.text, 'Hello');
      expect(outbox.inboxEntries.single.text, 'Hello');
      outbox.setOnline(false);
      outbox.setOnline(true);
      await pumpEventQueue();
      expect(sent, ['m']);

      await outbox.confirm('m');
      expect(outbox.visibleFor('c'), isEmpty);
      expect(outbox.inboxEntries.single.text, 'Hello');
      outbox.setUser('other');
      expect(outbox.inboxEntries, isEmpty);
      expect(outbox.visibleFor('c'), isEmpty);
      outbox.dispose();
    });

    test('restored and failed messages remain visible until discarded',
        () async {
      final entry = OutboxEntry(
          id: 'm',
          chatId: 'c',
          senderId: 'me',
          createdAt: DateTime(2026, 9, 10),
          text: 'Offline',
          attempts: 3);
      SharedPreferences.setMockInitialValues({
        'chat_outbox_v1': [entry.encode()]
      });
      final outbox = _outbox()..setOnline(false);
      await outbox.load();
      expect(outbox.visibleFor('c').single.isUndelivered, isTrue);
      expect(outbox.inboxEntries.single.text, 'Offline');
      outbox.setUser('other');
      expect(outbox.visibleFor('c'), isEmpty);
      expect(outbox.inboxEntries, isEmpty);
      outbox.setUser('me');
      await outbox.discard('m');
      expect(outbox.visibleFor('c'), isEmpty);
      expect(outbox.inboxEntries, isEmpty);
      outbox.dispose();
    });
  });

  group('durability', () {
    test('a message is on disk before the send is even attempted', () async {
      List<String>? storedWhenSendRan;
      final outbox = _outbox(send: (entry) async {
        final prefs = await SharedPreferences.getInstance();
        storedWhenSendRan = prefs.getStringList('chat_outbox_v1');
      });

      await outbox.enqueueMessage(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
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
      final firstSession = _outbox(send: (_) => Completer<void>().future);
      await firstSession.enqueueMessage(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
        text: 'Still unsent',
      );
      firstSession.dispose();

      // Session two: a new queue over the same storage, as after a restart.
      final sent = <OutboxEntry>[];
      final secondSession = _outbox(send: (entry) async => sent.add(entry));
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
      final outbox = _outbox(send: (entry) {
        attempted.add(entry.id);
        final gate = Completer<void>();
        gates.add(gate);
        return gate.future;
      });

      await outbox.enqueueMessage(
          id: 'a', chatId: 'c-1', senderId: 'me', text: 'first');
      await outbox.enqueueMessage(
          id: 'b', chatId: 'c-1', senderId: 'me', text: 'second');
      await outbox.enqueueMessage(
          id: 'c', chatId: 'c-1', senderId: 'me', text: 'third');
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
      final outbox = _outbox(
        send: (entry) async {
          if (entry.chatId == 'stuck-chat') throw StateError('no route');
          sent.add(entry.id);
        },
        backoff: (_) => const Duration(hours: 1),
      );

      await outbox.enqueueMessage(
          id: 'stuck', chatId: 'stuck-chat', senderId: 'me', text: 'x');
      await outbox.enqueueMessage(
          id: 'fine', chatId: 'other-chat', senderId: 'me', text: 'y');
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
      final outbox = _outbox(send: (entry) async => sent.add(entry.id));
      outbox.setOnline(false);

      await outbox.enqueueMessage(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
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
    test('a failed send counts the attempt and keeps the message queued',
        () async {
      // An hour of backoff, so exactly one attempt happens and the assertions
      // do not race the retry timer. How many attempts it takes to be called
      // undelivered is pure logic, tested on its own below.
      final outbox = _outbox(
        send: (_) async => throw StateError('still failing'),
        backoff: (_) => const Duration(hours: 1),
      );

      await outbox.enqueueMessage(
          id: 'm-1', chatId: 'c-1', senderId: 'me', text: 'Hello');
      await pumpEventQueue();

      expect(outbox.entries.single.attempts, 1);
      // One failure is a hiccup, not an outcome.
      expect(outbox.entries.single.isUndelivered, isFalse);
      // Still queued, and still under its original id.
      expect(outbox.entries.single.id, 'm-1');

      outbox.dispose();
    });

    test('a message is called undelivered only after several attempts', () {
      var entry = OutboxEntry(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
        createdAt: DateTime(2026, 9, 1),
      );

      expect(entry.isUndelivered, isFalse);
      entry = entry.withAttempt();
      expect(entry.isUndelivered, isFalse);
      entry = entry.withAttempt();
      expect(entry.isUndelivered, isFalse);

      // Three failures is long enough to stop reassuring the user that it is
      // on its way. It is not a decision to stop trying — the queue keeps
      // retrying either way.
      entry = entry.withAttempt();
      expect(entry.isUndelivered, isTrue);

      expect(entry.withoutAttempts().isUndelivered, isFalse);
    });

    test('retrying by hand clears the undelivered state and sends again',
        () async {
      var shouldFail = true;
      final attempts = <String>[];
      final outbox = _outbox(
        send: (entry) async {
          attempts.add(entry.id);
          if (shouldFail) throw StateError('nope');
        },
        backoff: (_) => const Duration(hours: 1),
      );

      await outbox.enqueueMessage(
          id: 'm-1', chatId: 'c-1', senderId: 'me', text: 'Hello');
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
      final outbox = _outbox(send: (_) => Completer<void>().future);
      await outbox.enqueueMessage(
          id: 'm-1', chatId: 'c-1', senderId: 'me', text: 'Hello');
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
      final outbox = _outbox(
        send: (entry) async => sent.add(entry.id),
        backoff: (_) => const Duration(hours: 1),
      );
      outbox.setOnline(false);

      await outbox.enqueueMessage(
          id: 'm-1', chatId: 'c-1', senderId: 'me', text: 'Hello');
      await outbox.discard('m-1');
      outbox.setOnline(true);
      await pumpEventQueue();

      expect(sent, isEmpty);
      expect(outbox.entries, isEmpty);

      outbox.dispose();
    });
  });

  group('attachments', () {
    test('the file is uploaded before the message is sent', () async {
      final events = <String>[];
      final outbox = _outbox(
        send: (entry) async => events.add('send:${entry.mediaUrl}'),
        upload: (entry) async {
          events.add('upload:${entry.localPath}');
          return const UploadedMedia(
            mediaUrl: 'https://example/photo.jpg',
            thumbnailUrl: 'https://example/thumb.jpg',
          );
        },
      );

      await outbox.enqueueMedia(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
        localPath: '/app/outbox/m-1.jpg',
        messageType: 'image',
      );
      await pumpEventQueue();

      expect(events, [
        'upload:/app/outbox/m-1.jpg',
        'send:https://example/photo.jpg',
      ]);
      expect(outbox.entries, isEmpty);

      outbox.dispose();
    });

    test('a replay after the send failed does not upload the file twice',
        () async {
      // The reason the upload result is written back to the entry. Uploading
      // again would leave the first copy in storage with nothing pointing at
      // it, which is the orphan this ticket exists to stop.
      var uploads = 0;
      var sends = 0;
      var sendShouldFail = true;
      final outbox = _outbox(
        send: (_) async {
          sends++;
          if (sendShouldFail) throw StateError('send failed');
        },
        upload: (_) async {
          uploads++;
          return const UploadedMedia(mediaUrl: 'https://example/photo.jpg');
        },
        backoff: (_) => const Duration(hours: 1),
      );

      await outbox.enqueueMedia(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
        localPath: '/app/outbox/m-1.jpg',
        messageType: 'image',
      );
      await pumpEventQueue();

      expect(uploads, 1);
      expect(sends, 1);
      expect(outbox.entries.single.mediaUrl, 'https://example/photo.jpg');
      expect(outbox.entries.single.needsUpload, isFalse);

      sendShouldFail = false;
      await outbox.retryNow('m-1');
      await pumpEventQueue();

      expect(uploads, 1, reason: 'the file was already in storage');
      expect(sends, 2);
      expect(outbox.entries, isEmpty);

      outbox.dispose();
    });

    test('an upload recorded in one session is not repeated in the next',
        () async {
      var uploads = 0;
      final first = _outbox(
        send: (_) => Completer<void>().future,
        upload: (_) async {
          uploads++;
          return const UploadedMedia(mediaUrl: 'https://example/photo.jpg');
        },
      );
      await first.enqueueMedia(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
        localPath: '/app/outbox/m-1.jpg',
        messageType: 'image',
      );
      await pumpEventQueue();
      expect(uploads, 1);
      first.dispose();

      // A new queue over the same storage, as after a restart.
      final sent = <String?>[];
      final second = _outbox(
        send: (entry) async => sent.add(entry.mediaUrl),
        upload: (_) async {
          uploads++;
          return const UploadedMedia(mediaUrl: 'https://example/second.jpg');
        },
      );
      await second.load();
      await pumpEventQueue();

      expect(uploads, 1, reason: 'the upload survived the restart');
      expect(sent, ['https://example/photo.jpg']);

      second.dispose();
    });

    test('a caption queued behind a photo is sent after it', () async {
      // MOB-36 shipped a fix for a caption being sent without its image, but
      // could not test it while the upload lived in the screen. It can now.
      final sent = <String>[];
      final outbox = _outbox(
        send: (entry) async =>
            sent.add(entry.kind == OutboxKind.media ? 'photo' : entry.text),
        upload: (_) async =>
            const UploadedMedia(mediaUrl: 'https://example/photo.jpg'),
      );

      await outbox.enqueueMedia(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
        localPath: '/app/outbox/m-1.jpg',
        messageType: 'image',
      );
      await outbox.enqueueMessage(
        id: 'm-2',
        chatId: 'c-1',
        senderId: 'me',
        text: 'Look at this',
      );
      await pumpEventQueue();

      expect(sent, ['photo', 'Look at this']);

      outbox.dispose();
    });

    test(
        'a sign-out during an upload stops the attachment being sent as the '
        'new account', () async {
      // The long await this ticket introduced. The server takes the sender from
      // whoever is calling, so sending after the account changed would post one
      // person's photo under another's name.
      final sent = <String>[];
      final uploadStarted = Completer<void>();
      final finishUpload = Completer<UploadedMedia>();
      final outbox = _outbox(
        send: (entry) async => sent.add(entry.id),
        upload: (_) {
          if (!uploadStarted.isCompleted) uploadStarted.complete();
          return finishUpload.future;
        },
        userId: 'user-a',
      );

      await outbox.enqueueMedia(
        id: 'a-photo',
        chatId: 'c-1',
        senderId: 'user-a',
        localPath: '/app/outbox/a-photo.jpg',
        messageType: 'image',
      );
      await uploadStarted.future;

      // A signs out and B signs in while the upload is still going.
      outbox.setUser('user-b');
      finishUpload.complete(
        const UploadedMedia(mediaUrl: 'https://example/photo.jpg'),
      );
      await pumpEventQueue();

      expect(sent, isEmpty, reason: "B must not send A's attachment");
      // Not lost either — it waits on disk, upload and all, for A's return.
      expect(outbox.entries.single.id, 'a-photo');
      expect(outbox.entries.single.mediaUrl, 'https://example/photo.jpg');

      outbox.setUser('user-a');
      await pumpEventQueue();
      expect(sent, ['a-photo']);

      outbox.dispose();
    });

    test('a queue with no uploader refuses media rather than sending it bare',
        () async {
      final sent = <String>[];
      final outbox = _outbox(
        send: (entry) async => sent.add(entry.id),
        backoff: (_) => const Duration(hours: 1),
      );

      await outbox.enqueueMedia(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
        localPath: '/app/outbox/m-1.jpg',
        messageType: 'image',
      );
      await pumpEventQueue();

      // Sending an image message with no media on it would post an empty
      // bubble that can never be repaired.
      expect(sent, isEmpty);
      expect(outbox.entries, hasLength(1));

      outbox.dispose();
    });
  });

  group('accounts', () {
    test('one account never sends another account\'s queued messages',
        () async {
      // The store is shared by everyone who signs in on the device, and
      // sendChatMessage takes the sender from the caller's own token — so
      // draining somebody else's entry would deliver their words attributed to
      // whoever is signed in now.
      final sent = <String>[];
      final outbox = _outbox(
        send: (entry) async => sent.add(entry.id),
        userId: 'user-a',
      );

      await outbox.enqueueMessage(
        id: 'a-1',
        chatId: 'c-1',
        senderId: 'user-a',
        text: 'From A',
      );
      await pumpEventQueue();
      expect(sent, ['a-1']);

      // A signs out mid-send and B signs in before the queue drains.
      outbox.setOnline(false);
      await outbox.enqueueMessage(
        id: 'a-2',
        chatId: 'c-1',
        senderId: 'user-a',
        text: 'Still unsent when A left',
      );
      outbox.setUser('user-b');
      outbox.setOnline(true);
      await pumpEventQueue();

      expect(sent, ['a-1'], reason: "B must not send A's message");
      // A's message is not lost either — it waits on disk for A to come back.
      expect(outbox.entries.map((entry) => entry.id), ['a-2']);
      expect(outbox.pendingFor('c-1'), isEmpty, reason: 'not B\'s to see');

      outbox.setUser('user-a');
      await pumpEventQueue();
      expect(sent, ['a-1', 'a-2']);

      outbox.dispose();
    });

    test('a signed-out queue sends nothing', () async {
      final sent = <String>[];
      final outbox = ChatOutbox(send: (entry) async => sent.add(entry.id));

      await outbox.enqueueMessage(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'user-a',
        text: 'Hello',
      );
      await pumpEventQueue();

      expect(sent, isEmpty);
      expect(outbox.entries, hasLength(1));

      outbox.dispose();
    });

    test('a stored row with no sender is discarded rather than sent', () {
      // Nobody may send it: it would go under whichever account happens to be
      // signed in when the queue next drains.
      expect(
        OutboxEntry.tryDecode(jsonEncode({
          'id': 'm-1',
          'chatId': 'c-1',
          'createdAt': DateTime(2026, 9, 1).toIso8601String(),
        })),
        isNull,
      );
      expect(
        OutboxEntry.tryDecode(jsonEncode({
          'id': 'm-1',
          'chatId': 'c-1',
          'senderId': '',
          'createdAt': DateTime(2026, 9, 1).toIso8601String(),
        })),
        isNull,
      );
    });
  });

  group('stored rows', () {
    test('a row survives a round trip', () {
      final entry = OutboxEntry(
        id: 'm-1',
        chatId: 'c-1',
        senderId: 'me',
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

/// A queue that already knows who is signed in.
///
/// Entries are bound to their sender, so a queue with no account sends nothing
/// — which is the point of that binding, but makes every other test here a
/// no-op unless the account is set.
ChatOutbox _outbox({
  Future<void> Function(OutboxEntry entry)? send,
  Future<UploadedMedia> Function(OutboxEntry entry)? upload,
  Duration Function(int attempts)? backoff,
  String userId = 'me',
}) {
  final outbox = ChatOutbox(send: send, upload: upload, backoff: backoff);
  outbox.setUser(userId);
  return outbox;
}
