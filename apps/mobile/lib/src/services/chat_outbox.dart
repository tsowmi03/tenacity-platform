import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'chat_service.dart';

/// What a queued entry is asking the outbox to do.
///
/// A string rather than an enum so that a queue written by one build and read
/// by another degrades to "skip what I do not understand" instead of throwing
/// while parsing somebody's unsent messages. MOB-41 adds a read-watermark kind
/// alongside this one.
class OutboxKind {
  const OutboxKind._();

  static const String message = 'message';

  /// A message carrying a file the queue has to upload before it can send.
  ///
  /// Separate from [message] because it has a step in front of the send that
  /// can succeed on its own, and whose result has to survive a crash — an
  /// upload that completed but was never sent must not be made twice.
  static const String media = 'media';

  static const Set<String> all = {message, media};
}

/// Where an entry's file ended up once uploaded.
@immutable
class UploadedMedia {
  const UploadedMedia({required this.mediaUrl, this.thumbnailUrl});

  final String mediaUrl;
  final String? thumbnailUrl;
}

/// One piece of outbound work, durable across app restarts.
@immutable
class OutboxEntry {
  const OutboxEntry({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.createdAt,
    this.kind = OutboxKind.message,
    this.text = '',
    this.messageType = 'text',
    this.recipientId,
    this.attempts = 0,
    this.localPath,
    this.mediaUrl,
    this.thumbnailUrl,
    this.fileName,
    this.fileSize,
  });

  /// The id the server writes this message at, chosen here rather than left to
  /// Firestore so that it doubles as an idempotency key: a replay of an entry
  /// whose send already committed lands on the same document instead of posting
  /// the message a second time.
  final String id;
  final String chatId;

  /// The account that queued this.
  ///
  /// The queue is one store shared by everyone who signs in on the device, and
  /// `sendChatMessage` takes the sender from the caller's own token — so an
  /// entry that is not bound to an account can be drained under whoever happens
  /// to be signed in next, arriving attributed to them or failing on
  /// permission-denied forever. Only [senderId] may send this.
  final String senderId;
  final String kind;
  final DateTime createdAt;
  final String text;
  final String messageType;
  final String? recipientId;

  /// How many times sending this has come back with an error.
  ///
  /// Drives the backoff, and past [_undeliveredAfterAttempts] it is also what
  /// the thread uses to stop calling the message pending and start calling it
  /// undelivered.
  final int attempts;

  /// An app-owned copy of the file to upload, for [OutboxKind.media].
  ///
  /// A copy rather than the path the picker handed over: those live in a
  /// temporary directory the system may clear whenever it likes, so a queue
  /// entry pointing at one is only as durable as the operating system's mood.
  final String? localPath;

  /// Where the upload landed, once it has.
  ///
  /// Written back to the entry as soon as the upload finishes and before the
  /// send is attempted, so an entry replayed after a crash sends the file that
  /// is already in storage instead of uploading a second copy — which is also
  /// what stops abandoned uploads accumulating.
  final String? mediaUrl;
  final String? thumbnailUrl;

  final String? fileName;
  final int? fileSize;

  /// Whether the file for this entry still has to be uploaded.
  bool get needsUpload => kind == OutboxKind.media && mediaUrl == null;

  static const int _undeliveredAfterAttempts = 3;

  /// Whether this has failed often enough to stop claiming it is on its way.
  ///
  /// Not the same as failed: it keeps retrying either way. This only decides
  /// what the user is told, because a message that has been "sending" for
  /// several minutes is not one they should still be reassured about.
  bool get isUndelivered => attempts >= _undeliveredAfterAttempts;

  OutboxEntry copyWith({
    int? attempts,
    String? mediaUrl,
    String? thumbnailUrl,
  }) =>
      OutboxEntry(
        id: id,
        chatId: chatId,
        senderId: senderId,
        createdAt: createdAt,
        kind: kind,
        text: text,
        messageType: messageType,
        recipientId: recipientId,
        attempts: attempts ?? this.attempts,
        localPath: localPath,
        mediaUrl: mediaUrl ?? this.mediaUrl,
        thumbnailUrl: thumbnailUrl ?? this.thumbnailUrl,
        fileName: fileName,
        fileSize: fileSize,
      );

