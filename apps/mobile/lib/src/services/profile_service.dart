import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/app_user_model.dart';
import '../models/student_model.dart';

class ProfileService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  Future<AppUser?> fetchCurrentUser() async {
    final user = _auth.currentUser;
    if (user == null) return null;

    final doc = await _db.collection('users').doc(user.uid).get();
    if (!doc.exists) return null;

    return AppUser.fromFirestore(doc.data() as Map<String, dynamic>, doc.id);
  }

  Future<List<Student>> fetchStudentsForUser(String userUid) async {
    final userDoc = await _db.collection('users').doc(userUid).get();
    if (!userDoc.exists) return [];

    final data = userDoc.data() as Map<String, dynamic>;

    if (data['role'] != 'parent' || data['students'] == null) return [];

    final studentIds = List<String>.from(data['students']);

    if (studentIds.isEmpty) return [];

    final snapshot = await _db
        .collection('students')
        .where(FieldPath.documentId, whereIn: studentIds)
        .get();

    return snapshot.docs.map((doc) {
      return Student.fromMap(doc.data(), doc.id);
    }).toList();
  }

  Future<void> updateParentProfile({
    required String uid,
    required String firstName,
    required String lastName,
    required String email,
  }) async {
    await _db.collection('users').doc(uid).update({
      'firstName': firstName,
      'lastName': lastName,
      'email': email,
    });
  }

  Future<void> updateStudentProfile(Student student) async {
    await _db.collection('students').doc(student.id).update({
      'firstName': student.firstName,
      'lastName': student.lastName,
    });
  }
}
