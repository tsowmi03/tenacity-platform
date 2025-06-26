import 'package:cloud_firestore/cloud_firestore.dart';

class Message {
  final String id;
  final String senderId;
  final String text;
  final String? mediaUrl;
  final String? thumbnailUrl;
  final String type;
  final Timestamp timestamp;
  final Map<String, Timestamp> readBy;
  final bool isPending;
  final String? fileName;
  final int? fileSize;

  Message({
    required this.id,
    required this.senderId,
    required this.text,
    this.mediaUrl,
    this.thumbnailUrl,
    required this.type,
    required this.timestamp,
    required this.readBy,
    this.isPending = false,
    this.fileName,
    this.fileSize,
  });

  // Convert Firestore document into Message object
  factory Message.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;

    return Message(
      id: doc.id,
      senderId: data['senderId'] ?? '',
      text: data['text'] ?? '',
      mediaUrl: data['mediaUrl'],
      thumbnailUrl: data['thumbnailUrl'],
      type: data['type'] ?? 'text',
      timestamp: data['timestamp'] ?? Timestamp.now(),
      readBy: (data['readBy'] as Map<String, dynamic>?)
              ?.map((key, value) => MapEntry(key, value as Timestamp)) ??
          {},
      isPending: data['isPending'] ?? false,
      fileName: data['fileName'],
      fileSize: data['fileSize'],
    );
  }

  // Convert Message object into a Firestore-compatible map
  Map<String, dynamic> toFirestore() {
    return {
      'senderId': senderId,
      'text': text,
      'mediaUrl': mediaUrl,
      'thumbnailUrl': thumbnailUrl,
      'type': type,
      'timestamp': timestamp,
      'readBy': readBy,
      'isPending': isPending,
      'fileName': fileName,
      'fileSize': fileSize,
    };
  }
}
