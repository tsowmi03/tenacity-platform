import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:tenacity/src/models/student_model.dart';
import '../models/app_user_model.dart';
import 'package:cloud_functions/cloud_functions.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  Future<AppUser?> signInWithEmailAndPassword(
      String email, String password) async {
    try {
      UserCredential cred = await _auth.signInWithEmailAndPassword(
          email: email, password: password);
      print(cred.user!.uid);
      return await fetchUserData(cred.user!.uid);
    } on FirebaseAuthException {
      print('error in service');
      rethrow;
    }
  }

  Future<void> signOut() async {
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
      print('Error calling Cloud Function: $error');
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
}
