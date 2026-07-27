import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';

/// Writes a tutor's session: the roll, and the feedback written alongside it.
///
/// The two live in different collections, so this orders them deliberately.
/// Feedback goes first and the roll's completion stamp last, because that
/// stamp is what the rest of the app reads as "this session is done". Writing
/// it before the feedback landed would mark a session complete that still owed
/// families their notes.
class TutorSessionService {
  TutorSessionService({
    FirebaseFirestore? firestore,
    CollectionReference<Map<String, dynamic>>? feedbackCollection,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _feedbackCollection = feedbackCollection ??
            (firestore ?? FirebaseFirestore.instance).collection('feedback');

  final FirebaseFirestore _firestore;
  final CollectionReference<Map<String, dynamic>> _feedbackCollection;

  /// Feedback already written against this session, keyed by student.
  ///
  /// Used to make submission idempotent: a retry after a partial failure must
  /// not send a family a second copy of the same note. Only possible because
  /// feedback now carries the class and session it came from.
  Future<List<StudentFeedback>> feedbackForSession({
    required String classId,
    required String sessionId,
  }) async {
    final snapshot = await _feedbackCollection
        .where('classId', isEqualTo: classId)
        .where('sessionId', isEqualTo: sessionId)
        .get();

    return snapshot.docs.map(StudentFeedback.fromDoc).toList(growable: false);
  }

  /// Submits one session.
  ///
  /// [feedback] holds only the records to create — the caller drops students
  /// whose feedback was already sent. [markRollComplete] is false when some
  /// students are still unmarked, so a partial roll saves without claiming to
  /// be finished.
  ///
  /// Throws if anything fails. Nothing is stamped complete in that case, so a
  /// retry resumes rather than double-sending.
  Future<void> submitSession({
    required String classId,
    required Attendance attendance,
    required List<StudentFeedback> feedback,
    required bool markRollComplete,
    required String completedBy,
  }) async {
    for (final entry in feedback) {
      await _feedbackCollection.add({
        'studentId': entry.studentId,
        'tutorId': entry.tutorId,
        'parentIds': entry.parentIds,
        'subject': entry.subject.trim(),
        'feedback': entry.feedback.trim(),
        // The rules require createdAt == request.time.
        'createdAt': FieldValue.serverTimestamp(),
        'isUnread': true,
        'classId': classId,
        'sessionId': attendance.id,
        if (entry.progress != null) 'progress': entry.progress!.value,
      });
    }

    final now = DateTime.now();
    final updated = attendance.copyWith(
      updatedAt: now,
      updatedBy: completedBy,
      rollCompletedAt: markRollComplete ? now : null,
      rollCompletedBy: markRollComplete ? completedBy : null,
    );

    // A partial roll must clear any earlier stamp rather than keep it: a tutor
    // reopening a finished roll to unmark someone has un-finished it.
    final payload =
        markRollComplete ? updated.toMap() : updated.withRollReopened().toMap();

    try {
      await _firestore
          .collection('classes')
          .doc(classId)
          .collection('attendance')
          .doc(attendance.id)
          .update({
        ...payload,
        'updatedAt': Timestamp.fromDate(now),
        'updatedBy': completedBy,
      });
    } catch (e) {
      debugPrint('[TutorSessionService] roll write failed for $classId: $e');
      rethrow;
    }
  }
}