  /// Records where the upload landed, so it is never made twice.
  OutboxEntry uploaded({required String mediaUrl, String? thumbnailUrl}) =>
      copyWith(mediaUrl: mediaUrl, thumbnailUrl: thumbnailUrl);

  OutboxEntry withAttempt() => copyWith(attempts: attempts + 1);

  OutboxEntry withoutAttempts() => copyWith(attempts: 0);

  String encode() => jsonEncode({
        'id': id,
        'chatId': chatId,
        'senderId': senderId,
        'kind': kind,
        'createdAt': createdAt.toIso8601String(),
        'text': text,
        'messageType': messageType,
        'recipientId': recipientId,
        'attempts': attempts,
        'localPath': localPath,
        'mediaUrl': mediaUrl,
        'thumbnailUrl': thumbnailUrl,
        'fileName': fileName,
        'fileSize': fileSize,
      });

  /// Reads one stored row, or null if it cannot be read.
  ///
  /// Null rather than throwing: one unreadable row must cost the user that one
  /// message, not the rest of the queue behind it.
  static OutboxEntry? tryDecode(String row) {
    try {
      final data = jsonDecode(row);
      if (data is! Map<String, dynamic>) return null;

      final id = data['id'];
      final chatId = data['chatId'];
      final senderId = data['senderId'];
      final createdAt = DateTime.tryParse(data['createdAt'] as String? ?? '');
      // An entry with no sender is one nobody may send: it would go under
      // whichever account is signed in when the queue next drains.
      if (id is! String ||
          chatId is! String ||
          senderId is! String ||
          senderId.isEmpty ||
          createdAt == null) {
        return null;
      }

      final kind = data['kind'] as String? ?? OutboxKind.message;
      if (!OutboxKind.all.contains(kind)) return null;

      return OutboxEntry(
        id: id,
        chatId: chatId,
        senderId: senderId,
        createdAt: createdAt,
        kind: kind,
        text: data['text'] as String? ?? '',
        messageType: data['messageType'] as String? ?? 'text',
        recipientId: data['recipientId'] as String?,
        attempts: data['attempts'] as int? ?? 0,
        localPath: data['localPath'] as String?,
        mediaUrl: data['mediaUrl'] as String?,
        thumbnailUrl: data['thumbnailUrl'] as String?,
        fileName: data['fileName'] as String?,
        fileSize: data['fileSize'] as int?,
      );
    } catch (error) {
      debugPrint('[ChatOutbox] discarding an unreadable queue row: $error');
      return null;
    }
  }
}

/// Messages the user has sent that the server has not confirmed yet.
///
/// The point of this class is that a send stops depending on the screen the
/// moment the user taps send. The text is on disk before any network call is
/// made, the queue outlives [ChatScreen], and an entry that never got an answer
/// is replayed on the next launch under its original id — which the server
/// treats as an idempotency key, so a replay of something that did commit
/// writes nothing.
///
/// What this deliberately does not promise: a message that never reached the
/// server still needs the app to run again to be delivered. iOS will not run us
/// in the background for it, and Firestore's own offline write queue has the
/// same constraint. "Sent" here means durably queued and delivered at most once
/// at the next opportunity.
class ChatOutbox with ChangeNotifier {
  ChatOutbox({
    Future<void> Function(OutboxEntry entry)? send,
    Future<UploadedMedia> Function(OutboxEntry entry)? upload,
    Duration Function(int attempts)? backoff,
  })  : _backoff = backoff ?? _defaultBackoff,
        _send = send,
        _upload = upload;

  static const String _storageKey = 'chat_outbox_v1';

  final Duration Function(int attempts) _backoff;
  final Future<void> Function(OutboxEntry entry)? _send;

  /// Puts an entry's file in storage and answers where it landed.
  ///
  /// Injected so the queue can be tested without Firebase Storage, and so the
  /// screen no longer has to own uploading at all.
  final Future<UploadedMedia> Function(OutboxEntry entry)? _upload;

