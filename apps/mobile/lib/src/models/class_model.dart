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

  const ClassModel({
    required this.id,
    required this.type,
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.capacity,
    required this.enrolledStudents,
  });

  factory ClassModel.fromMap(Map<String, dynamic> data, String documentId) {
    return ClassModel(
      id: documentId,
      type: data['type'] ?? '',           // or 'subject' if in your Firestore
      dayOfWeek: data['day'] ?? '',
      startTime: data['startTime'] ?? '',
      endTime: data['endTime'] ?? '',
      capacity: data['capacity'] ?? 0,
      enrolledStudents: List<String>.from(data['enrolledStudents'] ?? []),
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
  }) {
    return ClassModel(
      id: id ?? this.id,
      type: type ?? this.type,
      dayOfWeek: dayOfWeek ?? this.dayOfWeek,
      startTime: startTime ?? this.startTime,
      endTime: endTime ?? this.endTime,
      capacity: capacity ?? this.capacity,
      enrolledStudents: enrolledStudents ?? this.enrolledStudents,
    );
  }
}
