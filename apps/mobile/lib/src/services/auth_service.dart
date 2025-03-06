import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:tenacity/src/models/student_model.dart';
import '../models/app_user_model.dart';
import 'package:cloud_functions/cloud_functions.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  
  Future<AppUser?> signInWithEmailAndPassword(String email, String password) async {
    try {
      UserCredential cred = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password
      );
      print("successful login service");
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

      final result = await callable.call({
        'email': email,
      });

      if (result.data != null && result.data['success'] == true) {
        print('Password reset email sent successfully');
      } else {
        print('Unexpected result from Cloud Function');
      }
    } catch (error) {
      print('Error calling Cloud Function: $error');
    }
  }

}