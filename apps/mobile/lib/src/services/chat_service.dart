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

  // Fetches messages for a chat (ignores messages before the soft-delete timestamp)
  Stream<List<Message>> getMessages(String chatId, String userId) async* {
    final chatDoc = await _firestore.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return;

    final chatData = chatDoc.data();
    final deletedTimestamp = chatData?['deletedFor']?[userId];

    Query query = _firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp', descending: true);

    if (deletedTimestamp != null) {
      query = query.where('timestamp', isGreaterThan: deletedTimestamp);
    }

    yield* query.snapshots().map((snapshot) =>
        snapshot.docs.map((doc) => Message.fromFirestore(doc)).toList());
  }

  // Sends a message (restores chat if previously deleted)
  Future<void> sendMessage({
    required String chatId,
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
      'text': text,
      'messageType': messageType,
      if (mediaUrl != null) 'mediaUrl': mediaUrl,
      if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
      if (fileName != null) 'fileName': fileName,
      if (fileSize != null) 'fileSize': fileSize,
    });
  }

  // Marks messages as read & resets unread count
  Future<void> markMessagesAsRead(String chatId, String userId) async {
    debugPrint('[markMessagesAsRead] chatId: $chatId, userId: $userId');

    // Fetch all messages sent by others
    final allMessages = await _firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .get();

    WriteBatch batch = _firestore.batch();
    int unreadCount = 0;

    for (var doc in allMessages.docs) {
      final data = doc.data();
      final senderId = data['senderId'];
      final readBy = Map<String, dynamic>.from(data['readBy'] ?? {});
      // Only mark as read if:
      // - not sent by me
      // - not already read by me
      if (senderId != userId && !readBy.containsKey(userId)) {
        debugPrint('[markMessagesAsRead] Marking message as read: ${doc.id}');
        batch.update(doc.reference, {'readBy.$userId': Timestamp.now()});
        unreadCount++;
      }
    }

    batch.update(_firestore.collection('chats').doc(chatId), {
      'unreadCounts.$userId': 0,
    });

    await batch.commit();
    debugPrint('[markMessagesAsRead] Marked $unreadCount messages as read.');
  }

  /// Stamps or clears [userId]'s typing heartbeat on [chatId].
  ///
  /// Typing writes the server's clock rather than the device's, so the reader's
  /// expiry window cannot be widened or narrowed by a device with a wrong
  /// clock. Stopping deletes the key outright: an absent key and an expired one
  /// mean the same thing to a reader, and deleting keeps the document from
  /// accumulating a stamp per participant forever.
  ///
  /// `set(merge: true)` rather than `update`, which throws when the document is
  /// missing — a chat deleted from under an open screen used to surface as an
  /// unhandled error from a fire-and-forget call.
  Future<void> updateTypingStatus(
      String chatId, String userId, bool isTyping) async {
    await _firestore.collection('chats').doc(chatId).set(
      {
        'typingStatus': {
          userId: isTyping ? FieldValue.serverTimestamp() : FieldValue.delete(),
        },
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
