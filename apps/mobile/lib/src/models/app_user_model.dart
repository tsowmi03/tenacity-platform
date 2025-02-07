import 'package:tenacity/src/models/admin_model.dart';
import 'package:tenacity/src/models/parent_model.dart';
import 'package:tenacity/src/models/tutor_model.dart';

abstract class AppUser {
  final String uid;
  final String firstName;
  final String lastName;
  final String role;
  final String email;
  final List<String> fcmTokens;
  final String phone;
  final Map<String, int> unreadChats;
  final List<String> activeChats;
  
  AppUser({
    required this.uid,
    required this.firstName,
    required this.lastName,
    required this.role,
    required this.email,
    required this.fcmTokens,
    required this.phone,
    required this.unreadChats,
    required this.activeChats,
  });

  factory AppUser.fromFirestore(Map<String, dynamic> data, String uid) {
    final role = data['role'];

    switch (role) {
      case 'admin':
        return Admin.fromFirestore(data, uid);
      case 'tutor':
        return Tutor.fromFirestore(data, uid);
      case 'parent':
        return Parent.fromFirestore(data, uid);
      default:
        throw Exception('Unknown role: $role');
    }
  }

  AppUser copyWith({
    String? uid,
    String? firstName,
    String? lastName,
    String? role,
    String? email,
    List<String>? fcmTokens,
    String? phone,
    Map<String, int>? unreadChats,
    List<String>? activeChats,
  });
}
