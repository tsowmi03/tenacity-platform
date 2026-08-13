import 'package:cloud_firestore/cloud_firestore.dart';

class Chat {
  final String id;
  final List<String> participants;
  final String lastMessage;
  final Timestamp updatedAt;
  final Map<String, int> unreadCounts;
  final Map<String, Timestamp?> deletedFor;
  final Map<String, bool> typingStatus;

  /// Set by the backend when a participant's account is deleted. The thread
  /// stays in Firestore as a record but leaves everyone's inbox, and the
  /// backend refuses further messages.
  ///
  /// Absent on every chat written before this existed, hence the default.
  final bool inactive;

  Chat({
    required this.id,
    required this.participants,
    required this.lastMessage,
    required this.updatedAt,
    required this.unreadCounts,
    required this.deletedFor,
    required this.typingStatus,
    this.inactive = false,
  });

  /// Whether this thread belongs in [userId]'s inbox.
  ///
  /// Two ways a thread drops out: the user deleted it themselves, or the
  /// backend retired it because the other participant's account was deleted.
  /// Missing the second case is what left parents with "Unknown User" rows
  /// they could open and type into.
  bool isVisibleTo(String userId) => deletedFor[userId] == null && !inactive;

  // Convert Firestore document into Chat object
  factory Chat.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;

    return Chat(
      id: doc.id,
      participants: List<String>.from(data['participants']),
      lastMessage: data['lastMessage'] ?? '',
      updatedAt: data['updatedAt'] ?? Timestamp.now(),
      unreadCounts: (data['unreadCounts'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as int)) ??
          {},
      deletedFor: (data['deletedFor'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as Timestamp?)) ??
          {},
      typingStatus: (data['typingStatus'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as bool)) ??
          {},
      inactive: data['inactive'] == true,
    );
  }

  // Convert Chat object into a Firestore-compatible map
  Map<String, dynamic> toFirestore() {
    return {
      'participants': participants,
      'lastMessage': lastMessage,
      'updatedAt': updatedAt,
      'unreadCounts': unreadCounts,
      'deletedFor': deletedFor,
      'typingStatus': typingStatus,
      'inactive': inactive,
    };
  }
}
