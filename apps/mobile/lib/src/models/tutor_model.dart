import 'package:tenacity/src/models/app_user_model.dart';

class Tutor extends AppUser {
  Tutor({
    required super.uid,
    required super.role,
    required super.firstName,
    required super.lastName,
    required super.email,
    required super.fcmTokens,
    required super.phone,
    required super.unreadChats,
    required super.activeChats,
  });

  factory Tutor.fromFirestore(Map<String, dynamic> data, String uid) {
    return Tutor(
      uid: uid,
      firstName: data['firstName'],
      lastName: data['lastName'],
      email: data['email'],
      role: data['role'],
      fcmTokens: List<String>.from(data['fcmTokens'] ?? []),
      phone: data['phone'],
      unreadChats: Map<String, int>.from(data['unreadChats'] ?? {}),
      activeChats: List<String>.from(data['activeChats'] ?? []),
    );
  }

  @override
  Tutor copyWith({
    String? uid,
    String? firstName,
    String? lastName,
    String? role,
    String? email,
    List<String>? fcmTokens,
    String? phone,
    Map<String, int>? unreadChats,
    List<String>? activeChats,
  }) {
    return Tutor(
      uid: uid ?? this.uid,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      role: role ?? this.role,
      email: email ?? this.email,
      fcmTokens: fcmTokens ?? this.fcmTokens,
      phone: phone ?? this.phone,
      unreadChats: unreadChats ?? this.unreadChats,
      activeChats: activeChats ?? this.activeChats,
    );
  }
}
