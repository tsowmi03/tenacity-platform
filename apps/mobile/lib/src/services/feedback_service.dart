import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:tenacity/src/models/feedback_model.dart';

class FeedbackService {
  final CollectionReference feedbackCollection =
      FirebaseFirestore.instance.collection('feedback');

  Future<void> addFeedback(StudentFeedback feedback) async {
    try {
      await feedbackCollection.add(feedback.toMap());
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

  Future<void> updateFeedback(
      String feedbackId, String feedback, String subject) async {
    try {
      await feedbackCollection.doc(feedbackId).update({
        'feedback': feedback,
        'subject': subject,
      });
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
