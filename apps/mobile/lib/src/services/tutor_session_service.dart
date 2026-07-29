import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/feedback_model.dart';

/// The Firestore update for one save of the roll.
///
/// Pure, so what a save does and does not touch is testable without Firestore.
/// Two properties matter and neither is obvious from the call site:
///
/// - Each mark is its own `marks.<studentId>` field path, so a co-tutor's
///   marks on the same document survive. A whole-map write is what let the
///   second tutor to save replace the first tutor's work.
/// - There is no `attendance` key. That array is the booking record — capacity,
///   the family's timetable and the backend's lesson reminders all read it —
///   and the roll writing it is what un-booked absent students and fired
///   "removed from class" alerts at admins on every Away mark.
///
/// A partial save leaves any completion stamp alone rather than clearing it: a
/// co-tutor may have finished the roll between this tutor loading it and
/// saving, and their stamp is not this save's to revoke.
Map<String, Object?> rollUpdateFor({
  required Map<String, RollMark> marks,
  required bool markRollComplete,
  required String completedBy,
  required DateTime now,
}) {
  return {
    for (final entry in marks.entries) 'marks.${entry.key}': entry.value.value,
    'updatedAt': Timestamp.fromDate(now),
    'updatedBy': completedBy,
    if (markRollComplete) ...{
      'rollCompletedAt': Timestamp.fromDate(now),
      'rollCompletedBy': completedBy,
    },
  };
}

/// The document id for one student's feedback from one session.
///
/// Derived rather than generated, so two tutors writing about the same student
/// land on the same document. With `add()` they each created one and the family
/// received two notes about the same lesson.
String sessionFeedbackId({
  required String sessionId,
  required String studentId,
}) =>
    '${sessionId}_$studentId';

/// Writes a tutor's session: the roll, and the feedback written alongside it.
///
/// The two live in different collections, so this orders them deliberately.
/// Feedback goes first and the roll's completion stamp last, because that
/// stamp is what the rest of the app reads as "this session is done". Writing
/// it before the feedback landed would mark a session complete that still owed
/// families their notes.
///
/// Every write here is scoped to what this tutor actually touched. Most
/// classes are taught by two tutors, and both mark the roll from their own
/// phone; a whole-document write meant the second save replaced the first.
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
  /// [marks] holds only the students this tutor marked. Each becomes its own
  /// `marks.<studentId>` field, so a co-tutor's marks on the same document
  /// survive. The booking list is never written: a student marked away stays
  /// booked, which is what keeps their seat taken and their lesson reminder
  /// coming.
  ///
  /// [feedback] holds the records the caller believes are unsent.
  /// [markRollComplete] is false when students are still unmarked, in which
  /// case the completion stamp is left alone rather than cleared — a co-tutor
  /// may have finished the roll between this tutor loading it and saving.
  ///
  /// Throws if anything fails. Nothing is stamped complete in that case, so a
  /// retry resumes rather than double-sending.
  Future<void> submitSession({
    required String classId,
    required String sessionId,
    required Map<String, RollMark> marks,
    required List<StudentFeedback> feedback,
    required bool markRollComplete,
    required String completedBy,
  }) async {
    await _writeFeedback(
      classId: classId,
      sessionId: sessionId,
      feedback: feedback,
    );

    try {
      await _firestore
          .collection('classes')
          .doc(classId)
          .collection('attendance')
          .doc(sessionId)
          .update(rollUpdateFor(
            marks: marks,
            markRollComplete: markRollComplete,
            completedBy: completedBy,
            now: DateTime.now(),
          ));
    } catch (e) {
      debugPrint('[TutorSessionService] roll write failed for $classId: $e');
      rethrow;
    }
  }

  /// Writes the session's feedback, one record per student.
  ///
  /// Re-reads what has already been written rather than trusting the snapshot
  /// the screen loaded with: with two tutors on one class, the co-tutor's
  /// notes can land in between, and sending the family a second note about the
  /// same lesson is the failure worth spending a read to avoid.
  ///
  /// The document id is derived from the session and student, so even if that
  /// read races the write cannot duplicate — at worst it overwrites a note
  /// with an equally valid one.
  Future<void> _writeFeedback({
    required String classId,
    required String sessionId,
    required List<StudentFeedback> feedback,
  }) async {
    if (feedback.isEmpty) return;

    final existing = await feedbackForSession(
      classId: classId,
      sessionId: sessionId,
    );
    final alreadyWritten = existing.map((e) => e.studentId).toSet();

    for (final entry in feedback) {
      if (alreadyWritten.contains(entry.studentId)) continue;

      final id = sessionFeedbackId(
        sessionId: sessionId,
        studentId: entry.studentId,
      );

      await _feedbackCollection.doc(id).set({
        'studentId': entry.studentId,
        'tutorId': entry.tutorId,
        'parentIds': entry.parentIds,
        'subject': entry.subject.trim(),
        'feedback': entry.feedback.trim(),
        // The rules require createdAt == request.time.
        'createdAt': FieldValue.serverTimestamp(),
        'isUnread': true,
        'classId': classId,
        'sessionId': sessionId,
        if (entry.progress != null) 'progress': entry.progress!.value,
      });
    }
  }
}
