import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:tenacity/src/models/feedback_model.dart';

class FeedbackService {
  final CollectionReference feedbackCollection =
      FirebaseFirestore.instance.collection('feedback');

  Future<void> addFeedback(StudentFeedback feedback) async {
    try {
      await feedbackCollection.add(feedback.toMap());
    } catch (e) {
      print('Error adding feedback: $e');
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
      print('Error deleting feedback: $e');
      rethrow;
    }
  }

  Future<void> updateFeedback(String feedbackId, String feedback) async {
    try {
      await feedbackCollection.doc(feedbackId).update({'feedback': feedback});
    } catch (e) {
      print('Error updating feedback: $e');
      rethrow;
    }
  }
}
