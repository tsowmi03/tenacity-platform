import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/one_off_enrollment_result_model.dart';
import 'package:tenacity/src/models/permanent_enrollment_result_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/models/waitlist_promotion_result_model.dart';

/// Raised when a tutor assignment changed after the editor was opened.
///
/// The caller must reload instead of overwriting the newer assignment. Tutor
/// order is not significant, so conflicts compare ids as sets.
class TutorAssignmentConflictException implements Exception {
  final List<String> targetIds;

  const TutorAssignmentConflictException(this.targetIds);

  @override
  String toString() {
    final targets = targetIds.join(', ');
    return 'Tutor assignments changed while this editor was open'
        '${targets.isEmpty ? '.' : ': $targets'}';
  }
}

/// Raised when the standing class assignment committed, but propagating it to
/// generated future attendance documents failed.
///
/// Those two phases cannot be one Firestore transaction: discovering the
/// attendance subcollection documents requires queries, while transaction
/// reads must be direct document reads. The exception makes the partial result
/// explicit so the UI never reports the whole operation as successful.
class TutorAssignmentPropagationException implements Exception {
  final Object cause;

  const TutorAssignmentPropagationException(this.cause);

  @override
  String toString() =>
      'The standing tutor assignment was saved, but future sessions could not '
      'all be updated: $cause';
}

class SessionBookingsConflictException implements Exception {
  final String classId;

  const SessionBookingsConflictException(this.classId);

  @override
  String toString() =>
      'Session bookings changed while the editor was open: $classId';
}

bool sameIdSet(Iterable<String> left, Iterable<String> right) {
  return left.toSet().length == right.toSet().length &&
      left.toSet().containsAll(right);
}

/// Tutor ids are an unordered assignment, not a teaching sequence.
bool sameTutorAssignment(Iterable<String> left, Iterable<String> right) {
  return sameIdSet(left, right);
}

Map<String, Object?> adminCreateClassRequest({
  required ClassModel classModel,
  required List<String> termIds,
  DateTime? attendanceFromDate,
}) {
  return {
    'id': classModel.id,
    'type': classModel.type,
    'day': classModel.dayOfWeek,
    'startTime': classModel.startTime,
    'endTime': classModel.endTime,
    'capacity': classModel.capacity,
    'tutors': List<String>.unmodifiable(classModel.tutors),
    'enrolledStudents': List<String>.unmodifiable(classModel.enrolledStudents),
    'termIds': List<String>.unmodifiable(termIds),
    'generateAttendance': termIds.isNotEmpty,
    if (attendanceFromDate != null)
      'attendanceFromDate': attendanceFromDate.toUtc().toIso8601String(),
  };
}

bool hasSameClassCreationValues(
  ClassModel persisted,
  ClassModel requested,
) {
  return persisted.id == requested.id &&
      persisted.type == requested.type &&
      persisted.dayOfWeek == requested.dayOfWeek &&
      persisted.startTime == requested.startTime &&
      persisted.endTime == requested.endTime &&
      persisted.capacity == requested.capacity &&
      sameIdSet(persisted.tutors, requested.tutors) &&
      sameIdSet(persisted.enrolledStudents, requested.enrolledStudents);
}

/// The field-narrow write used for both class and attendance documents.
///
/// Keeping this pure makes the safety boundary testable: a tutor edit must
/// never carry capacity, enrolments, roll marks, or any other stale fields.
Map<String, Object?> tutorAssignmentUpdate({
  required List<String> tutorIds,
  required String updatedBy,
  Object? updatedAt,
}) {
  return {
    'tutors': List<String>.unmodifiable(tutorIds),
    'updatedAt': updatedAt ?? FieldValue.serverTimestamp(),
    'updatedBy': updatedBy,
  };
}

Map<String, Object?> sessionBookingsUpdate({
  required List<String> studentIds,
  required String updatedBy,
  Object? updatedAt,
}) {
  return {
    'attendance': List<String>.unmodifiable(studentIds),
    'updatedAt': updatedAt ?? FieldValue.serverTimestamp(),
    'updatedBy': updatedBy,
  };
}

/// Whether an attendance document belongs in a standing-assignment
/// propagation that starts at [fromDate].
///
/// The previous `_Wn >= fromWeek` filter ignored the term id in the document
/// name, so week 5 of an old term could be rewritten while editing week 3 of
/// the current term. The stored session date is the cross-term boundary.
bool attendanceIsOnOrAfter(Object? storedDate, DateTime fromDate) {
  if (storedDate is! Timestamp) return false;
  return !storedDate.toDate().isBefore(fromDate);
}

/// Returns the generated session ids that still need to be created.
///
/// Generation is retryable: an existing session may already contain one-off
/// bookings, cancellations, tutor changes, or roll marks. Retrying must never
/// replace that document with the class defaults.
List<String> missingGeneratedAttendanceIds({
  required Iterable<String> plannedIds,
  required Iterable<String> existingIds,
}) {
  final existing = existingIds.toSet();
  return plannedIds.where((id) => !existing.contains(id)).toList();
}

class TimetableService {
  // References to top-level collections in Firestore
  final CollectionReference _termRef =
      FirebaseFirestore.instance.collection('terms');

  final CollectionReference _classesRef =
      FirebaseFirestore.instance.collection('classes');

  final CollectionReference _waitlistEntriesRef =
      FirebaseFirestore.instance.collection('waitlistEntries');

  /// --------------------------------
  ///           TERM METHODS
  /// --------------------------------

