import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:tenacity/src/models/student_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';
import 'package:tenacity/src/services/notification_service.dart';
import 'package:tenacity/src/services/timetable_service.dart';
import '../models/app_user_model.dart';
import 'package:cloud_functions/cloud_functions.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final notificationService = NotificationService();

  Future<AppUser?> signInWithEmailAndPassword(
      String email, String password) async {
    try {
      UserCredential cred = await _auth.signInWithEmailAndPassword(
          email: email, password: password);
      await notificationService.saveTokenToFirestore(cred.user!.uid);
      return await fetchUserData(cred.user!.uid);
    } on FirebaseAuthException {
      rethrow;
    }
  }

  Future<void> signOut() async {
    await notificationService.removeTokenFromFirestore(_auth.currentUser!.uid);
    await _auth.signOut();
  }

  Future<AppUser?> getCurrentUser() async {
    User? firebaseUser = _auth.currentUser;
    if (firebaseUser == null) return null;
    return await fetchUserData(firebaseUser.uid);
  }

  Future<AppUser?> fetchUserData(String uid) async {
    DocumentSnapshot doc = await _db.collection('users').doc(uid).get();
    if (!doc.exists) return null;

    return AppUser.fromFirestore(doc.data() as Map<String, dynamic>, uid);
  }

  Future<Student?> fetchStudentData(String uid) async {
    DocumentSnapshot doc = await _db.collection('students').doc(uid).get();
    if (!doc.exists) return null;

    return Student.fromMap(doc.data() as Map<String, dynamic>, uid);
  }

  Future<void> sendPasswordResetEmail(String email) async {
    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('sendCustomPasswordResetEmail');

      await callable.call({
        'email': email,
      });
    } catch (error) {
      debugPrint('Error sending password reset email: $error');
      rethrow;
    }
  }

  Future<List<AppUser>> fetchAllParents() async {
    final snapshot =
        await _db.collection('users').where('role', isEqualTo: 'parent').get();
    return snapshot.docs.map((doc) {
      return AppUser.fromFirestore(doc.data(), doc.id);
    }).toList();
  }

  Future<List<Student>> fetchAllStudents() async {
    final snapshot = await _db.collection('students').get();
    return snapshot.docs.map((doc) {
      return Student.fromMap(doc.data(), doc.id);
    }).toList();
  }

  Future<List<Tutor>> fetchAllTutors() async {
    final snapshot = await _db
        .collection('users')
        .where('role', whereIn: ['tutor', 'admin']).get();
    return snapshot.docs.map((doc) {
      return Tutor.fromFirestore(doc.data(), doc.id);
    }).toList();
  }

  Future<List<Student>> fetchStudentsForParent(String parentId) async {
    // 1) Fetch parent’s user doc
    final parentDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(parentId)
        .get();

    if (!parentDoc.exists) return [];

    final data = parentDoc.data() as Map<String, dynamic>;
    final List<dynamic> studentIds = data['students'] ?? [];

    if (studentIds.isEmpty) return [];

    // 2) For each studentId, fetch student doc
    final List<Student> studentsList = [];
    for (var studentId in studentIds) {
      final stuDoc = await FirebaseFirestore.instance
          .collection('students')
          .doc(studentId)
          .get();

      if (stuDoc.exists) {
        studentsList.add(
          Student.fromMap(stuDoc.data() as Map<String, dynamic>, stuDoc.id),
        );
      }
    }
    return studentsList;
  }

  Future<void> updateFcmToken(String uid, String token) async {
    try {
      await _db.collection('users').doc(uid).update({
        'fcm_token': token,
      });
    } catch (e) {
      debugPrint("Error updating FCM token: $e");
      rethrow;
    }
  }

  Future<void> fullyUnenrolStudent({
    required String parentId,
    required String studentId,
  }) async {
    final db = FirebaseFirestore.instance;
    final timetableService = TimetableService();

    // Remove from parent's students array
    await db.collection('users').doc(parentId).update({
      'students': FieldValue.arrayRemove([studentId])
    });

    // Remove from all classes and attendance
    final classes = await timetableService.fetchClassesForStudent(studentId);
    for (final classModel in classes) {
      await timetableService.unenrollStudentPermanent(
        classId: classModel.id,
        studentId: studentId,
      );

      // Remove from FUTURE attendance docs only
      final now = DateTime.now();
      final attendanceSnapshot = await db
          .collection('classes')
          .doc(classModel.id)
          .collection('attendance')
          .where('date', isGreaterThan: Timestamp.fromDate(now))
          .get();

      for (final attDoc in attendanceSnapshot.docs) {
        await attDoc.reference.update({
          'attendance': FieldValue.arrayRemove([studentId])
        });
      }
    }

    // Delete student doc
    await db.collection('students').doc(studentId).delete();
  }

  Future<void> fullyRemoveParentAndStudents({
    required String parentId,
  }) async {
    final db = FirebaseFirestore.instance;

    // 1. Get all student IDs for this parent
    final parentDoc = await db.collection('users').doc(parentId).get();
    final data = parentDoc.data();
    final List<dynamic> studentIds = data?['students'] ?? [];

    // 2. Unenrol all students
    for (final studentId in studentIds) {
      await fullyUnenrolStudent(parentId: parentId, studentId: studentId);
    }

    // 3. Delete parent doc
    await db.collection('users').doc(parentId).delete();

    // 4. Call Cloud Function to delete from Firebase Auth
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('deleteUserByUidV2');
    await callable.call({'uid': parentId});
  }

  Future<void> fullyRemoveTutor({required String tutorId}) async {
    final db = FirebaseFirestore.instance;

    debugPrint('Starting removal of tutor: $tutorId');

    // 1. Remove from all classes' tutors arrays
    final classesSnapshot = await db
        .collection('classes')
        .where('tutors', arrayContains: tutorId)
        .get();

    debugPrint(
        'Found ${classesSnapshot.docs.length} classes containing tutor $tutorId');

    for (final classDoc in classesSnapshot.docs) {
      debugPrint('Removing tutor $tutorId from class ${classDoc.id}');
      await classDoc.reference.update({
        'tutors': FieldValue.arrayRemove([tutorId])
      });

      // 2. Remove from FUTURE attendance docs' tutors arrays in this class
      final now = DateTime.now();
      final attendanceSnapshot = await classDoc.reference
          .collection('attendance')
          .where('date', isGreaterThan: Timestamp.fromDate(now))
          .get();
      debugPrint(
          'Found ${attendanceSnapshot.docs.length} future attendance docs in class ${classDoc.id}');
      for (final attDoc in attendanceSnapshot.docs) {
        debugPrint(
            'Removing tutor $tutorId from attendance doc ${attDoc.id} in class ${classDoc.id}');
        await attDoc.reference.update({
          'tutors': FieldValue.arrayRemove([tutorId])
        });
      }
    }

    // 3. Delete tutor from users collection
    debugPrint('Deleting tutor $tutorId from users collection');
    await db.collection('users').doc(tutorId).delete();

    // 4. Call Cloud Function to delete from Firebase Auth
    debugPrint(
        'Calling Cloud Function to delete tutor $tutorId from Firebase Auth');
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('deleteUserByUidV2');
    await callable.call({'uid': tutorId});

    debugPrint('Finished removal of tutor: $tutorId');
  }
}
