import 'package:cloud_firestore/cloud_firestore.dart';

class StudentFeedback {
  final String id;
  final String studentId;
  final String tutorId;
  final String parentId;
  final String feedback;
  final DateTime createdAt;

  StudentFeedback({
    required this.id,
    required this.studentId,
    required this.tutorId,
    required this.parentId,
    required this.feedback,
    required this.createdAt,
  });

  factory StudentFeedback.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return StudentFeedback(
      id: doc.id,
      studentId: data['studentId'] ?? '',
      tutorId: data['tutorId'] ?? '',
      parentId: data['parentId'] ?? '',
      feedback: data['feedback'] ?? '',
      createdAt: (data['createdAt'] as Timestamp).toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'studentId': studentId,
      'tutorId': tutorId,
      'parentId': parentId,
      'feedback': feedback,
      'createdAt': createdAt,
    };
  }
}
