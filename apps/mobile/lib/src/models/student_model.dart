class Student {
  final String id;
  final String firstName;
  final String lastName;
  final String parentId;
  final int? remainingTokens;

  Student({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.parentId,
    this.remainingTokens,
  });

  factory Student.fromMap(Map<String, dynamic> data, String documentId) {
    return Student(
      id: documentId,
      firstName: data['firstName'] ?? '',
      lastName: data['lastName'] ?? '',
      parentId: data['parentId'] ?? '',
      remainingTokens: data['remainingTokens'] ?? 0,
    );
  }

  Student copyWith({
    String? name,
    String? parentId,
    int? remainingTokens,
  }) {
    return Student(
      id: id,
      firstName: firstName,
      lastName: lastName,
      parentId: parentId ?? this.parentId,
      remainingTokens: remainingTokens ?? this.remainingTokens,
    );
  }
}