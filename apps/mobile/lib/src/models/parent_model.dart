import 'package:tenacity/src/models/app_user_model.dart';

class Parent extends AppUser {
  final List<String> students;

  Parent({
    required super.uid,
    super.role = 'parent',
    required super.firstName,
    required super.lastName,
    required super.email,
    required super.fcmTokens,
    required this.students,
    required super.phone,
    required super.unreadChats,
    required super.activeChats,
  });

  factory Parent.fromFirestore(Map<String, dynamic> data, String uid) {
    return Parent(
      uid: uid,
      firstName: data['firstName'],
      lastName: data['lastName'],
      email: data['email'],
      role: data['role'],
      fcmTokens: List<String>.from(data['fcmTokens'] ?? []),
      students: List<String>.from(data['students'] ?? []),
      phone: data['phone'],
      unreadChats: Map<String, int>.from(data['unreadChats'] ?? {}),
      activeChats: List<String>.from(data['activeChats'] ?? []),
    );
  }

  @override
  Parent copyWith({
    String? uid,
    String? firstName,
    String? lastName,
    String? role,
    String? email,
    List<String>? fcmTokens,
    List<String>? students,
    String? phone,
    Map<String, int>? unreadChats,
    List<String>? activeChats,
  }) {
    return Parent(
      uid: uid ?? this.uid,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      role: role ?? this.role,
      email: email ?? this.email,
      fcmTokens: fcmTokens ?? this.fcmTokens,
      students: students ?? this.students,
      phone: phone ?? this.phone,
      unreadChats: unreadChats ?? this.unreadChats,
      activeChats: activeChats ?? this.activeChats,
    );
  }
}
