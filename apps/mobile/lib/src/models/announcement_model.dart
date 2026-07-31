import 'package:cloud_firestore/cloud_firestore.dart';

class Announcement {
  final String id;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool archived;
  final String audience;

  Announcement({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    required this.archived,
    required this.audience,
  });

  factory Announcement.fromFirestore(
      Map<String, dynamic> data, String documentId) {
    return Announcement(
      id: documentId,
      title: data['title'] ?? '',
      body: data['body'] ?? '',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      archived: data['archived'] as bool? ?? false,
      audience: data['audience'] ?? 'all',
    );
  }

  Announcement copyWith({
    String? title,
    String? body,
    DateTime? createdAt,
    bool? archived,
    String? audience,
  }) {
    return Announcement(
      id: id,
      title: title ?? this.title,
      body: body ?? this.body,
      createdAt: createdAt ?? this.createdAt,
      archived: archived ?? this.archived,
      audience: audience ?? this.audience,
    );
  }
}
