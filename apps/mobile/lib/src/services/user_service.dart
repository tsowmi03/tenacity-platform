// user_service.dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/app_user_model.dart';

class UserService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Fetches contacts for the current user.
  ///
  /// - If [currentUserRole] is 'parent', only tutors and admins are returned.
  /// - Otherwise (for tutors and admins), all users are returned.
  /// The current user (by [currentUserId]) is excluded.
  Future<List<AppUser>> getContactsForUser({
    required String currentUserId,
    required String currentUserRole,
  }) async {
    Query query;
    if (currentUserRole == 'parent') {
      // Parents can chat with tutors and admins.
      query = _firestore.collection('users').where('role', whereIn: ['tutor', 'admin']);
    } else {
      // Tutors and admins can chat with all users.
      query = _firestore.collection('users');
    }

    QuerySnapshot snapshot = await query.get();

    List<AppUser> contacts = snapshot.docs.map((doc) {
      final data = doc.data() as Map<String, dynamic>;
      return AppUser.fromFirestore(data, doc.id);
    }).toList();

    // Exclude the current user.
    contacts.removeWhere((contact) => contact.uid == currentUserId);
    return contacts;
  }
}
