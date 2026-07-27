import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:tenacity/src/models/feedback_model.dart';

class FeedbackService {
  FeedbackService(
      {CollectionReference<Map<String, dynamic>>? feedbackCollection})
      : feedbackCollection = feedbackCollection ??
            FirebaseFirestore.instance.collection('feedback');

  final CollectionReference<Map<String, dynamic>> feedbackCollection;

  Future<void> addFeedback(StudentFeedback feedback) async {
    try {
      await feedbackCollection.add({
        'studentId': feedback.studentId,
        'tutorId': feedback.tutorId,
        'parentIds': feedback.parentIds,
        'subject': feedback.subject.trim(),
        'feedback': feedback.feedback.trim(),
        // The rules require createdAt == request.time, so the server stamps
        // it rather than trusting the device clock.
        'createdAt': FieldValue.serverTimestamp(),
        'isUnread': feedback.isUnread,
        // Tutor-session contract. Omitted when absent: the rules constrain
        // exactly which keys a feedback document may carry, and standalone
        // admin feedback has none of these.
        if (feedback.classId != null) 'classId': feedback.classId,
        if (feedback.sessionId != null) 'sessionId': feedback.sessionId,
        if (feedback.progress != null) 'progress': feedback.progress!.value,
      });
    } catch (e) {
      rethrow;
    }
  }

  Stream<List<StudentFeedback>> getFeedbackByStudentId(String studentId) {
    return feedbackCollection
        .where('studentId', isEqualTo: studentId)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => StudentFeedback.fromDoc(doc)).toList());
  }

  Future<void> deleteFeedback(String feedbackId) async {
    try {
      await feedbackCollection.doc(feedbackId).delete();
    } catch (e) {
      rethrow;
    }
  }

  Future<void> updateFeedback(String feedbackId, String feedback) async {
    try {
      await feedbackCollection.doc(feedbackId).update({'feedback': feedback});
    } catch (e) {
      rethrow;
    }
  }

  // Accepts a list of feedback IDs and marks them as read in the backend.
  Future<void> markAsRead(List<String> feedbackIds) async {
    final batch = FirebaseFirestore.instance.batch();
    for (final id in feedbackIds) {
      final ref = feedbackCollection.doc(id);
      batch.update(ref, {'isUnread': false});
    }
    await batch.commit();
  }

  Stream<int> getUnreadFeedbackCount(String studentId) {
    return FirebaseFirestore.instance
        .collection('feedback')
        .where('studentId', isEqualTo: studentId)
        .where('isUnread', isEqualTo: true)
        .snapshots()
        .map((snapshot) => snapshot.size);
  }
}
