import 'package:cloud_firestore/cloud_firestore.dart';

class Chat {
  final String id;
  final List<String> participants;
  final String lastMessage;
  final Timestamp lastMessageTimestamp;
  final Map<String, int> unreadCounts; // Unread messages per user
  final Map<String, Timestamp?> deletedFor; // Tracks when users delete the chat
  final Map<String, bool> typingStatus; // Tracks if a user is typing

  Chat({
    required this.id,
    required this.participants,
    required this.lastMessage,
    required this.lastMessageTimestamp,
    required this.unreadCounts,
    required this.deletedFor,
    required this.typingStatus,
  });

  // Convert Firestore document into Chat object
  factory Chat.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;

    return Chat(
      id: doc.id,
      participants: List<String>.from(data['participants']),
      lastMessage: data['lastMessage'] ?? '',
      lastMessageTimestamp: data['lastMessageTimestamp'] ?? Timestamp.now(),
      unreadCounts: (data['unreadCounts'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as int)) ??
          {},
      deletedFor: (data['deletedFor'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as Timestamp?)) ??
          {},
      typingStatus: (data['typingStatus'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as bool)) ??
          {},
    );
  }

  // Convert Chat object into a Firestore-compatible map
  Map<String, dynamic> toFirestore() {
    return {
      'participants': participants,
      'lastMessage': lastMessage,
      'lastMessageTimestamp': lastMessageTimestamp,
      'unreadCounts': unreadCounts,
      'deletedFor': deletedFor,
      'typingStatus': typingStatus,
    };
  }
}
