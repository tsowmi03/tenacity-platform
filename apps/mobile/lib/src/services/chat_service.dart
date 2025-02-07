import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/chat_model.dart';
import '../models/message_model.dart';

class ChatService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // Fetches active chats for the user (excludes deleted ones)
  Stream<List<Chat>> getUserChats(String userId) {
    return _firestore
        .collection('chats')
        .where('participants', arrayContains: userId)
        .orderBy('lastMessageTimestamp', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Chat.fromFirestore(doc))
            .where((chat) => chat.deletedFor[userId] == null) // Hide deleted chats
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
    required String senderId,
    required String text,
    String? mediaUrl,
    String messageType = "text",
  }) async {
    WriteBatch batch = _firestore.batch();

    DocumentReference messageRef = _firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .doc();

    Message newMessage = Message(
      id: messageRef.id,
      senderId: senderId,
      text: text,
      mediaUrl: mediaUrl,
      messageType: messageType,
      timestamp: Timestamp.now(),
      readBy: {senderId: Timestamp.now()}, // Mark as read for sender
    );

    batch.set(messageRef, newMessage.toFirestore());

    // Update chat document
    DocumentReference chatRef = _firestore.collection('chats').doc(chatId);
    batch.update(chatRef, {
      'lastMessage': text.isEmpty ? "[Image]" : text,
      'lastMessageTimestamp': Timestamp.now(),
      'unreadCounts.$senderId': 0, // Reset sender's unread count
      'unreadCounts': FieldValue.increment(1), // Increase count for others
      'deletedFor.$senderId': FieldValue.delete(), // Restore chat if deleted
    });

    await batch.commit();
  }

  // Marks messages as read & resets unread count
  Future<void> markMessagesAsRead(String chatId, String userId) async {
    WriteBatch batch = _firestore.batch();

    QuerySnapshot unreadMessages = await _firestore
        .collection('chats')
        .doc(chatId)
        .collection('messages')
        .where('readBy.$userId', isNull: true)
        .get();

    for (var doc in unreadMessages.docs) {
      batch.update(doc.reference, {'readBy.$userId': Timestamp.now()});
    }

    batch.update(_firestore.collection('chats').doc(chatId), {
      'unreadCounts.$userId': 0,
    });

    await batch.commit();
  }

  // Updates typing status
  Future<void> updateTypingStatus(String chatId, String userId, bool isTyping) async {
    await _firestore.collection('chats').doc(chatId).update({
      'typingStatus.$userId': isTyping,
    });
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
}
