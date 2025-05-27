import 'package:cloud_firestore/cloud_firestore.dart';

class StudentFeedback {
  final String id;
  final String studentId;
  final String tutorId;
  final List<String> parentIds;
  final String feedback;
  final String subject;
  final DateTime createdAt;
  final bool isUnread;

  StudentFeedback({
    required this.id,
    required this.studentId,
    required this.tutorId,
    required this.parentIds,
    required this.feedback,
    required this.subject,
    required this.createdAt,
    required this.isUnread,
  });

  factory StudentFeedback.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return StudentFeedback(
      id: doc.id,
      studentId: data['studentId'] ?? '',
      tutorId: data['tutorId'] ?? '',
      parentIds: List<String>.from(data['parentIds'] ?? []),
      feedback: data['feedback'] ?? '',
      subject: data['subject'] ?? '',
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      isUnread: data['isUnread'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'studentId': studentId,
      'tutorId': tutorId,
      'parentIds': parentIds,
      'feedback': feedback,
      'subject': subject,
      'createdAt': Timestamp.fromDate(createdAt),
      'isUnread': isUnread,
    };
  }
}
