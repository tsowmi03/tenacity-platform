import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:tenacity/src/models/app_user_model.dart';

class Parent extends AppUser {
  final List<String> students;
  final int lessonTokens;

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
    this.lessonTokens = 0,
    super.termsAccepted = false,
    super.acceptedTermsVersion,
    super.acceptedTermsAt,
    super.readAnnouncements = const [],
  });

  factory Parent.fromFirestore(Map<String, dynamic> data, String uid) {
    int tokens = (data['lessonTokens'] is int)
        ? data['lessonTokens']
        : int.tryParse(data['lessonTokens']?.toString() ?? '') ?? 0;

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
      lessonTokens: tokens,
      termsAccepted: data['termsAccepted'] ?? false,
      acceptedTermsVersion: data['acceptedTermsVersion'],
      acceptedTermsAt: data['acceptedTermsAt'] != null
          ? (data['acceptedTermsAt'] as Timestamp).toDate()
          : null,
      readAnnouncements: List<String>.from(data['readAnnouncements'] ?? []),
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
    int? lessonTokens,
    bool? termsAccepted,
    String? acceptedTermsVersion,
    DateTime? acceptedTermsAt,
    List<String>? readAnnouncements,
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
      lessonTokens: lessonTokens ?? this.lessonTokens,
      termsAccepted: termsAccepted ?? this.termsAccepted,
      acceptedTermsVersion: acceptedTermsVersion ?? this.acceptedTermsVersion,
      acceptedTermsAt: acceptedTermsAt ?? this.acceptedTermsAt,
      readAnnouncements: readAnnouncements ?? this.readAnnouncements,
    );
  }
}
