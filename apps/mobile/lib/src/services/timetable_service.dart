import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import 'package:tenacity/src/models/attendance_model.dart';
import 'package:tenacity/src/models/class_model.dart';
import 'package:tenacity/src/models/term_model.dart';

class TimetableService {
  // References to top-level collections in Firestore
  final CollectionReference _termRef =
      FirebaseFirestore.instance.collection('terms');

  final CollectionReference _classesRef =
      FirebaseFirestore.instance.collection('classes');

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

  /// Fetch all Terms
  Future<List<Term>> fetchAllTerms() async {
    try {
      final snapshots = await _termRef.get();
      return snapshots.docs.map((doc) {
        return Term.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }).toList();
    } catch (e) {
      debugPrint('Error fetching terms: $e');
      return [];
    }
  }

  Future<Term?> fetchActiveOrUpcomingTerm() async {
    try {
      // 1) Attempt to fetch the active term
      final activeTermQuery =
          await _termRef.where('status', isEqualTo: 'active').limit(1).get();

      if (activeTermQuery.docs.isNotEmpty) {
        // Return the active term
        final doc = activeTermQuery.docs.first;
        print(doc);
        return Term.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }

      // 2) If no active term, fetch upcoming term
      final now = DateTime.now();
      final upcomingQuery = await _termRef
          .where('startDate', isGreaterThan: Timestamp.fromDate(now))
          .orderBy('startDate', descending: false)
          .limit(1)
          .get();

      if (upcomingQuery.docs.isNotEmpty) {
        // Return the nearest future term
        final doc = upcomingQuery.docs.first;
        return Term.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }

      // 3) No upcoming term found
      return null;
    } catch (e) {
      debugPrint('Error fetching active/upcoming term: $e');
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
    try {
      final snapshots = await _classesRef.get();
      return snapshots.docs.map((doc) {
        return ClassModel.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      }).toList();
    } catch (e) {
      debugPrint('Error fetching classes: $e');
      return [];
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
      print(classModel);
    } catch (e) {
      debugPrint('Error creating class ${classModel.id}: $e');
    }
  }

  /// Update an existing class doc
  Future<void> updateClass(ClassModel classModel) async {
    try {
      await _classesRef.doc(classModel.id).update(classModel.toMap());
    } catch (e) {
      debugPrint('Error updating class ${classModel.id}: $e');
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
  ) async {
    try {
      final attendanceColl =
          _classesRef.doc(classModel.id).collection('attendance');

      for (int w = 1; w <= term.totalWeeks; w++) {
        // Example doc ID: "2025_T1_W3"
        final attendanceDocId = '${term.id}_W$w';

        final newAttendance = Attendance(
          id: attendanceDocId,
          termId: term.id,
          weekNumber: w,
          date: date,
          updatedAt: DateTime.now(),
          updatedBy: 'system',
          // Initially, fill attendance with any permanently enrolled students
          attendance: List<String>.from(classModel.enrolledStudents),
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
    try {
      final doc = await _classesRef
          .doc(classId)
          .collection('attendance')
          .doc(attendanceDocId)
          .get();

      if (!doc.exists) return null;

      return Attendance.fromMap(doc.data() as Map<String, dynamic>, doc.id);
    } catch (e) {
      debugPrint(
          'Error fetching attendance doc $attendanceDocId for class $classId: $e');
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

  /// Permanently enroll a student in a class:
  /// 1) Add them to the `enrolledStudents` in ClassModel.
  /// 2) Add them to all *future* attendance docs.
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

        // If attendanceDay is the same or after today's date, include this student.
        if (!attendanceDay.isBefore(nowDay)) {
          await snap.reference.update({
            'attendance': FieldValue.arrayUnion([studentId]),
            'updatedAt': Timestamp.now(),
            'updatedBy': 'system',
          });
        }
      }
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
  Future<void> notifyStudentAbsence({
    required String classId,
    required String studentId,
    required String attendanceDocId,
  }) async {
    try {
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
      debugPrint(
          'Error notifying absence for student $studentId in class $classId: $e');
      rethrow;
    }
  }

  /// --------------------------------------
  ///        TOKEN-RELATED LOGIC
  /// --------------------------------------
  Future<void> incrementLessonTokens(String studentId, int count) async {
    final studentRef =
        FirebaseFirestore.instance.collection('students').doc(studentId);

    await FirebaseFirestore.instance.runTransaction((transaction) async {
      final snap = await transaction.get(studentRef);
      if (!snap.exists) {
        throw Exception('Student $studentId does not exist!');
      }
      transaction.update(studentRef, {
        'lessonTokens': FieldValue.increment(count),
      });
    });
  }

  Future<void> decrementLessonTokens(String studentId, int count) async {
    final studentRef =
        FirebaseFirestore.instance.collection('students').doc(studentId);

    await FirebaseFirestore.instance.runTransaction((transaction) async {
      final snap = await transaction.get(studentRef);
      if (!snap.exists) {
        throw Exception('Student $studentId does not exist!');
      }
      transaction.update(studentRef, {
        'lessonTokens': FieldValue.increment(count * -1),
      });
    });
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
}
