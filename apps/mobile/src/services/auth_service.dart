import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/app_user_model.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  
  Future<AppUser?> signInWithEmailAndPassword (String email, String password) async {
    try {
      UserCredential cred = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password
      );
      //if successful, get uID
      String uid = cred.user!.uid;

      //fetch user data
      DocumentSnapshot doc = await _db.collection('users').doc(uid).get();
      if (!doc.exists) {
        return AppUser(
          uid: uid,
          email: cred.user!.email ?? '',
          role: '',
          firstName: '',
          lastName: '',
          fcmTokens: []
        );
      }
      // Convert Firestore data to AppUser
      AppUser user = AppUser.fromMap(doc.data() as Map<String, dynamic>, doc.id);
      return user;
    } on FirebaseAuthException catch (e) {
      //TODO: HANDLE ERROR CODES
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _auth.signOut();
  }

  Future<AppUser?> getCurrentUser() async {
    //if user logged in, retrieve from firestore
    User? currentUser = _auth.currentUser;
    if (currentUser == null) return null;

    DocumentSnapshot doc = await _db.collection('users').doc(currentUser.uid).get();
    if (!doc.exists) return null;
    return AppUser.fromMap(doc.data() as Map<String, dynamic>, doc.id);
  }

  //TODO: Add more methods (sign up, reset password etc.)

}