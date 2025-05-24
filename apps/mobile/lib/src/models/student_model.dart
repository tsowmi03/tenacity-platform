class Student {
  final String id;
  final String firstName;
  final String lastName;
  final List<String> parents;
  final int? lessonTokens;
  final String grade;
  final String dob;
  final List<String> subjects;

  Student({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.parents,
    this.lessonTokens,
    required this.grade,
    required this.dob,
    required this.subjects,
  });

  factory Student.fromMap(Map<String, dynamic> data, String documentId) {
    return Student(
      id: documentId,
      firstName: data['firstName'] ?? '',
      lastName: data['lastName'] ?? '',
      parents: data['parents'] != null
          ? List<String>.from(data['parents'])
          : <String>[],
      lessonTokens: data['lessonTokens'] ?? 0,
      grade: data['grade'] ?? '',
      dob: data['dob'] ?? '',
      subjects: data['subjects'] != null
          ? List<String>.from(data['subjects'])
          : <String>[],
    );
  }

  Student copyWith({
    String? firstName,
    String? lastName,
    List<String>? parents,
    int? lessonTokens,
    String? grade,
    String? dob,
    List<String>? subjects,
  }) {
    return Student(
      id: id,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      parents: parents ?? this.parents,
      lessonTokens: lessonTokens ?? this.lessonTokens,
      grade: grade ?? this.grade,
      dob: dob ?? this.dob,
      subjects: subjects ?? this.subjects,
    );
  }

  Map<String, dynamic> toInvoiceMap() {
    return {
      'studentName': '$firstName $lastName',
      'studentYear': grade,
      'studentSubject': subjects.isNotEmpty ? subjects.first : '',
    };
  }
}
