import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/permanent_enrollment_result_model.dart';
import 'package:tenacity/src/models/term_model.dart';
import 'package:tenacity/src/models/waitlist_entry_model.dart';
import 'package:tenacity/src/models/waitlist_promotion_result_model.dart';

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
      return [];
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

      if (outcome == PermanentEnrollmentOutcome.enrolled.value) {
        return PermanentEnrollmentResult.enrolled(classState: classState);
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
    final entryRef = _waitlistEntriesRef.doc(entryId);

    try {
      await FirebaseFirestore.instance.runTransaction((transaction) async {
        final snap = await transaction.get(entryRef);
        if (!snap.exists) {
          throw Exception('Waitlist entry $entryId not found');
        }

        final currentEntry = WaitlistEntry.fromMap(
          snap.data() as Map<String, dynamic>,
          snap.id,
        );
        final now = DateTime.now();
        final updates = <String, dynamic>{
          'status': status.value,
          'updatedAt': Timestamp.fromDate(now),
        };

        if (status == WaitlistStatus.offered &&
            currentEntry.status != WaitlistStatus.offered) {
          updates['offeredAt'] = Timestamp.fromDate(now);
        }
        if (offerExpiresAt != null) {
          updates['offerExpiresAt'] = Timestamp.fromDate(offerExpiresAt);
        }
        if (status == WaitlistStatus.promoted) {
          updates['promotedAt'] = Timestamp.fromDate(now);
        }

        final waitlistCountDelta = _countDelta(
          wasCounting: _countsTowardWaitlist(currentEntry.status),
          isCounting: _countsTowardWaitlist(status),
        );
        final openOfferCountDelta = _countDelta(
          wasCounting: _countsTowardOpenOffers(currentEntry.status),
          isCounting: _countsTowardOpenOffers(status),
        );
        final classUpdates = <String, dynamic>{};
        if (waitlistCountDelta != 0) {
          classUpdates['waitlistCount'] =
              FieldValue.increment(waitlistCountDelta);
        }
        if (openOfferCountDelta != 0) {
          classUpdates['openOfferCount'] =
              FieldValue.increment(openOfferCountDelta);
        }

        transaction.update(entryRef, updates);
        if (classUpdates.isNotEmpty) {
          transaction.update(
            _classesRef.doc(currentEntry.classId),
            classUpdates,
          );
        }
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
      return null;
    }
  }

  /// Create a new class doc
  Future<void> createClass(ClassModel classModel) async {
    try {
      await _classesRef.doc(classModel.id).set(classModel.toMap());
    } catch (e) {
      debugPrint('Error creating class ${classModel.id}: $e');
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

  /// Update an existing class doc
  Future<void> updateClass(ClassModel classModel,
      {required int fromWeek, String updatedBy = 'system'}) async {
    try {
      await _classesRef.doc(classModel.id).update(classModel.toMap());

      final attendanceSnapshots =
          await _classesRef.doc(classModel.id).collection('attendance').get();

      for (var doc in attendanceSnapshots.docs) {
        // Attendance doc IDs are like "2025_T1_W3"
        final docId = doc.id;
        final weekMatch = RegExp(r'_W(\d+)$').firstMatch(docId);
        if (weekMatch != null) {
          final weekNum = int.tryParse(weekMatch.group(1) ?? '');
          if (weekNum != null && weekNum >= fromWeek) {
            await doc.reference.update({
              'tutors': classModel.tutors,
              'updatedAt': Timestamp.now(),
              'updatedBy': updatedBy
            });
          }
        }
      }
    } catch (e) {
      debugPrint('Error updating class ${classModel.id}: $e');
    }
  }

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

  /// Delete a class doc (and its attendance sub-collection)
  Future<void> deleteClass(String classId) async {
    try {
      // 1) Delete the class doc
      await _classesRef.doc(classId).delete();

      // 2) Also delete all attendance sub-collection docs
      final attendanceCollection =
          _classesRef.doc(classId).collection('attendance');
      final attendanceDocs = await attendanceCollection.get();

      for (var doc in attendanceDocs.docs) {
        await doc.reference.delete();
      }
    } catch (e) {
      debugPrint('Error deleting class $classId: $e');
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

        final newAttendance = Attendance(
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

        await attendanceColl.doc(attendanceDocId).set(newAttendance.toMap());
      }
    } catch (e) {
      debugPrint(
          'Error generating attendance docs for class ${classModel.id}: $e');
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
      return null;
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
      // 1) Update the Class doc
      await _classesRef.doc(classId).update({
        'enrolledStudents': FieldValue.arrayUnion([studentId]),
      });

      // 2) Add to future attendance docs
      await _addStudentToFutureAttendanceDocs(
        classId: classId,
        studentId: studentId,
      );
    } catch (e) {
      debugPrint(
          'Error enrolling student $studentId permanently in $classId: $e');
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
      // 1) Remove from main class doc
      await _classesRef.doc(classId).update({
        'enrolledStudents': FieldValue.arrayRemove([studentId]),
      });

      // 2) Remove from future attendance docs
      final now = DateTime.now();
      final attendanceSnapshots =
          await _classesRef.doc(classId).collection('attendance').get();

      for (var snap in attendanceSnapshots.docs) {
        final data = snap.data();
        final attendanceObj = Attendance.fromMap(data, snap.id);

        // Convert both to date-only (midnight)
        final attendanceDay = DateTime(
          attendanceObj.date.year,
          attendanceObj.date.month,
          attendanceObj.date.day,
        );
        final nowDay = DateTime(now.year, now.month, now.day);

        if (!attendanceDay.isBefore(nowDay)) {
          await snap.reference.update({
            'attendance': FieldValue.arrayRemove([studentId]),
            'updatedAt': Timestamp.now(),
            'updatedBy': 'system',
          });
        }
      }
    } catch (e) {
      debugPrint(
          'Error unenrolling student $studentId permanently from $classId: $e');
    }
  }

  /// Book a one-off class for a single attendance doc.
  /// This also checks capacity before enrolling.
  Future<void> enrollStudentOneOff({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    try {
      // 1) Check capacity
      final classModel = await fetchClassById(classId);
      if (classModel == null) {
        throw Exception('Class $classId not found');
      }

      // 2) Fetch the attendance doc
      final attendanceObj = await fetchAttendanceDoc(
        classId: classId,
        attendanceDocId: attendanceDocId,
      );
      if (attendanceObj == null) {
        throw Exception('Attendance doc $attendanceDocId not found');
      }

      // 3) Check if there's space
      final currentCount = attendanceObj.attendance.length;
      if (currentCount >= classModel.capacity) {
        throw Exception('Class $classId is full for this date/week');
      }

      // 4) Enroll
      final attendanceRef = _classesRef
          .doc(classId)
          .collection('attendance')
          .doc(attendanceDocId);

      await attendanceRef.update({
        'attendance': FieldValue.arrayUnion([studentId]),
        'updatedAt': Timestamp.now(),
        'updatedBy': 'system',
      });
    } catch (e) {
      debugPrint(
          'Error enrolling one-off in class $classId / $attendanceDocId: $e');
      rethrow; // rethrow so caller can handle
    }
  }

  /// Cancel a student’s attendance for a specific doc.
  Future<void> cancelStudentForWeek({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    try {
      // Fetch the attendance doc to check date/time
      final attendanceObj = await fetchAttendanceDoc(
        classId: classId,
        attendanceDocId: attendanceDocId,
      );
      if (attendanceObj == null) {
        throw Exception(
            'Attendance doc $attendanceDocId not found for $classId');
      }

      // Remove the student
      final attendanceRef = _classesRef
          .doc(classId)
          .collection('attendance')
          .doc(attendanceDocId);

      await attendanceRef.update({
        'attendance': FieldValue.arrayRemove([studentId]),
        'updatedAt': Timestamp.now(),
        'updatedBy': 'system',
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
      // Cancel from old class/time
      await cancelStudentForWeek(
        classId: oldClassId,
        studentId: studentId,
        attendanceDocId: oldAttendanceDocId,
      );

      // Enroll in new class/time
      // This method also does a capacity check
      await enrollStudentOneOff(
        classId: newClassId,
        studentId: studentId,
        attendanceDocId: newAttendanceDocId,
      );
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

  Future<void> _addStudentToFutureAttendanceDocs({
    required String classId,
    required String studentId,
  }) async {
    final now = DateTime.now();
    final nowDay = DateTime(now.year, now.month, now.day);
    final attendanceSnapshots =
        await _classesRef.doc(classId).collection('attendance').get();

    for (final snap in attendanceSnapshots.docs) {
      final attendanceObj = Attendance.fromMap(snap.data(), snap.id);
      final attendanceDay = DateTime(
        attendanceObj.date.year,
        attendanceObj.date.month,
        attendanceObj.date.day,
      );

      if (!attendanceDay.isBefore(nowDay)) {
        await snap.reference.update({
          'attendance': FieldValue.arrayUnion([studentId]),
          'updatedAt': Timestamp.now(),
          'updatedBy': 'system',
        });
      }
    }
  }

  bool _countsTowardWaitlist(WaitlistStatus status) {
    return status == WaitlistStatus.active ||
        status == WaitlistStatus.offered ||
        status == WaitlistStatus.accepted;
  }

  bool _countsTowardOpenOffers(WaitlistStatus status) {
    return status == WaitlistStatus.offered ||
        status == WaitlistStatus.accepted;
  }

  int _countDelta({required bool wasCounting, required bool isCounting}) {
    if (wasCounting == isCounting) return 0;
    return isCounting ? 1 : -1;
  }
}
