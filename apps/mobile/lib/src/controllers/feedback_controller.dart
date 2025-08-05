import 'package:flutter/material.dart';
import 'package:rxdart/rxdart.dart';
import 'package:tenacity/src/models/feedback_model.dart';
import 'package:tenacity/src/services/feedback_service.dart';

class FeedbackController extends ChangeNotifier {
  final FeedbackService service;

  FeedbackController({required this.service});

  Stream<List<StudentFeedback>> getFeedbackByStudentId(String studentId) {
    return service.getFeedbackByStudentId(studentId);
  }

  Future<void> addFeedback(StudentFeedback feedback) async {
    try {
      await service.addFeedback(feedback);
    } catch (e) {
      debugPrint('Error adding feedback: $e');
      rethrow;
    }
  }

  Future<void> deleteFeedback(String feedbackId) async {
    try {
      await service.deleteFeedback(feedbackId);
    } catch (e) {
      debugPrint('Error deleting feedback: $e');
      rethrow;
    }
  }

  Future<void> updateFeedback(String feedbackId, String feedback) async {
    try {
      await service.updateFeedback(feedbackId, feedback);
    } catch (e) {
      debugPrint('Error updating feedback: $e');
      rethrow;
    }
  }

  Future<void> markAsRead(List<String> feedbackIds) async {
    try {
      await service.markAsRead(feedbackIds);
    } catch (e) {
      debugPrint('Error marking feedback as read: $e');
      rethrow;
    }
  }

  Stream<int> getUnreadFeedbackCount(String studentId) {
    return service.getUnreadFeedbackCount(studentId);
  }

  Stream<int> getTotalUnreadCountAcrossChildren(List<String> studentIds) {
    final streams = studentIds.map(getUnreadFeedbackCount);
    return CombineLatestStream.list<int>(streams)
        .map((list) => list.fold(0, (sum, v) => sum + v));
  }
}
