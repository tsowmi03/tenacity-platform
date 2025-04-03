import 'package:flutter/foundation.dart';

@immutable
class ClassModel {
  final String id;
  final String type;
  final String dayOfWeek;
  final String startTime;
  final String endTime;
  final int capacity;
  final List<String> enrolledStudents;
  final List<String> tutors;

  const ClassModel({
    required this.id,
    required this.type,
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    required this.enrolledStudents,
    required this.tutors,
  });

  factory ClassModel.fromMap(Map<String, dynamic> data, String documentId) {
    return ClassModel(
      id: documentId,
      type: data['type'] ?? '',
      dayOfWeek: data['day'] ?? '',
      startTime: data['startTime'] ?? '',
      endTime: data['endTime'] ?? '',
      capacity: data['capacity'] ?? 0,
      enrolledStudents: List<String>.from(data['enrolledStudents'] ?? []),
      tutors: List<String>.from(data['tutors'] ?? []),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'day': dayOfWeek,
      'startTime': startTime,
      'endTime': endTime,
      'capacity': capacity,
      'enrolledStudents': enrolledStudents,
      'tutors': tutors,
    };
  }

  ClassModel copyWith({
    String? id,
    String? type,
    String? dayOfWeek,
    String? startTime,
    String? endTime,
    int? capacity,
    List<String>? enrolledStudents,
    List<String>? tutors,
  }) {
    return ClassModel(
      id: id ?? this.id,
      type: type ?? this.type,
      dayOfWeek: dayOfWeek ?? this.dayOfWeek,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      capacity: capacity ?? this.capacity,
      enrolledStudents: enrolledStudents ?? this.enrolledStudents,
      tutors: tutors ?? this.tutors,
    );
  }
}
