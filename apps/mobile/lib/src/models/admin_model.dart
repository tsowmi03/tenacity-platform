import 'package:cloud_firestore/cloud_firestore.dart';
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
    required super.unreadChats,
    required super.activeChats,
    super.termsAccepted,
    super.acceptedTermsVersion,
    super.acceptedTermsAt,
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
      unreadChats: Map<String, int>.from(data['unreadChats'] ?? {}),
      activeChats: List<String>.from(data['activeChats'] ?? []),
      termsAccepted: data['termsAccepted'] ?? false,
      acceptedTermsVersion: data['acceptedTermsVersion'],
      acceptedTermsAt: data['acceptedTermsAt'] != null
          ? (data['acceptedTermsAt'] as Timestamp).toDate()
          : null,
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
    Map<String, int>? unreadChats,
    List<String>? activeChats,
    bool? termsAccepted,
    String? acceptedTermsVersion,
    DateTime? acceptedTermsAt,
  }) {
    return Admin(
      uid: uid ?? this.uid,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      role: role ?? this.role,
      email: email ?? this.email,
      fcmTokens: fcmTokens ?? this.fcmTokens,
      phone: phone ?? this.phone,
      unreadChats: unreadChats ?? this.unreadChats,
      activeChats: activeChats ?? this.activeChats,
      termsAccepted: termsAccepted ?? this.termsAccepted,
      acceptedTermsVersion: acceptedTermsVersion ?? this.acceptedTermsVersion,
      acceptedTermsAt: acceptedTermsAt ?? this.acceptedTermsAt,
    );
  }
}
