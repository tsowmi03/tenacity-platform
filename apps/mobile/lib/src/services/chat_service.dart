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
        .orderBy('updatedAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => Chat.fromFirestore(doc))
            .where(
                (chat) => chat.deletedFor[userId] == null) // Hide deleted chats
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
    String? thumbnailUrl,
    String messageType = "text",
  }) async {
    WriteBatch batch = _firestore.batch();

    // Reference to the chat document.
    DocumentReference chatRef = _firestore.collection('chats').doc(chatId);

    // Retrieve the chat document to access the participants list.
    DocumentSnapshot chatSnapshot = await chatRef.get();
    if (!chatSnapshot.exists) {
      throw Exception('Chat not found');
    }
    Map<String, dynamic> chatData = chatSnapshot.data() as Map<String, dynamic>;
    List<dynamic> participants = chatData['participants'] ?? [];

    // Create a new message reference inside the messages subcollection.
    DocumentReference messageRef = chatRef.collection('messages').doc();

    // Create a new message object.
    Message newMessage = Message(
      id: messageRef.id,
      senderId: senderId,
      text: text,
      mediaUrl: mediaUrl,
      thumbnailUrl: thumbnailUrl,
      type: messageType,
      timestamp: Timestamp.now(),
      readBy: {senderId: Timestamp.now()},
    );

    // Add the new message to the batch.
    batch.set(messageRef, newMessage.toFirestore());

    // Prepare the update for the chat document.
    Map<String, dynamic> chatUpdate = {
      'lastMessage': text.isEmpty ? "[Attachment]" : text,
      'updatedAt': Timestamp.now(),
      'deletedFor.$senderId':
          FieldValue.delete(), // Restore chat if previously deleted
    };

    // Update unread counts for all participants.
    for (var participant in participants) {
      if (participant == senderId) {
        // Reset the sender's unread count.
        chatUpdate['unreadCounts.$participant'] = 0;
      } else {
        // Increment the unread count for other participants.
        chatUpdate['unreadCounts.$participant'] = FieldValue.increment(1);
      }
    }

    // Add the update for the chat document to the batch.
    batch.update(chatRef, chatUpdate);

    // Commit all batched writes.
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
  Future<void> updateTypingStatus(
      String chatId, String userId, bool isTyping) async {
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
      typingStatus: {
        userId: false,
        recipientId: false,
      },
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