  /// Built on first use rather than in the constructor: [ChatService] resolves
  /// `FirebaseFirestore.instance` in a field initialiser, which throws in a
  /// test that has no Firebase. Tests inject [_send] and never reach this.
  ChatService? _chatService;

  final List<OutboxEntry> _entries = [];

  /// The account currently signed in, or null when nobody is.
  ///
  /// Only this account's entries are ever sent. Anyone else's stay on disk,
  /// untouched, until they sign back in.
  String? _userId;

  bool _loaded = false;
  bool _draining = false;

  /// Set when work is queued during a drain, so the running drain goes round
  /// again rather than leaving it for a retry timer.
  bool _drainRequested = false;
  bool _online = true;
  Timer? _retryTimer;

  /// Everything still waiting, oldest first.
  List<OutboxEntry> get entries => List.unmodifiable(_entries);

  bool get isEmpty => _entries.isEmpty;

  /// What the signed-in account still has unsent in [chatId], oldest first.
  ///
  /// Filtered by account as well as chat, so a thread never renders a message
  /// somebody else queued on this device as though it were the current user's.
  List<OutboxEntry> pendingFor(String? chatId) {
    if (chatId == null) return const [];
    return _mine.where((entry) => entry.chatId == chatId).toList();
  }

  /// The entries the signed-in account may send.
  Iterable<OutboxEntry> get _mine {
    final userId = _userId;
    if (userId == null || userId.isEmpty) return const [];
    return _entries.where((entry) => entry.senderId == userId);
  }

  /// Tells the queue who is signed in.
  ///
  /// `sendChatMessage` takes the sender from the caller's own token, so a queue
  /// that is not bound to an account will happily drain one user's unsent
  /// messages under the next user's credentials after a sign-out — delivering
  /// them attributed to whoever signed in, or retrying forever on
  /// permission-denied. Their entries stay on disk for when they come back.
  void setUser(String? userId) {
    if (_userId == userId) return;
    _userId = userId;
    _retryTimer?.cancel();
    notifyListeners();
    unawaited(_drain());
  }

  /// Restores the queue from disk and starts sending it.
  ///
  /// Safe to call more than once; only the first call reads.
  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;

    final prefs = await SharedPreferences.getInstance();
    final rows = prefs.getStringList(_storageKey) ?? const <String>[];
    for (final row in rows) {
      final entry = OutboxEntry.tryDecode(row);
      if (entry != null) _entries.add(entry);
    }

