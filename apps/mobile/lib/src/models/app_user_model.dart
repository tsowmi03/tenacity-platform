class AppUser {
  final String uid;
  final String? email;
  final String? role;
  final String? firstName;
  final String? lastName;
  final List<String> fcmTokens;

  AppUser({
    required this.uid,
    required this.email,
    required this.role,
    required this.firstName,
    required this.lastName,
    required this.fcmTokens,
  });

  // TODO: implement fromMap/toMap logic
  factory AppUser.fromMap(Map<String, dynamic> map, String docId) {
    return AppUser(
      uid: docId,
      email: map['email'] as String?,
      role: map['role'] as String?,
      firstName: map['firstName'] as String?,
      lastName: map['lastName'] as String?,
      fcmTokens: map['fcmTokens'] == null ? [] : List<String>.from(map['fcmTokens'])
    );
  }
}