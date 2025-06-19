class Student {
  final String id;
  final String firstName;
  final String lastName;
  final List<String> parents;
  final String grade;
  final String dob;
  final List<String> subjects;
  final String? primaryParentId;

  Student({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.parents,
    required this.grade,
    required this.dob,
    required this.subjects,
    this.primaryParentId,
  });

  factory Student.fromMap(Map<String, dynamic> data, String documentId) {
    return Student(
      id: documentId,
      firstName: data['firstName'] ?? '',
      lastName: data['lastName'] ?? '',
      parents: data['parents'] != null
          ? List<String>.from(data['parents'])
          : <String>[],
      grade: data['grade'] ?? '',
      dob: data['dob'] ?? '',
      subjects: data['subjects'] != null
          ? List<String>.from(data['subjects'])
          : <String>[],
      primaryParentId: data['primaryParentId'],
    );
  }

  Student copyWith({
    String? firstName,
    String? lastName,
    List<String>? parents,
    String? grade,
    String? dob,
    List<String>? subjects,
    String? primaryParentId,
  }) {
    return Student(
      id: id,
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      parents: parents ?? this.parents,
      grade: grade ?? this.grade,
      dob: dob ?? this.dob,
      subjects: subjects ?? this.subjects,
      primaryParentId: primaryParentId ?? this.primaryParentId,
    );
  }

  Map<String, dynamic> toInvoiceMap() {
    return {
      'studentName': '$firstName $lastName',
      'studentYear': grade,
      'studentSubject': subjects.isNotEmpty ? subjects.first : '',
      'primaryParentId': primaryParentId,
    };
  }
}
