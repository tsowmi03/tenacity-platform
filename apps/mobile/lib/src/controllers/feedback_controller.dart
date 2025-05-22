import 'package:flutter/material.dart';
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
      print('Error adding feedback: $e');
      rethrow;
    }
  }

  Future<void> deleteFeedback(String feedbackId) async {
    try {
      await service.deleteFeedback(feedbackId);
    } catch (e) {
      print('Error deleting feedback: $e');
      rethrow;
    }
  }

  Future<void> updateFeedback(String feedbackId, String feedback) async {
    try {
      await service.updateFeedback(feedbackId, feedback);
    } catch (e) {
      print('Error updating feedback: $e');
      rethrow;
    }
  }
}
