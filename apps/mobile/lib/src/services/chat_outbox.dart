import 'dart:async';
import 'dart:convert';
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
}

/// One piece of outbound work, durable across app restarts.
@immutable
class OutboxEntry {
  const OutboxEntry({
    required this.id,
    required this.chatId,
    required this.createdAt,
    this.kind = OutboxKind.message,
    this.text = '',
    this.messageType = 'text',
    this.recipientId,
    this.attempts = 0,
  });

  /// The id the server writes this message at, chosen here rather than left to
  /// Firestore so that it doubles as an idempotency key: a replay of an entry
  /// whose send already committed lands on the same document instead of posting
  /// the message a second time.
  final String id;
  final String chatId;
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

  static const int _undeliveredAfterAttempts = 3;

  /// Whether this has failed often enough to stop claiming it is on its way.
  ///
  /// Not the same as failed: it keeps retrying either way. This only decides
  /// what the user is told, because a message that has been "sending" for
  /// several minutes is not one they should still be reassured about.
  bool get isUndelivered => attempts >= _undeliveredAfterAttempts;

  OutboxEntry copyWith({int? attempts}) => OutboxEntry(
        id: id,
        chatId: chatId,
        createdAt: createdAt,
        kind: kind,
        text: text,
        messageType: messageType,
        recipientId: recipientId,
        attempts: attempts ?? this.attempts,
      );

  OutboxEntry withAttempt() => copyWith(attempts: attempts + 1);

  OutboxEntry withoutAttempts() => copyWith(attempts: 0);

  String encode() => jsonEncode({
        'id': id,
        'chatId': chatId,
        'kind': kind,
        'createdAt': createdAt.toIso8601String(),
        'text': text,
        'messageType': messageType,
        'recipientId': recipientId,
        'attempts': attempts,
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
      final createdAt = DateTime.tryParse(data['createdAt'] as String? ?? '');
      if (id is! String || chatId is! String || createdAt == null) return null;

      final kind = data['kind'] as String? ?? OutboxKind.message;
      if (kind != OutboxKind.message) return null;

      return OutboxEntry(
        id: id,
        chatId: chatId,
        createdAt: createdAt,
        kind: kind,
        text: data['text'] as String? ?? '',
        messageType: data['messageType'] as String? ?? 'text',
        recipientId: data['recipientId'] as String?,
        attempts: data['attempts'] as int? ?? 0,
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
    Duration Function(int attempts)? backoff,
  })  : _backoff = backoff ?? _defaultBackoff,
        _send = send;

  static const String _storageKey = 'chat_outbox_v1';

  final Duration Function(int attempts) _backoff;
  final Future<void> Function(OutboxEntry entry)? _send;

  /// Built on first use rather than in the constructor: [ChatService] resolves
  /// `FirebaseFirestore.instance` in a field initialiser, which throws in a
  /// test that has no Firebase. Tests inject [_send] and never reach this.
  ChatService? _chatService;

  final List<OutboxEntry> _entries = [];
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

  /// What is still unsent in [chatId], oldest first.
  List<OutboxEntry> pendingFor(String? chatId) {
    if (chatId == null) return const [];
    return _entries.where((entry) => entry.chatId == chatId).toList();
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
    required String text,
    String messageType = 'text',
    String? recipientId,
  }) async {
    final entry = OutboxEntry(
      id: id,
      chatId: chatId,
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

  /// Forgets [id] because the server's own copy of it has arrived.
  ///
  /// The thread sees the real message about a second before the send call
  /// returns — `sendChatMessage` commits and only then does its notification
  /// fan-out — so this is usually what retires an entry, not the send.
  Future<void> confirm(String id) async {
    if (!_entries.any((entry) => entry.id == id)) return;
    _entries.removeWhere((entry) => entry.id == id);
    notifyListeners();
    await _persist();
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
    if (!_entries.any((entry) => entry.id == id)) return;
    _entries.removeWhere((entry) => entry.id == id);
    notifyListeners();
    await _persist();
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

  Future<void> _persist() => _persistAll(_entries);

  Future<void> _persistAll(List<OutboxEntry> entries) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      _storageKey,
      entries.map((entry) => entry.encode()).toList(),
    );
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
    if (!_online || _entries.isEmpty) return;
    _draining = true;

    Duration? soonestRetry;
    try {
      do {
        _drainRequested = false;
        soonestRetry = null;

        // Chat by chat. Order only has to hold within a conversation, and a
        // chat that cannot send must not hold up every other chat behind it.
        final chatIds = _entries.map((entry) => entry.chatId).toSet().toList();
        for (final chatId in chatIds) {
          final stalledAtAttempt = await _drainChat(chatId);
          if (stalledAtAttempt == null) continue;

          final delay = _backoff(stalledAtAttempt);
          final current = soonestRetry;
          if (current == null || delay < current) soonestRetry = delay;
        }
      } while (_drainRequested && _online && _entries.isNotEmpty);
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
      final index = _entries.indexWhere((entry) => entry.chatId == chatId);
      if (index < 0) return null;

      final entry = _entries[index];
      try {
        await _sendEntry(entry);
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

  Future<void> _sendEntry(OutboxEntry entry) {
    final send = _send;
    if (send != null) return send(entry);

    final service = _chatService ??= ChatService();
    return service.sendMessage(
      chatId: entry.chatId,
      messageId: entry.id,
      text: entry.text,
      messageType: entry.messageType,
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
