import 'package:tenacity/src/models/app_user_model.dart';

class Admin extends AppUser {
  Admin({
    required super.uid,
    super.role = 'admin',
    required super.firstName,
    required super.lastName,
    required super.email,
    required super.fcmTokens,
    required super.phone,
  });

  factory Admin.fromFirestore(Map<String, dynamic> data, String uid) {
    return Admin(
      uid: uid,
      firstName: data['firstName'],
      lastName: data['lastName'],
      email: data['email'],
      role: data['role'],
      fcmTokens: List<String>.from(data['fcmTokens'] ?? []),
      phone: data['phone'],
    );
  }
  
  @override
  Admin copyWith({
    String? uid,
    String? firstName,
    String? lastName,
    String? role,
    String? email,
    List<String>? fcmTokens,
    String? phone,
  }) {
    return Admin(
      uid: uid ?? this.uid,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      role: role ?? this.role,
      email: email ?? this.email,
      fcmTokens: fcmTokens ?? this.fcmTokens,
      phone: phone ?? this.phone,
    );
  }
}