  /// Fetch a single Term by ID
  Future<Term?> fetchTermById(String termId) async {
    try {
      final doc = await _termRef.doc(termId).get();
      if (!doc.exists) return null;

      return Term.fromMap(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      debugPrint('Error fetching term $termId: $e');
      return null;
    }
  }

  Future<List<Term>> fetchAllTerms() async {
    debugPrint('[TimetableService] fetchAllTerms called');
    try {
      final snapshots = await _termRef.get();
      debugPrint(
          '[TimetableService] fetchAllTerms got ${snapshots.docs.length} docs');
      return snapshots.docs.map((doc) {
        return Term.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }).toList();
    } catch (e) {
      debugPrint('[TimetableService] fetchAllTerms error: $e');
      return [];
    }
  }

  Future<Term?> fetchActiveOrUpcomingTerm() async {
    debugPrint('[TimetableService] fetchActiveOrUpcomingTerm called');
    try {
      final activeTermQuery =
          await _termRef.where('status', isEqualTo: 'active').limit(1).get();
      debugPrint(
          '[TimetableService] activeTermQuery docs: ${activeTermQuery.docs.length}');
      if (activeTermQuery.docs.isNotEmpty) {
        final doc = activeTermQuery.docs.first;
        debugPrint('[TimetableService] returning active term: ${doc.id}');
        return Term.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }
      final now = DateTime.now();
      final upcomingQuery = await _termRef
          .where('startDate', isGreaterThan: Timestamp.fromDate(now))
          .orderBy('startDate', descending: false)
          .limit(1)
          .get();
      debugPrint(
          '[TimetableService] upcomingQuery docs: ${upcomingQuery.docs.length}');
      if (upcomingQuery.docs.isNotEmpty) {
        final doc = upcomingQuery.docs.first;
        debugPrint('[TimetableService] returning upcoming term: ${doc.id}');
        return Term.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }
      debugPrint('[TimetableService] no active/upcoming term found');
      return null;
    } catch (e) {
      debugPrint('[TimetableService] fetchActiveOrUpcomingTerm error: $e');
      return null;
    }
  }

  /// Create a new Term document in Firestore
  Future<void> createTerm(Term term) async {
    try {
      await _termRef.doc(term.id).set(term.toMap());
    } catch (e) {
      debugPrint('Error creating term ${term.id}: $e');
    }
  }

  /// Update an existing Term document
  Future<void> updateTerm(Term term) async {
    try {
      await _termRef.doc(term.id).update(term.toMap());
    } catch (e) {
      debugPrint('Error updating term ${term.id}: $e');
    }
  }

  /// Delete a Term by ID
  Future<void> deleteTerm(String termId) async {
    try {
      await _termRef.doc(termId).delete();
    } catch (e) {
      debugPrint('Error deleting term $termId: $e');
    }
  }

  /// --------------------------------
  ///        CLASS MODEL METHODS
  /// --------------------------------

  /// Fetch all classes
  Future<List<ClassModel>> fetchAllClasses() async {
    debugPrint('[TimetableService] fetchAllClasses called');
    try {
      final snapshots = await _classesRef.get();
      debugPrint(
          '[TimetableService] fetchAllClasses got ${snapshots.docs.length} docs');
      return snapshots.docs.map((doc) {
        return ClassModel.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }).toList();
    } catch (e) {
      debugPrint('[TimetableService] fetchAllClasses error: $e');
      return [];
    }
  }

  /// --------------------------------
  ///          WAITLIST METHODS
  /// --------------------------------

  Future<WaitlistEntry?> fetchWaitlistEntryForStudentInClass({
    required String classId,
    required String studentId,
  }) async {
    try {
      final entryId = _waitlistEntryId(classId, studentId);
      final doc = await _waitlistEntriesRef.doc(entryId).get();
      if (!doc.exists) return null;

      return WaitlistEntry.fromMap(
        doc.data() as Map<String, dynamic>,
        doc.id,
      );
    } catch (e) {
      debugPrint(
          'Error fetching waitlist entry for $studentId in $classId: $e');
      return null;
    }
  }

  Future<List<WaitlistEntry>> fetchWaitlistEntriesForClass({
    required String classId,
    WaitlistStatus? status,
  }) async {
    try {
      final snapshots =
          await _waitlistEntriesRef.where('classId', isEqualTo: classId).get();

      final entries = snapshots.docs
          .map((doc) => WaitlistEntry.fromMap(
                doc.data() as Map<String, dynamic>,
                doc.id,
              ))
          .where((entry) => status == null || entry.status == status)
          .toList()
        ..sort((a, b) => a.position.compareTo(b.position));

      return entries;
    } catch (e) {
      debugPrint('Error fetching waitlist entries for class $classId: $e');
      rethrow;
    }
  }

  Future<List<WaitlistEntry>> fetchWaitlistEntriesForParent({
    required String parentId,
    WaitlistStatus? status,
  }) async {
    try {
      final snapshots = await _waitlistEntriesRef
          .where('parentId', isEqualTo: parentId)
          .get();

      final entries = snapshots.docs
          .map((doc) => WaitlistEntry.fromMap(
                doc.data() as Map<String, dynamic>,
                doc.id,
              ))
          .where((entry) => status == null || entry.status == status)
          .toList()
        ..sort((a, b) => a.createdAt.compareTo(b.createdAt));

      return entries;
    } catch (e) {
      debugPrint('Error fetching waitlist entries for parent $parentId: $e');
      return [];
    }
  }

  Future<WaitlistEntry> joinWaitlist({
    required String classId,
    required String studentId,
    required String parentId,
    required WaitlistReason reason,
  }) async {
    try {
      final callable = FirebaseFunctions.instance.httpsCallable('joinWaitlist');
      final response = await callable.call<Map<String, dynamic>>({
        'classId': classId,
        'studentId': studentId,
        'parentId': parentId,
        'reason': reason.value,
      });

      final entryId = response.data['entryId'] as String? ??
          _waitlistEntryId(classId, studentId);
      final doc = await _waitlistEntriesRef.doc(entryId).get();
      if (!doc.exists) {
        throw Exception('Waitlist entry $entryId was not found after join');
      }

      return WaitlistEntry.fromMap(
        doc.data() as Map<String, dynamic>,
        doc.id,
      );
    } catch (e) {
      debugPrint('Error joining waitlist for $studentId in $classId: $e');
      rethrow;
    }
  }

  Future<PermanentEnrollmentResult> enrollStudentPermanentForParent({
    required String classId,
    required String studentId,
    required String parentId,
  }) async {
    try {
      final callable = FirebaseFunctions.instance
          .httpsCallable('enrollStudentPermanentForParent');
      final response = await callable.call<Map<String, dynamic>>({
        'classId': classId,
        'studentId': studentId,
        'parentId': parentId,
      });

      final data = response.data;
      final classState =
          _classEnrollmentStateFromString(data['classState'] as String?);
      final outcome = data['outcome'] as String?;
      final firstAttendanceDate =
          _dateTimeFromCallableValue(data['firstAttendanceDate']);
      final attendanceSessionsAdded =
          (data['attendanceSessionsAdded'] as num?)?.toInt() ?? 0;
      final skippedFullSessionCount =
          (data['skippedFullSessionCount'] as num?)?.toInt() ?? 0;

      if (outcome == PermanentEnrollmentOutcome.enrolled.value) {
        return PermanentEnrollmentResult.enrolled(
          classState: classState,
          attendanceSessionsAdded: attendanceSessionsAdded,
          skippedFullSessionCount: skippedFullSessionCount,
          firstAttendanceDate: firstAttendanceDate,
        );
      }
      if (outcome == PermanentEnrollmentOutcome.alreadyEnrolled.value) {
        return PermanentEnrollmentResult.alreadyEnrolled(
          classState: classState,
        );
      }
      if (outcome == PermanentEnrollmentOutcome.waitlisted.value) {
        final waitlistEntryId = data['waitlistEntryId'] as String? ??
            _waitlistEntryId(classId, studentId);
        final waitlistDoc =
            await _waitlistEntriesRef.doc(waitlistEntryId).get();
        if (!waitlistDoc.exists) {
          throw Exception(
              'Waitlist entry $waitlistEntryId was not found after enrolment');
        }
        return PermanentEnrollmentResult.waitlisted(
          classState: classState,
          waitlistEntry: WaitlistEntry.fromMap(
            waitlistDoc.data() as Map<String, dynamic>,
            waitlistDoc.id,
          ),
        );
      }

      throw Exception('Unknown permanent enrolment outcome: $outcome');
    } catch (e) {
      debugPrint(
          'Error enrolling parent student $studentId permanently in $classId: $e');
      rethrow;
    }
  }

  Future<void> updateWaitlistEntryStatus({
    required String entryId,
    required WaitlistStatus status,
    DateTime? offerExpiresAt,
  }) async {
    try {
      final callable =
          FirebaseFunctions.instance.httpsCallable('updateWaitlistEntryStatus');
      await callable.call<Map<String, dynamic>>({
        'entryId': entryId,
        'status': status.value,
        if (offerExpiresAt != null)
          'offerExpiresAt': offerExpiresAt.millisecondsSinceEpoch,
      });
    } catch (e) {
      debugPrint('Error updating waitlist entry $entryId status: $e');
      rethrow;
    }
  }

  Future<void> leaveWaitlist({
    required String classId,
    required String studentId,
  }) async {
    await updateWaitlistEntryStatus(
      entryId: _waitlistEntryId(classId, studentId),
      status: WaitlistStatus.cancelled,
    );
  }

  Future<WaitlistPromotionResult> promoteWaitlistEntry({
    required String entryId,
  }) async {
    try {
      final callable =
          FirebaseFunctions.instance.httpsCallable('promoteWaitlistEntry');
      final response = await callable.call<Map<String, dynamic>>({
        'entryId': entryId,
      });
      final data = response.data;

      return WaitlistPromotionResult(
        outcome: _waitlistPromotionOutcomeFromString(
          data['outcome'] as String?,
        ),
        entryId: data['entryId'] as String? ?? entryId,
        classId: data['classId'] as String? ?? '',
        studentId: data['studentId'] as String? ?? '',
        parentId: data['parentId'] as String? ?? '',
        previousStatus: WaitlistStatusExtension.fromString(
          data['previousStatus'] as String? ?? WaitlistStatus.active.value,
        ),
        permanentSpotsRemaining:
            (data['permanentSpotsRemaining'] as num?)?.toInt() ?? 0,
      );
    } catch (e) {
      debugPrint('Error promoting waitlist entry $entryId: $e');
      rethrow;
    }
  }

  /// Fetch a single class by ID
  Future<ClassModel?> fetchClassById(String classId) async {
    try {
      final doc = await _classesRef.doc(classId).get();
      if (!doc.exists) return null;

      return ClassModel.fromMap(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      debugPrint('Error fetching class $classId: $e');
      rethrow;
    }
  }

  /// Creates a class and its requested attendance documents in the
  /// authoritative backend transaction.
  ///
  /// A lost callable response can make a successful creation look like a
  /// failure. Retrying the same stable id returns `already-exists`; matching
  /// the stored creation values proves that the atomic first attempt landed.
  Future<void> createClassWithAttendance({
    required ClassModel classModel,
    required List<String> termIds,
    DateTime? attendanceFromDate,
  }) async {
    try {
      final response = await FirebaseFunctions.instance
          .httpsCallable('adminCreateClass')
          .call<Map<String, dynamic>>(
            adminCreateClassRequest(
              classModel: classModel,
              termIds: termIds,
              attendanceFromDate: attendanceFromDate,
            ),
          );
      final returnedClassId = response.data['classId'];
      if (returnedClassId != classModel.id) {
        throw StateError(
          'adminCreateClass returned an unexpected class id.',
        );
      }
    } on FirebaseFunctionsException catch (error) {
      if (error.code != 'already-exists') {
        debugPrint('Error creating class ${classModel.id}: $error');
        rethrow;
      }

      final persisted = await fetchClassById(classModel.id);
      if (persisted == null ||
          !hasSameClassCreationValues(persisted, classModel)) {
        debugPrint(
          'Class ${classModel.id} already exists with different values.',
        );
        rethrow;
      }
    } catch (e) {
      debugPrint('Error creating class ${classModel.id}: $e');
      rethrow;
    }
  }

  Future<List<String>> fetchTutorsForClass(String classId) async {
    try {
      final doc = await _classesRef.doc(classId).get();
      if (!doc.exists) return [];

      final data = doc.data() as Map<String, dynamic>;
      return List<String>.from(data['tutors'] ?? []);
    } catch (e) {
      debugPrint('Error fetching tutors for class $classId: $e');
      return [];
    }
  }

  Future<List<String>> fetchTutorAttendance(
      String classId, String attendanceId) async {
    try {
      final doc = await _classesRef
          .doc(classId)
          .collection('attendance')
          .doc(attendanceId)
          .get();
      if (!doc.exists) return [];

      final data = doc.data() as Map<String, dynamic>;
      return List<String>.from(data['attendance'] ?? []);
    } catch (e) {
      debugPrint('Error fetching attendance for class $classId: $e');
      return [];
    }
  }

  /// Updates one or more generated sessions as one checked transaction.
  ///
  /// Every session is read before any write. If a session was removed or its
  /// tutors no longer match [expectedTutorIdsByClass], no session is changed.
  /// Only tutor and audit metadata fields are written, so a concurrent booking
  /// or roll change cannot be overwritten by this editor.
  Future<void> updateSessionTutorsChecked({
    required String attendanceDocId,
    required Map<String, List<String>> expectedTutorIdsByClass,
    required List<String> tutorIds,
    required String updatedBy,
  }) async {
    if (expectedTutorIdsByClass.isEmpty) return;

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final refs = {
          for (final classId in expectedTutorIdsByClass.keys)
            classId: _classesRef
                .doc(classId)
                .collection('attendance')
                .doc(attendanceDocId),
        };
        final snapshots = <String, DocumentSnapshot>{};

        // Firestore transactions require all reads before the first write.
        for (final entry in refs.entries) {
          snapshots[entry.key] = await transaction.get(entry.value);
        }

        final conflicts = <String>[];
        for (final entry in snapshots.entries) {
          final data = entry.value.data() as Map<String, dynamic>?;
          final current = List<String>.from(data?['tutors'] ?? const []);
          final expected =
              expectedTutorIdsByClass[entry.key] ?? const <String>[];
          if (!entry.value.exists || !sameTutorAssignment(current, expected)) {
            conflicts.add(entry.key);
          }
        }
        if (conflicts.isNotEmpty) {
          throw TutorAssignmentConflictException(conflicts);
        }

        final update = tutorAssignmentUpdate(
          tutorIds: tutorIds,
          updatedBy: updatedBy,
        );
        for (final ref in refs.values) {
          transaction.update(ref, update);
        }
      });
    } catch (e) {
      debugPrint(
          'Error updating checked session tutors for $attendanceDocId: $e');
      rethrow;
    }
  }

  /// Updates standing tutor assignments as one checked transaction.
  ///
  /// The class-document phase is all-or-nothing. It compares every affected
  /// class's current tutor ids with [expectedTutorIdsByClass], then writes only
  /// `tutors`, `updatedAt`, and `updatedBy`. Capacity and roster fields are
  /// therefore preserved even if another admin changed them after this editor
  /// opened.
  ///
  /// Generated attendance documents dated [fromDate] or later are propagated in
  /// a separate batch after the class transaction. If that phase fails,
  /// [TutorAssignmentPropagationException] is thrown after the committed class
  /// change so callers can report the partial result truthfully.
  Future<void> updateStandingTutorsChecked({
    required Map<String, List<String>> expectedTutorIdsByClass,
    required List<String> tutorIds,
    required DateTime fromDate,
    required String updatedBy,
  }) async {
    if (expectedTutorIdsByClass.isEmpty) return;

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final refs = {
          for (final classId in expectedTutorIdsByClass.keys)
            classId: _classesRef.doc(classId),
        };
        final snapshots = <String, DocumentSnapshot>{};

        for (final entry in refs.entries) {
          snapshots[entry.key] = await transaction.get(entry.value);
        }

        final conflicts = <String>[];
        for (final entry in snapshots.entries) {
          final data = entry.value.data() as Map<String, dynamic>?;
          final current = List<String>.from(data?['tutors'] ?? const []);
          final expected =
              expectedTutorIdsByClass[entry.key] ?? const <String>[];
          if (!entry.value.exists || !sameTutorAssignment(current, expected)) {
            conflicts.add(entry.key);
          }
        }
        if (conflicts.isNotEmpty) {
          throw TutorAssignmentConflictException(conflicts);
        }

        final update = tutorAssignmentUpdate(
          tutorIds: tutorIds,
          updatedBy: updatedBy,
        );
        for (final ref in refs.values) {
          transaction.update(ref, update);
        }
      });
    } on TutorAssignmentConflictException {
      rethrow;
    } catch (e) {
      debugPrint('Error updating checked standing tutors: $e');
      rethrow;
    }

    try {
      final attendanceRefs = <DocumentReference>[];
      for (final classId in expectedTutorIdsByClass.keys) {
        final snapshots =
            await _classesRef.doc(classId).collection('attendance').get();
        for (final doc in snapshots.docs) {
          final data = doc.data() as Map<String, dynamic>?;
          if (attendanceIsOnOrAfter(data?['date'], fromDate)) {
            attendanceRefs.add(doc.reference);
          }
        }
      }

      // A class has one session per term week. This guard fails before any
      // propagation write rather than silently splitting the phase into
      // partially committed batches.
      if (attendanceRefs.length > 500) {
        throw StateError(
            'Tutor propagation needs ${attendanceRefs.length} writes; '
            'Firestore batches allow 500.');
      }

      final batch = FirebaseFirestore.instance.batch();
      final update = tutorAssignmentUpdate(
        tutorIds: tutorIds,
        updatedBy: updatedBy,
      );
      for (final ref in attendanceRefs) {
        batch.update(ref, update);
      }
      if (attendanceRefs.isNotEmpty) {
        await batch.commit();
      }
    } catch (e) {
      debugPrint('Error propagating standing tutors: $e');
      throw TutorAssignmentPropagationException(e);
    }
  }

  /// Replaces one session's booking list only if it still matches what the
  /// roster editor loaded.
  ///
  /// The transaction closes the preflight/write race, and the field-narrow
  /// update preserves a concurrent cancellation, tutor assignment, or roll.
  Future<void> updateSessionBookingsChecked({
    required String classId,
    required String attendanceDocId,
    required List<String> expectedStudentIds,
    required List<String> studentIds,
    required String updatedBy,
  }) async {
    final ref =
        _classesRef.doc(classId).collection('attendance').doc(attendanceDocId);
    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final snapshot = await transaction.get(ref);
        final data = snapshot.data();
        final current = List<String>.from(data?['attendance'] ?? const []);
        if (!snapshot.exists || !sameIdSet(current, expectedStudentIds)) {
          throw SessionBookingsConflictException(classId);
        }
        transaction.update(
          ref,
          sessionBookingsUpdate(
            studentIds: studentIds,
            updatedBy: updatedBy,
          ),
        );
      });
    } catch (e) {
      debugPrint('Error updating checked session bookings for '
          '$classId/$attendanceDocId: $e');
      rethrow;
    }
  }

  /// Writes the roll for one session.
  ///
  /// Failures propagate. This used to swallow them and log, so a roll that
  /// Firestore rejected — offline, denied, or a deleted session — reported
  /// success to the tutor who had just marked it.
  Future<void> updateAttendanceDoc(
      String classId, Attendance attendance) async {
    try {
      await _classesRef
          .doc(classId)
          .collection('attendance')
          .doc(attendance.id)
          .update(attendance.toMap());
    } catch (e) {
      debugPrint(
          'Error updating attendance doc ${attendance.id} for class $classId: $e');
      rethrow;
    }
  }

  Future<void> setSessionCancelled({
    required String classId,
    required String attendanceDocId,
    required bool cancelled,
    required String updatedBy,
  }) async {
    try {
      await _classesRef
          .doc(classId)
          .collection('attendance')
          .doc(attendanceDocId)
          .update({
        'cancelled': cancelled,
        'updatedAt': Timestamp.now(),
        'updatedBy': updatedBy,
      });
    } catch (e) {
      debugPrint(
          'Error setting cancelled=$cancelled for $classId/$attendanceDocId: $e');
      rethrow;
    }
  }

  /// Deletes an empty class through the authoritative admin callable.
  ///
  /// The server refuses classes with enrolments or waitlist entries, deletes
  /// attendance, and writes the audit record. A direct client batch bypasses
  /// those guards and can leave orphaned waitlist entries.
  Future<void> deleteClass(String classId) async {
    try {
      await FirebaseFunctions.instance.httpsCallable('adminDeleteClass').call({
        'classId': classId,
        'confirmClassId': classId,
        'deleteAttendance': true,
      });
    } catch (e) {
      debugPrint('Error deleting class $classId: $e');
      rethrow;
    }
  }

  /// --------------------------------
  ///      ATTENDANCE SUBCOLLECTION
  /// --------------------------------

  /// Pre-generate attendance docs for a given Class in a given Term.
  /// Term ID + week number in the doc ID, e.g., "2025_T1_W3".
  /// Also store them in the doc fields for easy querying.
  Future<void> generateAttendanceDocsForTerm(
    ClassModel classModel,
    Term term,
    DateTime date,
    int startWeek,
  ) async {
    try {
      final attendanceColl =
          _classesRef.doc(classModel.id).collection('attendance');
      final planned = <String, Attendance>{};

      for (int w = startWeek; w <= term.totalWeeks; w++) {
        // Example doc ID: "2025_T1_W3"
        final attendanceDocId = '${term.id}_W$w';

        final weekOffeset = (w - startWeek);
        final weekDate = date.add(Duration(days: 7 * weekOffeset));
        DateTime sessionDateTime;
        try {
          final startTime = classModel.startTime;
          if (startTime.contains(':')) {
            final timeParts = startTime.split(':');
            final hour = int.parse(timeParts[0]);
            final minute = int.parse(timeParts[1]);
            sessionDateTime = DateTime(
              weekDate.year,
              weekDate.month,
              weekDate.day,
              hour,
              minute,
            ).toUtc();
          } else {
            sessionDateTime = weekDate.toUtc();
          }
        } catch (e) {
          sessionDateTime = weekDate.toUtc();
        }

        planned[attendanceDocId] = Attendance(
          id: attendanceDocId,
          termId: term.id,
          weekNumber: w,
          date: sessionDateTime,
          cancelled: false,
          updatedAt: DateTime.now(),
          updatedBy: 'system',
          // Initially, fill attendance with any permanently enrolled students
          attendance: List<String>.from(classModel.enrolledStudents),
          tutors: List<String>.from(classModel.tutors),
        );
      }

      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final refs = {
          for (final id in planned.keys) id: attendanceColl.doc(id),
        };
        final snapshots = <String, DocumentSnapshot>{};

        // Firestore transactions require every read before the first write.
        for (final entry in refs.entries) {
          snapshots[entry.key] = await transaction.get(entry.value);
        }

        final missingIds = missingGeneratedAttendanceIds(
          plannedIds: planned.keys,
          existingIds: snapshots.entries
              .where((entry) => entry.value.exists)
              .map((entry) => entry.key),
        );
        for (final id in missingIds) {
          transaction.set(refs[id]!, planned[id]!.toMap());
        }
      });
    } catch (e) {
      debugPrint(
          'Error generating attendance docs for class ${classModel.id}: $e');
      rethrow;
    }
  }

  /// Fetch attendance doc for a given class + attendanceDocId
  Future<Attendance?> fetchAttendanceDoc({
    required String classId,
    required String attendanceDocId,
  }) async {
    debugPrint(
        '[TimetableService] fetchAttendanceDoc called for classId: $classId, attendanceDocId: $attendanceDocId');
    try {
      final doc = await _classesRef
          .doc(classId)
          .collection('attendance')
          .doc(attendanceDocId)
          .get();
      debugPrint('[TimetableService] fetchAttendanceDoc exists: ${doc.exists}');
      if (!doc.exists) return null;
      return Attendance.fromMap(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      debugPrint('[TimetableService] fetchAttendanceDoc error: $e');
      rethrow;
    }
  }

  /// Every class's session for one week of one term, keyed by class id.
  ///
  /// One collection-group query instead of a document read per class. The
  /// timetable used to fan out across every class on the books each time it
  /// loaded, which was the bulk of the wait when opening the Classes tab.
  ///
  /// The class id is the attendance document's grandparent — attendance lives
  /// at `classes/{classId}/attendance/{docId}` — so it comes from the
  /// reference rather than from the document body, which does not carry it.
  ///
  /// Filters on `termId` and `weekNum` together, so it reads only the week it
  /// needs — one document per class rather than the whole term.
  ///
  /// `weekNum` is only trustworthy as a filter because the split that used to
  /// exist has been repaired: the scheduled `rolloverTermData` Cloud Function
  /// wrote `weekNumber` while the class-creation callable wrote `weekNum`,
  /// leaving 614 documents that a `weekNum` filter would have silently
  /// dropped. The function now writes `weekNum` and the existing documents
  /// were backfilled — see
  /// `backend/firebase/functions/scripts/backfillAttendanceWeekNum.js`.
  ///
  /// Requires the `termId + weekNum` collection-group index and the
  /// `{path=**}/attendance` read rule; a path-scoped rule does not cover a
  /// collection-group query.
  Future<Map<String, Attendance>> fetchAttendanceForWeek({
    required String termId,
    required int weekNumber,
  }) async {
    debugPrint(
        '[TimetableService] fetchAttendanceForWeek termId: $termId, week: $weekNumber');
    try {
      final snapshot = await FirebaseFirestore.instance
          .collectionGroup('attendance')
          .where('termId', isEqualTo: termId)
          .where('weekNum', isEqualTo: weekNumber)
          .get();

      final byClassId = <String, Attendance>{};
      for (final doc in snapshot.docs) {
        final classId = doc.reference.parent.parent?.id;
        if (classId == null) continue;
        byClassId[classId] = Attendance.fromMap(doc.data(), doc.id);
      }

      debugPrint(
          '[TimetableService] fetchAttendanceForWeek returned: ${byClassId.length}');
      return byClassId;
    } catch (e) {
      debugPrint('[TimetableService] fetchAttendanceForWeek error: $e');
      rethrow;
    }
  }

  /// Every session of [termId] in a week before [beforeWeek], grouped by class.
  ///
  /// The admin console uses this to find rolls nobody ever marked. Reading only
  /// the current week meant an unmarked roll stopped being asked about the
  /// moment the week turned over, so the sessions most in need of chasing were
  /// the ones guaranteed to be invisible.
  ///
  /// One collection-group query rather than a read per week, and served by the
  /// same `termId + weekNum` index as [fetchAttendanceForWeek] — an equality on
  /// `termId` with a range on `weekNum` needs no index of its own.
  Future<Map<String, List<Attendance>>> fetchAttendanceBeforeWeek({
    required String termId,
    required int beforeWeek,
  }) async {
    debugPrint('[TimetableService] fetchAttendanceBeforeWeek termId: $termId, '
        'before: $beforeWeek');
    if (beforeWeek <= 1) return const {};

    try {
      final snapshot = await FirebaseFirestore.instance
          .collectionGroup('attendance')
          .where('termId', isEqualTo: termId)
          .where('weekNum', isLessThan: beforeWeek)
          .get();

      final byClassId = <String, List<Attendance>>{};
      for (final doc in snapshot.docs) {
        final classId = doc.reference.parent.parent?.id;
        if (classId == null) continue;
        byClassId
            .putIfAbsent(classId, () => <Attendance>[])
            .add(Attendance.fromMap(doc.data(), doc.id));
      }

      debugPrint('[TimetableService] fetchAttendanceBeforeWeek returned: '
          '${snapshot.docs.length} docs across ${byClassId.length} classes');
      return byClassId;
    } catch (e) {
      debugPrint('[TimetableService] fetchAttendanceBeforeWeek error: $e');
      rethrow;
    }
  }

  /// Fetch all attendance docs for a class
  Future<List<Attendance>> fetchAllAttendanceForClass(String classId) async {
    try {
      final snaps =
          await _classesRef.doc(classId).collection('attendance').get();

      return snaps.docs.map((doc) {
        return Attendance.fromMap(doc.data(), doc.id);
      }).toList();
    } catch (e) {
      debugPrint('Error fetching attendance for class $classId: $e');
      return [];
    }
  }

  /// -------------------------------------------
  ///     ENROLL / CANCEL (One-off or Perm)
  /// -------------------------------------------

  /// Admin/system permanent enrolment path:
  /// 1) Add them to the `enrolledStudents` in ClassModel.
  /// 2) Add them to all *future* attendance docs.
  ///
  /// Parent self-service should use [enrollStudentPermanentForParent] so
  /// pending and full classes can divert to waitlist instead.
  Future<void> enrollStudentPermanent({
    required String classId,
    required String studentId,
  }) async {
    try {
      final callable =
          FirebaseFunctions.instance.httpsCallable('enrollStudentPermanent');
      await callable.call<Map<String, dynamic>>({
        'classId': classId,
        'studentId': studentId,
      });
    } catch (e) {
      debugPrint(
          'Error enrolling student $studentId permanently in $classId: $e');
      rethrow;
    }
  }

  /// Remove a student from permanent enrollment in a class:
  /// 1) Remove from `ClassModel.enrolledStudents`
  /// 2) Remove from all *future* attendance docs
  Future<void> unenrollStudentPermanent({
    required String classId,
    required String studentId,
  }) async {
    try {
      final callable =
          FirebaseFunctions.instance.httpsCallable('unenrollStudentPermanent');
      await callable.call<Map<String, dynamic>>({
        'classId': classId,
        'studentId': studentId,
      });
    } catch (e) {
      debugPrint(
          'Error unenrolling student $studentId permanently from $classId: $e');
      rethrow;
    }
  }

  /// Book a one-off class for a single attendance doc.
  /// This also checks capacity before enrolling.
  Future<OneOffEnrollmentResult> enrollStudentOneOff({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    try {
      final callable =
          FirebaseFunctions.instance.httpsCallable('enrollStudentOneOff');
      final response = await callable.call<Map<String, dynamic>>({
        'classId': classId,
        'studentId': studentId,
        'attendanceDocId': attendanceDocId,
      });
      final data = response.data;
      return OneOffEnrollmentResult(
        added: data['added'] == true,
        alreadyEnrolled: data['alreadyEnrolled'] == true,
      );
    } catch (e) {
      debugPrint(
          'Error enrolling one-off in class $classId / $attendanceDocId: $e');
      rethrow; // rethrow so caller can handle
    }
  }

  DateTime? _dateTimeFromCallableValue(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is String) return DateTime.tryParse(value);
    if (value is Map && (value['_seconds'] is num || value['seconds'] is num)) {
      final seconds = (value['_seconds'] as num?) ?? (value['seconds'] as num);
      return DateTime.fromMillisecondsSinceEpoch(
        seconds.toInt() * 1000,
      );
    }
    return null;
  }

  /// Cancel a student’s attendance for a specific doc.
  Future<void> cancelStudentForWeek({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    try {
      final callable =
          FirebaseFunctions.instance.httpsCallable('cancelStudentForWeek');
      await callable.call<Map<String, dynamic>>({
        'classId': classId,
        'studentId': studentId,
        'attendanceDocId': attendanceDocId,
      });
    } catch (e) {
      debugPrint('Error canceling student for $classId / $attendanceDocId: $e');
      rethrow;
    }
  }

  /// --------------------------------------
  ///   RESCHEDULING TO A DIFFERENT CLASS
  /// --------------------------------------
  ///
  /// The parent can choose a new class/time with a free spot.
  /// 1) Cancel from old class/time.
  /// 2) Enroll in new class/time (one-off).
  Future<void> rescheduleToDifferentClass({
    required String oldClassId,
    required String oldAttendanceDocId,
    required String newClassId,
    required String newAttendanceDocId,
    required String studentId,
  }) async {
    try {
      final callable = FirebaseFunctions.instance
          .httpsCallable('rescheduleStudentToDifferentClass');
      await callable.call<Map<String, dynamic>>({
        'oldClassId': oldClassId,
        'oldAttendanceDocId': oldAttendanceDocId,
        'newClassId': newClassId,
        'newAttendanceDocId': newAttendanceDocId,
        'studentId': studentId,
      });
    } catch (e) {
      debugPrint(
          'Error rescheduling student $studentId from $oldClassId to $newClassId: $e');
      rethrow;
    }
  }

  /// Remove a student from the attendance document for the given week,
  /// but keep them in the student enrolment array in the class document.
  Future<bool> notifyStudentAbsence({
    required String classId,
    required String studentId,
    required String attendanceDocId,
    required String parentId,
  }) async {
    try {
      final callable =
          FirebaseFunctions.instance.httpsCallable('notifyStudentAbsence');
      final response = await callable.call<Map<String, dynamic>>({
        'classId': classId,
        'studentId': studentId,
        'attendanceDocId': attendanceDocId,
        'parentId': parentId,
      });

      final data = response.data;
      return data['tokenAwarded'] == true;
    } catch (e) {
      debugPrint(
          'Error notifying absence for student $studentId in class $classId: $e');
      rethrow;
    }
  }

  /// --------------------------------------
  ///        TOKEN-RELATED LOGIC
  /// --------------------------------------

  Future<void> incrementLessonTokens(String parentId, int count) async {
    final parentRef =
        FirebaseFirestore.instance.collection('users').doc(parentId);

    await FirebaseFirestore.instance.runTransaction((transaction) async {
      final snap = await transaction.get(parentRef);
      if (!snap.exists) {
        throw Exception('Parent $parentId does not exist!');
      }
      transaction.update(parentRef, {
        'lessonTokens': FieldValue.increment(count),
      });
    });
  }

  Future<void> decrementLessonTokens(String parentId, int count) async {
    final parentRef =
        FirebaseFirestore.instance.collection('users').doc(parentId);

    await FirebaseFirestore.instance.runTransaction((transaction) async {
      final snap = await transaction.get(parentRef);
      if (!snap.exists) {
        throw Exception('Parent $parentId does not exist!');
      }
      transaction.update(parentRef, {
        'lessonTokens': FieldValue.increment(count * -1),
      });
    });
  }

  Future<void> setLessonTokens(String parentId, int count) async {
    await FirebaseFirestore.instance
        .collection('users')
        .doc(parentId)
        .update({'lessonTokens': count});
  }

  Future<int> getLessonTokenCount(String parentId) async {
    final parentRef =
        FirebaseFirestore.instance.collection('users').doc(parentId);

    try {
      final snap = await parentRef.get();
      if (!snap.exists) {
        throw Exception('Parent $parentId does not exist!');
      }
      return snap.data()?['lessonTokens'] ?? 0;
    } catch (e) {
      debugPrint('Error fetching lesson tokens for parent $parentId: $e');
      return 0;
    }
  }

  Future<List<ClassModel>> fetchClassesForStudent(String userId) async {
    try {
      // Query classes that contain userId in 'enrolledStudents'
      final snapshot = await _classesRef
          .where('enrolledStudents', arrayContains: userId)
          .get();

      if (snapshot.docs.isEmpty) {
        return [];
      }

      return snapshot.docs.map((doc) {
        return ClassModel.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }).toList();
    } catch (e) {
      debugPrint('Error fetching classes for user $userId: $e');
      return [];
    }
  }

  Future<ClassModel?> fetchUpcomingClassForParent(
      {required List<String> studentIds}) async {
    try {
      // 1. Get the active/upcoming term.
      final term = await fetchActiveOrUpcomingTerm();
      if (term == null) {
        debugPrint("No active/upcoming term found.");
        return null;
      }

      final now = DateTime.now();

      // 2. Query attendance docs across all classes for the active/upcoming term
      //    that are in the future and include any of the parent's student IDs.
      final attendanceQuerySnapshot = await FirebaseFirestore.instance
          .collectionGroup('attendance')
          .where('attendance', arrayContainsAny: studentIds)
          .where('termId', isEqualTo: term.id)
          .where('date', isGreaterThan: Timestamp.fromDate(now))
          .orderBy('date', descending: false)
          .limit(1)
          .get();

      if (attendanceQuerySnapshot.docs.isEmpty) {
        debugPrint(
            "No upcoming attendance docs found for student IDs: $studentIds in term ${term.id}");
        return null;
      }

      // 3. Get the first attendance doc from the query.
      final attendanceDoc = attendanceQuerySnapshot.docs.first;

      // 4. Get the parent class document reference.
      final classRef = attendanceDoc.reference.parent.parent;
      if (classRef == null) {
        debugPrint(
            "Could not determine the class document from attendance doc.");
        return null;
      }
      final classId = classRef.id;

      // 5. Fetch the class by its ID.
      final classModel = await fetchClassById(classId);
      return classModel;
    } catch (e) {
      debugPrint("Error fetching upcoming class for parent: $e");
      return null;
    }
  }

  String _waitlistEntryId(String classId, String studentId) {
    return '${classId}_$studentId';
  }

  ClassEnrollmentState _classEnrollmentStateFromString(String? value) {
    switch (value) {
      case 'pending':
        return ClassEnrollmentState.pending;
      case 'open':
        return ClassEnrollmentState.open;
      case 'full':
        return ClassEnrollmentState.full;
      default:
        throw Exception('Unknown class enrollment state: $value');
    }
  }

  WaitlistPromotionOutcome _waitlistPromotionOutcomeFromString(String? value) {
    switch (value) {
      case 'promoted':
        return WaitlistPromotionOutcome.promoted;
      case 'already_enrolled':
        return WaitlistPromotionOutcome.alreadyEnrolled;
      case 'class_full':
        return WaitlistPromotionOutcome.classFull;
      case 'not_promotable':
        return WaitlistPromotionOutcome.notPromotable;
      default:
        throw Exception('Unknown waitlist promotion outcome: $value');
    }
  }
}
