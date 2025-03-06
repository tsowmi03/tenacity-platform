import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:tenacity/src/models/student_model.dart';
import '../models/app_user_model.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  
  Future<AppUser?> signInWithEmailAndPassword(String email, String password) async {
    try {
      UserCredential cred = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password
      );
      return await fetchUserData(cred.user!.uid);
    } on FirebaseAuthException {
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
      // final actionCodeSettings = ActionCodeSettings(
      //   url: 'https://admin.tenacitytutoring.com/reset_password.html',
      //   handleCodeInApp: false,
      //   iOSBundleId: 'com.example.tenacity',              
      //   androidPackageName: 'com.example.tenacity',
      //   androidInstallApp: true,
      //   androidMinimumVersion: '12',
      // );
      await _auth.sendPasswordResetEmail(
        email: email,
        // actionCodeSettings: actionCodeSettings,
      );
      print('Sent from service');
    } on FirebaseAuthException catch (e) {
      print('FirebaseAuthException caught:');
      print(' - code: ${e.code}');
      print(' - message: ${e.message}');
      print(' - stackTrace: ${e.stackTrace}');
      throw Exception(e.message);
    }
  }

}