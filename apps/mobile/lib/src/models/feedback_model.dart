import 'package:cloud_firestore/cloud_firestore.dart';

/// How a student went in a session, as the tutor judged it.
///
/// Stored as a stable string rather than an index, so reordering the pills in
/// the UI cannot silently reinterpret existing records.
enum StudentProgress {
  ahead('ahead', 'Ahead'),
  onTrack('onTrack', 'On track'),
  needsSupport('needsSupport', 'Needs support');

  final String value;
  final String label;

  const StudentProgress(this.value, this.label);

  static StudentProgress? fromValue(String? value) {
    if (value == null) return null;
    for (final progress in StudentProgress.values) {
      if (progress.value == value) return progress;
    }
    // An unrecognised value is dropped rather than guessed at — a newer client
    // may have written a status this build does not know about.
    return null;
  }
}

class StudentFeedback {
  final String id;
  final String studentId;
  final String tutorId;
  final List<String> parentIds;
  final String feedback;
  final String subject;
  final DateTime createdAt;
  final bool isUnread;

  /// The class this feedback came out of, and the specific session within it.
  ///
  /// Part of the tutor-session contract. [sessionId] is the attendance
  /// document id (`<termId>_W<week>`), so feedback and the roll it was written
  /// alongside can be matched up. Both are null on feedback written before the
  /// contract, and on feedback an admin creates outside a session.
  final String? classId;
  final String? sessionId;

  /// Null when the tutor recorded feedback without choosing a progress status,
  /// and on every record written before the contract.
  final StudentProgress? progress;

  /// When the note was last changed after being sent, or null on one that has
  /// never been edited.
  ///
  /// The family is told the note changed rather than left to compare it against
  /// what they remember reading. Editing deliberately sends no second
  /// notification, so this marker is the only signal they get.
  final DateTime? editedAt;

  StudentFeedback({
    required this.id,
    required this.studentId,
    required this.tutorId,
    required this.parentIds,
    required this.feedback,
    required this.subject,
    required this.createdAt,
    required this.isUnread,
    this.classId,
    this.sessionId,
    this.progress,
    this.editedAt,
  });

  factory StudentFeedback.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final createdAt = data['createdAt'];
    final editedAt = data['editedAt'];
    return StudentFeedback(
      id: doc.id,
      studentId: data['studentId'] ?? '',
      tutorId: data['tutorId'] ?? '',
      parentIds: List<String>.from(data['parentIds'] ?? []),
      feedback: data['feedback'] ?? '',
      subject: data['subject'] ?? '',
      createdAt: createdAt is Timestamp ? createdAt.toDate() : DateTime.now(),
      isUnread: data['isUnread'] ?? false,
      classId: data['classId'] as String?,
      sessionId: data['sessionId'] as String?,
      progress: StudentProgress.fromValue(data['progress'] as String?),
      // Server-stamped, so it reads back as null for the moment between the
      // edit being written and the server confirming it.
      editedAt: editedAt is Timestamp ? editedAt.toDate() : null,
    );
  }

  /// Whether the note has been changed since the family was told about it.
  bool get isEdited => editedAt != null;

  /// Whether this record came from a marked roll rather than being entered
  /// standalone.
  bool get isSessionLinked => classId != null && sessionId != null;

  Map<String, dynamic> toMap() {
    return {
      'studentId': studentId,
      'tutorId': tutorId,
      'parentIds': parentIds,
      'feedback': feedback,
      'subject': subject,
      'createdAt': Timestamp.fromDate(createdAt),
      'isUnread': isUnread,
      // Omitted rather than written as null: the security rules constrain
      // exactly which keys a feedback document may carry, and a standalone
      // record legitimately has none of these.
      if (classId != null) 'classId': classId,
      if (sessionId != null) 'sessionId': sessionId,
      if (progress != null) 'progress': progress!.value,
      if (editedAt != null) 'editedAt': Timestamp.fromDate(editedAt!),
    };
  }

  /// [clearProgress] removes the status rather than leaving it, since passing
  /// null cannot be told apart from omitting the argument. A tutor who taps the
  /// selected pill off is clearing it deliberately.
  StudentFeedback copyWith({
    String? id,
    String? studentId,
    String? tutorId,
    List<String>? parentIds,
    String? feedback,
    String? subject,
    DateTime? createdAt,
    bool? isUnread,
    String? classId,
    String? sessionId,
    StudentProgress? progress,
    DateTime? editedAt,
    bool clearProgress = false,
  }) {
    return StudentFeedback(
      id: id ?? this.id,
      studentId: studentId ?? this.studentId,
      tutorId: tutorId ?? this.tutorId,
      parentIds: parentIds ?? this.parentIds,
      feedback: feedback ?? this.feedback,
      subject: subject ?? this.subject,
      createdAt: createdAt ?? this.createdAt,
      isUnread: isUnread ?? this.isUnread,
      classId: classId ?? this.classId,
      sessionId: sessionId ?? this.sessionId,
      progress: clearProgress ? null : (progress ?? this.progress),
      editedAt: editedAt ?? this.editedAt,
    );
  }
}
