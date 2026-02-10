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

  T _parseWithLogging<T>({
    required String label,
    required String docId,
    required Map<String, dynamic> data,
    required T Function(Map<String, dynamic> data, String docId) parser,
  }) {
    try {
      return parser(data, docId);
    } catch (e, st) {
      final role = data['role'];
      final nullKeys = data.entries
          .where((entry) => entry.value == null)
          .map((entry) => entry.key)
          .toList();
      debugPrint(
          '[authService][$label] Failed to parse docId=$docId role=$role error=$e');
      debugPrint('[authService][$label] keys=${data.keys.toList()}');
      if (nullKeys.isNotEmpty) {
        debugPrint('[authService][$label] nullKeys=$nullKeys');
      }
      debugPrint('[authService][$label] stackTrace=\n$st');
      rethrow;
    }
  }

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

  Future<void> updateUserProfile({
    required String uid,
    required String firstName,
    required String lastName,
    required String phone,
    required String email,
    required String currentEmail,
  }) async {
    final userRef = _db.collection('users').doc(uid);

    // Update Firestore
    await userRef.update({
      'firstName': firstName,
      'lastName': lastName,
      'phone': phone,
      'email': email,
    });

    // Update Firebase Auth email if changed
    if (email != currentEmail) {
      final user = _auth.currentUser;
      if (user != null) {
        await user.verifyBeforeUpdateEmail(email);
      }
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
    debugPrint('[authService][fetchAllParents] Fetching parents...');
    final snapshot =
        await _db.collection('users').where('role', isEqualTo: 'parent').get();
    debugPrint(
        '[authService][fetchAllParents] Found ${snapshot.docs.length} parent docs');

    return snapshot.docs.map((doc) {
      return _parseWithLogging<AppUser>(
        label: 'fetchAllParents',
        docId: doc.id,
        data: doc.data(),
        parser: (data, id) => AppUser.fromFirestore(data, id),
      );
    }).toList();
  }

  Future<List<Student>> fetchAllStudents() async {
    debugPrint('[authService][fetchAllStudents] Fetching students...');
    final snapshot = await _db.collection('students').get();
    debugPrint(
        '[authService][fetchAllStudents] Found ${snapshot.docs.length} student docs');
    return snapshot.docs.map((doc) {
      return _parseWithLogging<Student>(
        label: 'fetchAllStudents',
        docId: doc.id,
        data: doc.data(),
        parser: (data, id) => Student.fromMap(data, id),
      );
    }).toList();
  }

  Future<List<Tutor>> fetchAllTutors() async {
    debugPrint('[authService][fetchAllTutors] Fetching tutors/admins...');
    final snapshot = await _db
        .collection('users')
        .where('role', whereIn: ['tutor', 'admin']).get();
    debugPrint(
        '[authService][fetchAllTutors] Found ${snapshot.docs.length} tutor/admin docs');
    return snapshot.docs.map((doc) {
      return _parseWithLogging<Tutor>(
        label: 'fetchAllTutors',
        docId: doc.id,
        data: doc.data(),
        parser: (data, id) => Tutor.fromFirestore(data, id),
      );
    }).toList();
  }

  Future<List<Student>> fetchStudentsForParent(String parentId) async {
    debugPrint(
        '[authService][fetchStudentsForParent] Fetching students for parentId=$parentId');
    // 1) Fetch parent’s user doc
    final parentDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(parentId)
        .get();

    if (!parentDoc.exists) return [];

    final data = parentDoc.data() as Map<String, dynamic>;
    final List<dynamic> studentIds = data['students'] ?? [];

    debugPrint(
        '[authService][fetchStudentsForParent] parentId=$parentId studentIds=$studentIds');

    if (studentIds.isEmpty) return [];

    // 2) For each studentId, fetch student doc
    final List<Student> studentsList = [];
    for (var studentId in studentIds) {
      final stuDoc = await FirebaseFirestore.instance
          .collection('students')
          .doc(studentId)
          .get();

      if (stuDoc.exists) {
        final studentData = stuDoc.data() as Map<String, dynamic>;
        studentsList.add(
          _parseWithLogging<Student>(
            label: 'fetchStudentsForParent',
            docId: stuDoc.id,
            data: studentData,
            parser: (data, id) => Student.fromMap(data, id),
          ),
        );
      } else {
        debugPrint(
            '[authService][fetchStudentsForParent] Missing student docId=$studentId (referenced by parentId=$parentId)');
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

    debugPrint(
        '[authService][fullyRemoveParentAndStudents] Starting removal of parent: $parentId');

    // 1. Get all student IDs for this parent
    final parentDoc = await db.collection('users').doc(parentId).get();
    final data = parentDoc.data();
    final List<dynamic> studentIds = data?['students'] ?? [];
    debugPrint(
        '[authService][fullyRemoveParentAndStudents] Found ${studentIds.length} students for parent $parentId: $studentIds');

    // 2. Unenrol all students
    for (final studentId in studentIds) {
      debugPrint(
          '[authService][fullyRemoveParentAndStudents] Unenrolling student $studentId for parent $parentId');
      await fullyUnenrolStudent(parentId: parentId, studentId: studentId);
      debugPrint(
          '[authService][fullyRemoveParentAndStudents] Finished unenrolling student $studentId');
    }

    // 3. Delete parent doc
    debugPrint(
        '[authService][fullyRemoveParentAndStudents] Deleting parent document for $parentId');
    await db.collection('users').doc(parentId).delete();

    // 4. Call Cloud Function to delete from Firebase Auth
    debugPrint(
        '[authService][fullyRemoveParentAndStudents] Calling Cloud Function to delete parent $parentId from Firebase Auth');
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('deleteUserByUidV2');
    await callable.call({'uid': parentId});

    debugPrint(
        '[authService][fullyRemoveParentAndStudents] Finished removal of parent: $parentId');
  }

  Future<void> fullyRemoveTutorOrAdmin({required String tutorId}) async {
    final db = FirebaseFirestore.instance;

    debugPrint(
        '[authService][fullyRemoveTutorOrAdmin] Starting removal of tutor/admin: $tutorId');

    // 1. Remove from all classes' tutors arrays
    final classesSnapshot = await db
        .collection('classes')
        .where('tutors', arrayContains: tutorId)
        .get();

    debugPrint(
        '[authService][fullyRemoveTutorOrAdmin] Found ${classesSnapshot.docs.length} classes containing tutor/admin $tutorId');

    for (final classDoc in classesSnapshot.docs) {
      debugPrint(
          '[authService][fullyRemoveTutorOrAdmin] Removing tutor/admin $tutorId from class ${classDoc.id}');
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
          '[authService][fullyRemoveTutorOrAdmin] Found ${attendanceSnapshot.docs.length} future attendance docs in class ${classDoc.id}');
      for (final attDoc in attendanceSnapshot.docs) {
        debugPrint(
            '[authService][fullyRemoveTutorOrAdmin] Removing tutor/admin $tutorId from attendance doc ${attDoc.id} in class ${classDoc.id}');
        await attDoc.reference.update({
          'tutors': FieldValue.arrayRemove([tutorId])
        });
      }
    }

    // 3. Delete tutor/admin from users collection
    debugPrint(
        '[authService][fullyRemoveTutorOrAdmin] Deleting tutor/admin $tutorId from users collection');
    await db.collection('users').doc(tutorId).delete();

    // 4. Call Cloud Function to delete from Firebase Auth
    debugPrint(
        '[authService][fullyRemoveTutorOrAdmin] Calling Cloud Function to delete tutor/admin $tutorId from Firebase Auth');
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('deleteUserByUidV2');
    await callable.call({'uid': tutorId});

    debugPrint(
        '[authService][fullyRemoveTutorOrAdmin] Finished removal of tutor/admin: $tutorId');
  }

  Future<void> deleteCurrentAccount({required AppUser user}) async {
    debugPrint(
        '[authService][deleteCurrentAccount] Starting account deletion for user: ${user.uid}, role: ${user.role}');
    await notificationService.removeTokenFromFirestore(user.uid);

    if (user.role == 'parent') {
      debugPrint(
          '[authService][deleteCurrentAccount] User is parent, calling fullyRemoveParentAndStudents');
      await fullyRemoveParentAndStudents(parentId: user.uid);
    } else if (user.role == 'tutor' || user.role == 'admin') {
      debugPrint(
          '[authService][deleteCurrentAccount] User is tutor/admin, calling fullyRemoveTutorOrAdmin');
      await fullyRemoveTutorOrAdmin(tutorId: user.uid);
    } else {
      debugPrint(
          '[authService][deleteCurrentAccount] User role is not handled: ${user.role}');
    }
    debugPrint(
        '[authService][deleteCurrentAccount] Finished account deletion for user: ${user.uid}');
  }
}
