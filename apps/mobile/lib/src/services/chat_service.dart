import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import '../models/chat_model.dart';
import '../models/message_model.dart';

class ChatService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Fetches active chats for the user (excludes deleted ones)
  Stream<List<Chat>> getUserChats(String userId) {
    return _firestore
        .collection('chats')
        .where('participants', arrayContains: userId)
        .orderBy('updatedAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Chat.fromFirestore(doc))
            .where((chat) => chat.isVisibleTo(userId))
            .toList());
  }

  /// How many messages a thread loads at a time.
  ///
  /// Before MOB-42 there was no limit at all: opening a thread subscribed to
  /// every message it had ever carried, so both the cost and the time to first
  /// paint grew with the length of the conversation. A window keeps that flat.
  static const int messagePageSize = 50;

  /// The most recent [limit] messages in [chatId], live.
  ///
  /// Ignores anything before the user's soft-delete timestamp. Ordered newest
  /// first, which is the order the thread renders in, so the window is the most
  /// recent page rather than an arbitrary slice.
  Stream<List<Message>> getMessages(
    String chatId,
    String userId, {
    int limit = messagePageSize,
  }) async* {
    final chatDoc = await _firestore.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return;

    final chatData = chatDoc.data();
    final deletedTimestamp = chatData?['deletedFor']?[userId];

    Query query = _messagesRef(chatId).orderBy('timestamp', descending: true);

    if (deletedTimestamp != null) {
      query = query.where('timestamp', isGreaterThan: deletedTimestamp);
    }

    yield* query.limit(limit).snapshots().map((snapshot) =>
        snapshot.docs.map((doc) => Message.fromFirestore(doc)).toList());
  }

  /// One page of messages older than [before], newest first.
  ///
  /// A one-shot read rather than a second live query: older pages do not
  /// change, and holding a listener open on each one would put the thread back
  /// where it started — subscribed to the whole conversation.
  Future<List<Message>> fetchMessagesBefore({
    required String chatId,
    required String userId,
    required Timestamp before,
    int limit = messagePageSize,
  }) async {
    final chatDoc = await _firestore.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return const [];

    final deletedTimestamp = chatDoc.data()?['deletedFor']?[userId];

    Query query = _messagesRef(chatId).orderBy('timestamp', descending: true);
    if (deletedTimestamp != null) {
      query = query.where('timestamp', isGreaterThan: deletedTimestamp);
    }

    final snapshot = await query.startAfter([before]).limit(limit).get();
    return snapshot.docs.map((doc) => Message.fromFirestore(doc)).toList();
  }

  CollectionReference<Map<String, dynamic>> _messagesRef(String chatId) =>
      _firestore.collection('chats').doc(chatId).collection('messages');

  /// Sends a message as [messageId] (restores the chat if previously deleted).
  ///
  /// [messageId] is the document the server writes the message at, chosen by
  /// the caller so that the optimistic copy already on screen and the copy that
  /// comes back down the thread's snapshot are one message rather than two
  /// (MOB-31). It doubles as an idempotency key: a call retried after the write
  /// committed lands on the same document instead of adding a second message.
  Future<void> sendMessage({
    required String chatId,
    required String messageId,
    required String text,
    String? mediaUrl,
    String? thumbnailUrl,
    String messageType = "text",
    String? fileName,
    int? fileSize,
    List<String>? participants,
  }) async {
    final callable =
        FirebaseFunctions.instance.httpsCallable('sendChatMessage');
    await callable.call<Map<String, dynamic>>({
      'chatId': chatId,
      'clientMessageId': messageId,
      'text': text,
      'messageType': messageType,
      if (mediaUrl != null) 'mediaUrl': mediaUrl,
      if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
      if (fileName != null) 'fileName': fileName,
      if (fileSize != null) 'fileSize': fileSize,
    });
  }

  /// Records that [userId] has read [chatId] up to now.
  ///
  /// One write to the chat document, whatever the thread's length. Before
  /// MOB-41 this read the entire messages collection and then wrote a `readBy`
  /// entry into every unread message — so opening a thread cost a full download
  /// of its history plus a write per message, and a thread with enough unread
  /// messages could not be opened at all, because a `WriteBatch` caps at 500
  /// operations.
  ///
  /// The watermark and the stored count are set together, so the two cannot
  /// drift apart at the point that used to separate them.
  ///
  /// [legacyReadByIds] are messages whose `readBy` map is still updated for
  /// clients on the previous release, which have no idea the watermark exists.
  /// The caller passes only what is on screen and not already marked, so this
  /// is bounded by the page rather than by the conversation — and can be
  /// dropped entirely once that release is out of circulation.
  ///
  /// `set(merge: true)` rather than `update`, which throws when the document is
  /// missing: a chat deleted from under an open screen used to surface as an
  /// unhandled error from a call nobody was awaiting.
  Future<void> markMessagesAsRead(
    String chatId,
    String userId, {
    List<String> legacyReadByIds = const [],
  }) async {
    final readAt = Timestamp.now();

    await _firestore.collection('chats').doc(chatId).set(
      {
        'lastReadAt': {userId: readAt},
        'unreadCounts': {userId: 0},
      },
      SetOptions(merge: true),
    );

    if (legacyReadByIds.isEmpty) return;

    final batch = _firestore.batch();
    for (final messageId in legacyReadByIds) {
      batch.update(_messagesRef(chatId).doc(messageId), {
        'readBy.$userId': readAt,
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      // The watermark is already recorded, which is what this client and the
      // server both read. Failing here costs a receipt on an older client, and
      // is not worth failing the read for.
      debugPrint('[ChatService] legacy readBy update failed: $error');
    }
  }

  /// Stamps or clears [userId]'s typing heartbeat on [chatId].
  ///
  /// Typing writes the server's clock rather than the device's, so the reader's
  /// expiry window cannot be widened or narrowed by a device with a wrong
  /// clock. Stopping deletes the key outright: an absent key and an expired one
  /// mean the same thing to a reader, and deleting keeps the document from
  /// accumulating a stamp per participant forever.
  ///
  /// The legacy `typingStatus` bool is written alongside it, and must keep
  /// being written until the previous release is out of circulation. Clients on
  /// that release cast every value in that map to `bool`, inside the mapping of
  /// the entire inbox snapshot — so a missing flag costs them an indicator, but
  /// a wrongly-typed one costs them the inbox. They are also better off than
  /// they were: this client actually clears the flag when the screen goes away,
  /// which is the bug MOB-27 started from.
  ///
  /// `set(merge: true)` rather than `update`, which throws when the document is
  /// missing — a chat deleted from under an open screen used to surface as an
  /// unhandled error from a fire-and-forget call.
  Future<void> updateTypingStatus(
      String chatId, String userId, bool isTyping) async {
    await _firestore.collection('chats').doc(chatId).set(
      {
        'typingHeartbeats': {
          userId: isTyping ? FieldValue.serverTimestamp() : FieldValue.delete(),
        },
        // Left as a plain false rather than deleted, matching exactly what the
        // old release writes and reads.
        'typingStatus': {userId: isTyping},
      },
      SetOptions(merge: true),
    );
  }

  /// One chat document, live.
  ///
  /// The typing indicator used to read the inbox list, which is only loaded by
  /// the inbox screen — so a chat opened from a push notification had no data
  /// behind it and silently never showed the indicator at all. A screen that
  /// needs one chat should watch that chat.
  Stream<Chat?> watchChat(String chatId) {
    return _firestore.collection('chats').doc(chatId).snapshots().map(
          (doc) => doc.exists ? Chat.fromFirestore(doc) : null,
        );
  }

  // Soft deletes chat for a user (hides messages before deletion timestamp)
  Future<void> deleteChatForUser(String chatId, String userId) async {
    final chatDoc = await _firestore.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return;

    final data = chatDoc.data();
    final deletedFor = Map<String, Timestamp>.from(data?['deletedFor'] ?? {});
    deletedFor[userId] = Timestamp.now();

    if (deletedFor.length == data?['participants'].length) {
      await _firestore.collection('chats').doc(chatId).delete();
    } else {
      await _firestore.collection('chats').doc(chatId).update({
        'deletedFor': deletedFor,
      });
    }
  }

  /// Checks if a one-to-one chat between [userId] and [recipientId] already exists.
  Future<String?> getExistingChat({
    required String userId,
    required String recipientId,
  }) async {
    QuerySnapshot querySnapshot = await _firestore
        .collection('chats')
        .where('participants', arrayContains: userId)
        .get();

    for (var doc in querySnapshot.docs) {
      final data = doc.data() as Map<String, dynamic>;
      final participants = List<String>.from(data['participants'] as List);
      // Check if the other participant is in the chat and ensure it's a one-to-one chat.
      if (participants.contains(recipientId) && participants.length == 2) {
        return doc.id;
      }
    }
    return null;
  }

  /// Creates a new one-to-one chat between [userId] and [recipientId] or returns an existing one.
  Future<String> createChat({
    required String userId,
    required String recipientId,
  }) async {
    // Check if the chat already exists.
    String? existingChatId = await getExistingChat(
      userId: userId,
      recipientId: recipientId,
    );
    if (existingChatId != null) {
      return existingChatId;
    }

    // No existing chat found; create a new one.
    DocumentReference chatRef = _firestore.collection('chats').doc();

    Chat newChat = Chat(
      id: chatRef.id,
      participants: [userId, recipientId],
      lastMessage: "",
      updatedAt: Timestamp.now(),
      unreadCounts: {
        userId: 0,
        recipientId: 0,
      },
      deletedFor: {},
      // Nobody is typing into a chat that does not exist yet. Absent and
      // "not typing" are the same to a reader, so there is nothing to seed.
      typingStatus: {},
      typingHeartbeats: {},
      // Nobody has read a chat that has no messages yet. Absent and "read
      // nothing" mean the same to a reader, so there is nothing to seed.
      lastReadAt: {},
    );

    await chatRef.set(newChat.toFirestore());
    return chatRef.id;
  }

  Future<int> fetchUnreadMessagesCount(String userId) async {
    final snapshot = await _firestore
        .collection('chats')
        .where('participants', arrayContains: userId)
        .get();

    int totalUnread = 0;
    for (var doc in snapshot.docs) {
      final data = doc.data();
      // Threads the user cannot see must not contribute to the badge, or they
      // get a count with nothing to open to clear it.
      if (!Chat.fromFirestore(doc).isVisibleTo(userId)) continue;
      if (data['unreadCounts'] is Map) {
        final unreadMap = data['unreadCounts'] as Map<String, dynamic>;
        final userUnread = unreadMap[userId];
        if (userUnread is int) {
          totalUnread += userUnread;
        }
      }
    }
    return totalUnread;
  }
}