    if (_entries.isNotEmpty) {
      debugPrint('[ChatOutbox] restored ${_entries.length} unsent message(s)');
      notifyListeners();
      unawaited(_drain());
    }
  }

  /// Accepts [text] for [chatId] and returns once it is durably on disk.
  ///
  /// The await matters: this returns only after the entry has been persisted,
  /// so by the time the caller clears the composer the text exists somewhere
  /// other than the widget that is about to be disposed. Sending itself is not
  /// awaited — that is the whole point.
  Future<void> enqueueMessage({
    required String id,
    required String chatId,
    required String senderId,
    required String text,
    String messageType = 'text',
    String? recipientId,
  }) async {
    final entry = OutboxEntry(
      id: id,
      chatId: chatId,
      senderId: senderId,
      createdAt: DateTime.now(),
      text: text,
      messageType: messageType,
      recipientId: recipientId,
    );

    // On disk before it is announced, and before it is even in memory. An
    // entry held only in memory would be claimed as sent while being exactly
    // as fragile as the widget state this replaces — and if the write fails,
    // the caller has to learn that the message was not accepted so it can
    // leave the text where the user can still see it.
    await _persistAll([..._entries, entry]);

    _entries.add(entry);
    notifyListeners();
    unawaited(_drain());
  }

  /// Accepts a file for [chatId] and returns once it is durably queued.
  ///
  /// [localPath] must already be an app-owned copy. The queue deletes it once
  /// the message is confirmed, so handing it a path the app does not own — the
  /// picker's temporary file, say — would have it deleting somebody else's
  /// file, and would leave the entry pointing at something the system may
  /// clear on its own anyway.
  Future<void> enqueueMedia({
    required String id,
    required String chatId,
    required String senderId,
    required String localPath,
    required String messageType,
    String text = '',
    String? recipientId,
    String? fileName,
    int? fileSize,
  }) async {
    final entry = OutboxEntry(
      id: id,
      chatId: chatId,
      senderId: senderId,
      createdAt: DateTime.now(),
      kind: OutboxKind.media,
      text: text,
      messageType: messageType,
      recipientId: recipientId,
      localPath: localPath,
      fileName: fileName,
      fileSize: fileSize,
    );

    await _persistAll([..._entries, entry]);

    _entries.add(entry);
    notifyListeners();
    unawaited(_drain());
  }

  /// Forgets [id] because the server's own copy of it has arrived.
  ///
  /// The thread sees the real message about a second before the send call
  /// returns — `sendChatMessage` commits and only then does its notification
  /// fan-out — so this is usually what retires an entry, not the send.
  Future<void> confirm(String id) async {
    final index = _entries.indexWhere((entry) => entry.id == id);
    if (index < 0) return;

    final entry = _entries.removeAt(index);
    notifyListeners();
    await _persist();
    await _deleteLocalCopy(entry);
  }

  /// Sends [id] again now, at the user's request, ignoring its backoff.
  Future<void> retryNow(String id) async {
    final index = _entries.indexWhere((entry) => entry.id == id);
    if (index < 0) return;

    _entries[index] = _entries[index].withoutAttempts();
    notifyListeners();
    await _persist();

    _retryTimer?.cancel();
    unawaited(_drain());
  }

  /// Drops [id] without sending it. The user gave up on the message.
  Future<void> discard(String id) async {
    final index = _entries.indexWhere((entry) => entry.id == id);
    if (index < 0) return;

    final entry = _entries.removeAt(index);
    notifyListeners();
    await _persist();
    await _deleteLocalCopy(entry);
  }

  /// Tells the queue whether there is a connection.
  ///
  /// Coming back online is new information, and it makes whatever backoff we
  /// were waiting out pointless — so the queue goes immediately rather than
  /// when the timer eventually says so.
  void setOnline(bool isOnline) {
    if (_online == isOnline) return;
    _online = isOnline;
    if (!isOnline) return;

    _retryTimer?.cancel();
    unawaited(_drain());
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    super.dispose();
  }

  /// Persists, and swallows a failure the caller could not act on anyway.
  ///
  /// Only [enqueueMessage] can do anything useful with a rejected write — it
  /// tells its caller, so the user keeps their text. Everywhere else the queue
  /// is recording progress it has already made, and the in-memory list stays
  /// authoritative until the next write succeeds. Throwing from those paths
  /// would surface as an unhandled error out of a fire-and-forget drain.
  /// Removes the app-owned copy of an entry's file.
  ///
  /// Only ever the copy this queue made. Failing to delete it costs disk space
  /// on one device and nothing else, so it is not worth failing a confirmed
  /// send over.
  Future<void> _deleteLocalCopy(OutboxEntry entry) async {
    final path = entry.localPath;
    if (path == null) return;
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (error) {
      debugPrint('[ChatOutbox] could not delete $path: $error');
    }
  }

  Future<void> _persist() async {
    try {
      await _persistAll(_entries);
    } catch (error) {
      debugPrint('[ChatOutbox] could not write the queue: $error');
    }
  }

  Future<void> _persistAll(List<OutboxEntry> entries) async {
    final prefs = await SharedPreferences.getInstance();
    final written = await prefs.setStringList(
      _storageKey,
      entries.map((entry) => entry.encode()).toList(),
    );
    // `setStringList` reports a refused write by answering false rather than
    // throwing. Treating that as success is the whole failure this class
    // exists to prevent: the composer would be cleared for a message that
    // exists nowhere but memory.
    if (!written) {
      throw StateError('The message queue could not be written to storage.');
    }
  }

  Future<void> _drain() async {
    if (_draining) {
      // Queued while a drain was already running. Remembered rather than
      // dropped: returning here and leaving it is what made a message queued
      // behind an in-flight one wait for a retry timer that could be minutes
      // away, even though the queue was awake the whole time.
      _drainRequested = true;
      return;
    }
    if (!_online || _mine.isEmpty) return;
    _draining = true;

    Duration? soonestRetry;
    try {
      do {
        _drainRequested = false;
        soonestRetry = null;

        // Chat by chat. Order only has to hold within a conversation, and a
        // chat that cannot send must not hold up every other chat behind it.
        final chatIds = _mine.map((entry) => entry.chatId).toSet().toList();
        for (final chatId in chatIds) {
          final stalledAtAttempt = await _drainChat(chatId);
          if (stalledAtAttempt == null) continue;

          final delay = _backoff(stalledAtAttempt);
          final current = soonestRetry;
          if (current == null || delay < current) soonestRetry = delay;
        }
      } while (_drainRequested && _online && _mine.isNotEmpty);
    } finally {
      _draining = false;
    }

    if (soonestRetry != null) {
      _retryTimer?.cancel();
      _retryTimer = Timer(soonestRetry, () => unawaited(_drain()));
    }
  }

  /// Sends [chatId]'s queue in the order it was composed, one at a time.
  ///
  /// Returns the attempt count of the entry it stopped on, or null if the chat
  /// emptied. Sending concurrently would be faster and wrong: the server stamps
  /// messages as they arrive, so parallel sends land in a different order from
  /// the one the user typed them in.
  Future<int?> _drainChat(String chatId) async {
    while (true) {
      final index = _entries.indexWhere(
        (entry) => entry.chatId == chatId && entry.senderId == _userId,
      );
      if (index < 0) return null;

      final entry = _entries[index];
      try {
        await _sendEntry(await _uploadIfNeeded(entry));
      } catch (error) {
        debugPrint('[ChatOutbox] send failed for ${entry.id}: $error');
        // Located again rather than trusting `index`: the send was awaited, and
        // anything could have been queued or confirmed in the meantime.
        final current = _entries.indexWhere((queued) => queued.id == entry.id);
        if (current < 0) return null;

        final attempted = _entries[current].withAttempt();
        _entries[current] = attempted;
        notifyListeners();
        await _persist();
        return attempted.attempts;
      }

      _entries.removeWhere((queued) => queued.id == entry.id);
      notifyListeners();
      await _persist();
    }
  }

  /// Uploads [entry]'s file if it still needs one, and records the result.
  ///
  /// Returns the entry to send. The upload is recorded before the send is
  /// attempted, so a crash between the two costs a retry of the send rather
  /// than a second copy of the file in storage.
  Future<OutboxEntry> _uploadIfNeeded(OutboxEntry entry) async {
    if (!entry.needsUpload) return entry;

    final upload = _upload;
    if (upload == null) {
      throw StateError('This queue cannot upload; no uploader was provided.');
    }

    final result = await upload(entry);
    final uploaded = entry.uploaded(
      mediaUrl: result.mediaUrl,
      thumbnailUrl: result.thumbnailUrl,
    );

    final index = _entries.indexWhere((queued) => queued.id == entry.id);
    if (index >= 0) {
      _entries[index] = uploaded;
      notifyListeners();
      await _persist();
    }
    return uploaded;
  }

  Future<void> _sendEntry(OutboxEntry entry) {
    final send = _send;
    if (send != null) return send(entry);

    final service = _chatService ??= ChatService();
    return service.sendMessage(
      chatId: entry.chatId,
      messageId: entry.id,
      text: entry.text,
      messageType: entry.messageType,
      mediaUrl: entry.mediaUrl,
      thumbnailUrl: entry.thumbnailUrl,
      fileName: entry.fileName,
      fileSize: entry.fileSize,
    );
  }

  /// 2s, 4s, 8s and so on, capped at five minutes.
  ///
  /// Long enough not to hammer a network that is plainly down, short enough
  /// that a message sent on a flaky connection still arrives while the
  /// conversation it belongs to is happening.
  static Duration _defaultBackoff(int attempts) {
    final seconds = math.min(2 << math.min(attempts, 7), 300);
    return Duration(seconds: seconds);
  }
}
